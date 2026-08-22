-- Migração para um banco que já existe: trocar o CPF derruba as sessões.
--
-- O CPF é o login. Antes disto, só a troca de senha invalidava token, e a
-- coluna se chamava `senha_alterada_em`. Ela sempre foi o corte de validade dos
-- tokens, não um registro sobre a senha — agora que a troca de CPF também
-- escreve nela, o nome antigo mentiria.
--
-- Só é necessária se você já tem dados. Em banco novo, use schema.sql direto.
-- Faça backup antes:
--   pg_dump -U <usuario> <banco> > backup.sql
--
--   psql -U <usuario> -d <banco> -f db/migracao-v7-login.sql

BEGIN;

-- Idempotente pelas duas pontas: renomeia se a coluna antiga ainda existe,
-- cria se nenhuma das duas existe (banco anterior à v6), e não faz nada se já
-- está no formato novo. Rodar duas vezes não quebra.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'usuario' AND column_name = 'senha_alterada_em'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'usuario' AND column_name = 'sessoes_invalidadas_em'
    ) THEN
        ALTER TABLE usuario RENAME COLUMN senha_alterada_em TO sessoes_invalidadas_em;
    END IF;
END $$;

-- Precisa nascer NULL: um DEFAULT NOW() aqui invalidaria, de uma vez, o token
-- de todo mundo que está logado.
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS sessoes_invalidadas_em TIMESTAMPTZ;

COMMIT;
