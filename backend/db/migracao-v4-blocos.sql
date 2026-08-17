-- Migração: divisão do treino em blocos (A/B/C/D).
--
-- Só adiciona. Os treinos que já existem viram um bloco "A" com todos os
-- exercícios que já tinham — nada muda de lugar para o aluno.
--
--   psql -U <usuario> -d <banco> -f db/migracao-v4-blocos.sql

BEGIN;

CREATE TABLE IF NOT EXISTS treino_bloco (
    id_bloco   SERIAL PRIMARY KEY,
    id_treino  INTEGER     NOT NULL REFERENCES treino (id_treino) ON DELETE CASCADE,
    letra      VARCHAR(2)  NOT NULL,
    nome       VARCHAR(60),
    ordem      SMALLINT    NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bloco_letra_por_treino
    ON treino_bloco (id_treino, letra);
CREATE INDEX IF NOT EXISTS idx_bloco_treino ON treino_bloco (id_treino, ordem);

ALTER TABLE ex_usuario    ADD COLUMN IF NOT EXISTS id_bloco INTEGER;
ALTER TABLE sessao_treino ADD COLUMN IF NOT EXISTS id_bloco INTEGER;

-- Um bloco "A" para cada treino que ainda não tem nenhum.
INSERT INTO treino_bloco (id_treino, letra, ordem)
SELECT t.id_treino, 'A', 1
  FROM treino t
 WHERE NOT EXISTS (SELECT 1 FROM treino_bloco b WHERE b.id_treino = t.id_treino);

-- Todo exercício existente passa a pertencer ao bloco A do seu treino.
UPDATE ex_usuario eu
   SET id_bloco = b.id_bloco
  FROM treino_bloco b
 WHERE b.id_treino = eu.id_treino
   AND eu.id_bloco IS NULL;

-- Sessões já registradas também apontam para o bloco A.
UPDATE sessao_treino s
   SET id_bloco = b.id_bloco
  FROM treino_bloco b
 WHERE b.id_treino = s.id_treino
   AND s.id_bloco IS NULL;

COMMIT;

-- Confira que não sobrou exercício sem bloco:
--
--   SELECT COUNT(*) FROM ex_usuario WHERE id_bloco IS NULL;
--
-- Sendo 0, feche o contrato:

BEGIN;

ALTER TABLE ex_usuario ALTER COLUMN id_bloco SET NOT NULL;

ALTER TABLE ex_usuario DROP CONSTRAINT IF EXISTS ex_usuario_id_bloco_fkey;
ALTER TABLE ex_usuario
  ADD CONSTRAINT ex_usuario_id_bloco_fkey
  FOREIGN KEY (id_bloco) REFERENCES treino_bloco (id_bloco) ON DELETE CASCADE;

ALTER TABLE sessao_treino DROP CONSTRAINT IF EXISTS sessao_treino_id_bloco_fkey;
ALTER TABLE sessao_treino
  ADD CONSTRAINT sessao_treino_id_bloco_fkey
  FOREIGN KEY (id_bloco) REFERENCES treino_bloco (id_bloco);

CREATE INDEX IF NOT EXISTS idx_ex_usuario_bloco ON ex_usuario (id_bloco);

COMMIT;
