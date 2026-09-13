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

-- A plataforma da os dois papeis com ALL em toda tabela do schema public, por
-- default privilege -- e nao "sem nada", que e como um Postgres puro nasce.
--
-- Reproduzir isso aqui nao e detalhe: descoberto em 13/09/2026, ao aplicar o
-- rls.sql no projeto real. O REVOKE citava so `anon`, entao `authenticated`
-- ficou com TRUNCATE e TRIGGER em TODA tabela, inclusive admin_user e
-- regras_usuario. TRUNCATE **ignora RLS**: com a Data API aberta, qualquer
-- conta logada esvaziaria o banco, e nenhuma politica veria isso passar.
--
-- Sem estas duas linhas o container nascia mais fechado que o Supabase, e a
-- suite dava verde num estado que nao existe em producao.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
