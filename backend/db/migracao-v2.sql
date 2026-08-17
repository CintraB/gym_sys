-- Migração para um banco que já existe (schema anterior, sem id_treino).
--
-- Só é necessária se você já tem dados. Em banco novo, use schema.sql direto.
-- Faça backup antes:
--   pg_dump -U <usuario> <banco> > backup.sql
--
--   psql -U <usuario> -d <banco> -f db/migracao-v2.sql

BEGIN;

-- 1. Chave primária em ex_usuario (a tabela não tinha nenhuma).
ALTER TABLE ex_usuario ADD COLUMN IF NOT EXISTS id SERIAL;
ALTER TABLE ex_usuario DROP CONSTRAINT IF EXISTS ex_usuario_pkey;
ALTER TABLE ex_usuario ADD PRIMARY KEY (id);

-- 2. Ligação com o treino. Entra como NULL para permitir o backfill.
ALTER TABLE ex_usuario ADD COLUMN IF NOT EXISTS id_treino INTEGER;

-- 3. Backfill: liga cada exercício ao treino do próprio aluno.
--    Como o vínculo não existia, o critério é o melhor palpite possível —
--    prefere o treino cujo status "ativo" bate com o do exercício e, entre
--    esses, o mais recente.
UPDATE ex_usuario eu
   SET id_treino = (
       SELECT t.id_treino
         FROM treino t
        WHERE t.id_aluno = eu.id_user
        ORDER BY (t.ativo = eu.ativo) DESC, t.criado_em DESC
        LIMIT 1
   )
 WHERE eu.id_treino IS NULL;

COMMIT;

-- 4. Confira se sobrou algo sem treino (exercícios de alunos que nunca
--    tiveram um registro em `treino`):
--
--      SELECT COUNT(*) FROM ex_usuario WHERE id_treino IS NULL;
--
--    Se o resultado for 0, rode o bloco abaixo para fechar o contrato.
--    Se for maior que 0, decida antes o que fazer com essas linhas
--    (criar um treino histórico para elas, ou apagá-las).

-- ALTER TABLE ex_usuario ALTER COLUMN id_treino SET NOT NULL;
-- ALTER TABLE ex_usuario
--   ADD CONSTRAINT ex_usuario_id_treino_fkey
--   FOREIGN KEY (id_treino) REFERENCES treino (id_treino) ON DELETE CASCADE;

-- 5. Um pedido novo deve nascer em aberto. O default antigo era FALSE.
ALTER TABLE pedido_treino ALTER COLUMN ativo SET DEFAULT TRUE;

-- 6. Índices.
CREATE INDEX IF NOT EXISTS idx_usuario_cpf        ON usuario (cpf);
CREATE INDEX IF NOT EXISTS idx_treino_aluno_ativo ON treino (id_aluno, ativo);
CREATE INDEX IF NOT EXISTS idx_ex_usuario_treino  ON ex_usuario (id_treino);
CREATE INDEX IF NOT EXISTS idx_ex_usuario_user    ON ex_usuario (id_user, ativo);
CREATE INDEX IF NOT EXISTS idx_pedido_aluno_ativo ON pedido_treino (id_aluno, ativo);
CREATE INDEX IF NOT EXISTS idx_exercicio_tipo     ON exercicio (tipo);
