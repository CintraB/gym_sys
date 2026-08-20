-- Migração para um banco que já existe: edição de treino (PUT).
--
-- Só é necessária se você já tem dados. Em banco novo, use schema.sql direto.
-- Faça backup antes:
--   pg_dump -U <usuario> <banco> > backup.sql
--
--   psql -U <usuario> -d <banco> -f db/migracao-v5-edicao-treino.sql

BEGIN;

-- Bloco removido na edição do treino precisa ser desativado, não apagado:
-- sessao_treino.id_bloco referencia treino_bloco sem ON DELETE CASCADE, então
-- um DELETE quebraria a FK das sessões já executadas. Com a coluna, o bloco
-- some das telas e o histórico continua sabendo dizer "Treino B".
ALTER TABLE treino_bloco ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;

-- O bloco desativado guarda a própria letra, para o histórico continuar dizendo
-- "Treino B". Sem o WHERE, essa letra ficaria reservada e a renumeração
-- (removido o B de A/B/C, o C vira B) esbarraria no índice.
DROP INDEX IF EXISTS idx_bloco_letra_por_treino;
CREATE UNIQUE INDEX idx_bloco_letra_por_treino
    ON treino_bloco (id_treino, letra) WHERE ativo;

COMMIT;
