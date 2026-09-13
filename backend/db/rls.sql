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
