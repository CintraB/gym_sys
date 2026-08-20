-- Migração para um banco que já existe: perfil de admin e troca de senha.
--
-- Só é necessária se você já tem dados. Em banco novo, use schema.sql direto.
-- Faça backup antes:
--   pg_dump -U <usuario> <banco> > backup.sql
--
--   psql -U <usuario> -d <banco> -f db/migracao-v6-admin.sql
--
-- Depois de aplicar, crie o primeiro admin:
--   npm run criar-admin -- --cpf ... --nome "..." --senha "..." --email ...

BEGIN;

ALTER TABLE usuario ADD COLUMN IF NOT EXISTS admin BOOLEAN NOT NULL DEFAULT FALSE;

-- NULL quer dizer "nunca trocou a senha". Precisa nascer NULL: um DEFAULT NOW()
-- aqui invalidaria, de uma vez, o token de todo mundo que está logado.
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS senha_alterada_em TIMESTAMPTZ;

COMMIT;
