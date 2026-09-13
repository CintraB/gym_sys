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
