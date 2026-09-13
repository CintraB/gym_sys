-- O que o Supabase dá pronto e um Postgres puro não tem.
--
-- Só para a suíte de RLS. No projeto do Supabase estes objetos já existem —
-- aplicar este arquivo lá sobrescreveria coisa da plataforma.
--
-- `auth.jwt()` é a peça que importa: no Supabase ela lê as claims que o
-- PostgREST põe em `request.jwt.claims` a cada requisição. Reproduzir a mesma
-- leitura é o que faz o teste exercitar a política de verdade, e não uma
-- versão de mentira dela.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim',  true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

-- NOLOGIN: ninguém entra por eles; o PostgREST faz SET ROLE depois de validar
-- o token. A suíte imita exatamente isso.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE ON SCHEMA auth   TO anon, authenticated;
