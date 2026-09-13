-- Autorizacao em SQL: papeis, grants, identidade e politicas.
--
-- Fica fora do schema.sql pelo mesmo motivo do triggers.sql: o pg-mem da suite
-- principal nao executa plpgsql. Aplicado no Supabase e no container da suite
-- de RLS, nunca no docker-compose de desenvolvimento.
--
-- Aplicar:  psql -U <usuario> -d <banco> -f db/rls.sql

-- ---------------------------------------------------------------------------
-- Trava de tentativas, usada pela Edge Function de identidade (leva 2).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION registrar_tentativa(p_cpf TEXT, p_sucesso BOOLEAN)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_falhas INTEGER;
BEGIN
  INSERT INTO public.tentativa_login (cpf, sucesso) VALUES (p_cpf, p_sucesso);

  -- Sucesso zera: quem acertou a senha nao fica de castigo pelas tentativas
  -- anteriores. Apagar em vez de ignorar mantem a tabela pequena sozinha.
  IF p_sucesso THEN
    DELETE FROM public.tentativa_login
     WHERE cpf = p_cpf AND NOT sucesso;
    RETURN 0;
  END IF;

  SELECT count(*) INTO v_falhas
    FROM public.tentativa_login
   WHERE cpf = p_cpf
     AND NOT sucesso
     AND ocorrida_em > NOW() - INTERVAL '15 minutes';

  RETURN v_falhas;
END;
$$;

-- A tabela nao e legivel por ninguem: um token roubado nao enumera CPF por ela.
-- So a funcao acima toca nela, e ela e SECURITY DEFINER.
REVOKE ALL ON public.tentativa_login FROM PUBLIC, anon, authenticated;

-- REVOKE de PUBLIC antes do GRANT: o default do Postgres e EXECUTE para PUBLIC,
-- e revogar so de anon/authenticated roda sem erro e sem efeito — a licao de
-- 06/09/2026.
REVOKE ALL ON FUNCTION registrar_tentativa(TEXT, BOOLEAN) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Identidade: quem e o dono do token, e o que ele e.
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER porque politica em `usuario` que consulta `usuario` estoura
-- em recursao. STABLE porque o resultado nao muda dentro do mesmo comando: o
-- planejador avalia uma vez, e nao uma vez por linha.
--
-- search_path = '' nao e estilo: sem ele, SECURITY DEFINER vira escalada de
-- privilegio, porque quem controla o search_path escolhe qual tabela a funcao
-- enxerga. Com ele, todo nome tem de vir qualificado.
CREATE OR REPLACE FUNCTION auth_id_valido() RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT u.id
    FROM public.usuario u
   WHERE u.id = nullif(auth.jwt() ->> 'sub', '')::INTEGER
     AND u.ativo
     -- O corte de sessao, o mesmo de src/middlewares/auth.js: token emitido
     -- antes da troca de credencial nao vale. O floor reproduz a resolucao de
     -- segundos do iat -- sem ele, um corte com milissegundos recusaria um
     -- token que o backend aceita, e as duas portas divergiriam.
     AND (
       u.sessoes_invalidadas_em IS NULL
       OR (auth.jwt() ->> 'iat')::BIGINT
          >= floor(extract(epoch FROM u.sessoes_invalidadas_em))
     )
$$;

-- Le do banco, e nao do JWT, de proposito: com o perfil carimbado num token de
-- 30 dias, professor rebaixado seguiria professor por 30 dias. Hoje o
-- `autenticar` consulta o banco a cada requisicao, e isso mantem a propriedade.
CREATE OR REPLACE FUNCTION auth_e_professor() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT u.professor FROM public.usuario u WHERE u.id = public.auth_id_valido()),
    FALSE)
$$;

CREATE OR REPLACE FUNCTION auth_e_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT u.admin FROM public.usuario u WHERE u.id = public.auth_id_valido()),
    FALSE)
$$;

-- O default do Postgres e EXECUTE para PUBLIC. Revogar so de anon/authenticated
-- roda sem erro e sem efeito nenhum -- foi o que aconteceu em 06/09/2026.
REVOKE ALL ON FUNCTION auth_id_valido()   FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_e_professor() FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_e_admin()     FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_id_valido()   TO authenticated;
GRANT EXECUTE ON FUNCTION auth_e_professor() TO authenticated;
GRANT EXECUTE ON FUNCTION auth_e_admin()     TO authenticated;

-- ---------------------------------------------------------------------------
-- Camada 1: o GRANT. Sem ele o RLS e redundante; sem o RLS ele e buraco.
-- ---------------------------------------------------------------------------

-- O anon nao ganha nada em lugar nenhum, e continua assim depois desta leva.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Coluna a coluna onde importa: `senha` fica de fora, e nao ha SELECT que a
-- alcance -- nem o do proprio dono. As politicas filtram linha; o grant filtra
-- coluna, e sao coisas diferentes.
GRANT SELECT (id, nome, cpf, email, titulo, aluno, professor, admin, ativo, criado_em)
  ON usuario TO authenticated;
