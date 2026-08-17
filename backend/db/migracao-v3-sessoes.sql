-- Migração: execução de treinos (sessões).
--
-- Aplicar em um banco que já existe. Só adiciona — nada é alterado ou apagado.
--
--   psql -U <usuario> -d <banco> -f db/migracao-v3-sessoes.sql

BEGIN;

CREATE TABLE IF NOT EXISTS sessao_treino (
    id_sessao         SERIAL PRIMARY KEY,
    id_treino         INTEGER   NOT NULL REFERENCES treino (id_treino) ON DELETE CASCADE,
    id_aluno          INTEGER   NOT NULL REFERENCES usuario (id),
    iniciado_em       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finalizado_em     TIMESTAMPTZ,
    duracao_segundos  INTEGER
);

CREATE TABLE IF NOT EXISTS sessao_exercicio (
    id             SERIAL PRIMARY KEY,
    id_sessao      INTEGER   NOT NULL REFERENCES sessao_treino (id_sessao) ON DELETE CASCADE,
    id_ex_usuario  INTEGER   NOT NULL REFERENCES ex_usuario (id) ON DELETE CASCADE,
    concluido      BOOLEAN   NOT NULL DEFAULT FALSE,
    concluido_em   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessao_aluno ON sessao_treino (id_aluno, iniciado_em);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessao_exercicio_unico
    ON sessao_exercicio (id_sessao, id_ex_usuario);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessao_aberta_por_aluno
    ON sessao_treino (id_aluno) WHERE finalizado_em IS NULL;

COMMIT;
