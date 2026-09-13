-- Migracao para um banco que ja existe: identidade das linhas que sobem do APK.
--
-- O aparelho gera o uuid antes de subir, e o indice unico e o que faz subir o
-- mesmo pacote duas vezes resultar numa linha so. Quatro tabelas, porque o
-- pedido de treino tambem nasce no aluno.
--
-- Nula de proposito: o banco do Supabase ja tem sessoes gravadas e a migracao
-- roda sobre elas. Nulo nao entra em indice unico, entao elas nao colidem.
--
-- So e necessaria se voce ja tem dados. Em banco novo, use schema.sql direto.
-- Faca backup antes:
--   pg_dump -U <usuario> <banco> > backup.sql
--
--   psql -U <usuario> -d <banco> -f db/migracao-v8-uuid.sql

BEGIN;

ALTER TABLE sessao_treino    ADD COLUMN IF NOT EXISTS uuid UUID;
ALTER TABLE sessao_exercicio ADD COLUMN IF NOT EXISTS uuid UUID;
ALTER TABLE sessao_serie     ADD COLUMN IF NOT EXISTS uuid UUID;
ALTER TABLE pedido_treino    ADD COLUMN IF NOT EXISTS uuid UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessao_treino_uuid    ON sessao_treino (uuid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessao_exercicio_uuid ON sessao_exercicio (uuid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessao_serie_uuid     ON sessao_serie (uuid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedido_treino_uuid    ON pedido_treino (uuid);

COMMIT;