GRANT INSERT, UPDATE (nome, cpf, email, titulo, aluno, professor, ativo, atualizado_em, atualizado_por)
  ON usuario TO authenticated;

GRANT SELECT, INSERT          ON exercicio      TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON treino         TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON treino_bloco   TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON ex_usuario     TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON pedido_treino  TO authenticated;
GRANT SELECT, INSERT          ON sessao_treino  TO authenticated;
GRANT SELECT, INSERT          ON sessao_exercicio TO authenticated;
GRANT SELECT, INSERT          ON sessao_serie   TO authenticated;

-- SERIAL precisa da sequencia, senao o INSERT permitido falha na hora de gerar
-- o id -- e o erro nao parece de permissao.
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- admin_user e regras_usuario ficam de fora de proposito: o app nunca as toca.

-- ---------------------------------------------------------------------------
-- Camada 2: liga o RLS. A partir daqui, sem politica ninguem ve linha nenhuma.
-- ---------------------------------------------------------------------------

ALTER TABLE usuario          ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercicio        ENABLE ROW LEVEL SECURITY;
ALTER TABLE treino           ENABLE ROW LEVEL SECURITY;
ALTER TABLE treino_bloco     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ex_usuario       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_treino    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessao_treino    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessao_exercicio ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessao_serie     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tentativa_login  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Camada 3: as politicas. Leitura.
-- ---------------------------------------------------------------------------
--
-- Uma politica por acao e por papel, e nao uma politica generica com OR: com
-- politicas separadas, o Postgres soma (OR) as PERMISSIVE automaticamente, e
-- cada uma fica legivel sozinha. Vermelho aqui e vulnerabilidade, nao teste
-- desatualizado -- mesma regra do seguranca.test.js.

CREATE POLICY usuario_le_a_si ON usuario FOR SELECT TO authenticated
  USING (id = auth_id_valido());

CREATE POLICY usuario_professor_le ON usuario FOR SELECT TO authenticated
  USING (auth_e_professor() OR auth_e_admin());

-- Catalogo e publico para quem esta autenticado: nao tem dono nem dado pessoal.
CREATE POLICY exercicio_le ON exercicio FOR SELECT TO authenticated
  USING (auth_id_valido() IS NOT NULL);

CREATE POLICY treino_le_o_proprio ON treino FOR SELECT TO authenticated
  USING (id_aluno = auth_id_valido());
CREATE POLICY treino_professor_le ON treino FOR SELECT TO authenticated
  USING (auth_e_professor() OR auth_e_admin());

-- treino_bloco nao tem id_aluno: o dono vem pelo treino. EXISTS em vez de IN
-- porque o planejador para no primeiro acerto.
CREATE POLICY bloco_le_o_proprio ON treino_bloco FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM treino t
                  WHERE t.id_treino = treino_bloco.id_treino
                    AND t.id_aluno = auth_id_valido()));
CREATE POLICY bloco_professor_le ON treino_bloco FOR SELECT TO authenticated
  USING (auth_e_professor() OR auth_e_admin());

-- ex_usuario tem id_user desnormalizado; usar ele evita um join por linha.
CREATE POLICY ex_le_o_proprio ON ex_usuario FOR SELECT TO authenticated
  USING (id_user = auth_id_valido());
CREATE POLICY ex_professor_le ON ex_usuario FOR SELECT TO authenticated
  USING (auth_e_professor() OR auth_e_admin());

CREATE POLICY pedido_le_o_proprio ON pedido_treino FOR SELECT TO authenticated
  USING (id_aluno = auth_id_valido());
CREATE POLICY pedido_professor_le ON pedido_treino FOR SELECT TO authenticated
  USING (auth_e_professor() OR auth_e_admin());

CREATE POLICY sessao_le_a_propria ON sessao_treino FOR SELECT TO authenticated
  USING (id_aluno = auth_id_valido());
CREATE POLICY sessao_professor_le ON sessao_treino FOR SELECT TO authenticated
  USING (auth_e_professor() OR auth_e_admin());

CREATE POLICY sessao_ex_le ON sessao_exercicio FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sessao_treino s
                  WHERE s.id_sessao = sessao_exercicio.id_sessao
                    AND s.id_aluno = auth_id_valido()));
CREATE POLICY sessao_ex_professor_le ON sessao_exercicio FOR SELECT TO authenticated
  USING (auth_e_professor() OR auth_e_admin());

CREATE POLICY sessao_serie_le ON sessao_serie FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sessao_exercicio se
                   JOIN sessao_treino s ON s.id_sessao = se.id_sessao
                  WHERE se.id = sessao_serie.id_sessao_exercicio
                    AND s.id_aluno = auth_id_valido()));
CREATE POLICY sessao_serie_professor_le ON sessao_serie FOR SELECT TO authenticated
  USING (auth_e_professor() OR auth_e_admin());
