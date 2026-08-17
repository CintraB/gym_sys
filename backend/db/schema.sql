-- Gym Sys - schema PostgreSQL
--
-- Aplicar em um banco vazio, nesta ordem:
--   psql -U <usuario> -d <banco> -f db/schema.sql
--   psql -U <usuario> -d <banco> -f db/triggers.sql
--   psql -U <usuario> -d <banco> -f db/seed.sql
--
-- Para atualizar um banco que ja existe da versao anterior, use db/migracao-v2.sql.

-- Administradores. Ainda nao usada pela API — reservada para a gestao de
-- professores (ver "pendencias" no README).
CREATE TABLE IF NOT EXISTS admin_user (
    id_admin        SERIAL PRIMARY KEY,
    cpf             VARCHAR(11)  NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL,
    nome            VARCHAR(60)  NOT NULL,
    senha           VARCHAR(255) NOT NULL,
    atualizado_em   TIMESTAMP,
    atualizado_por  INTEGER,
    criado_em       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Aluno e professor sao o mesmo registro, distinguidos pelas flags.
CREATE TABLE IF NOT EXISTS usuario (
    id              SERIAL PRIMARY KEY,
    nome            VARCHAR(60)  NOT NULL,
    senha           VARCHAR(255) NOT NULL,
    cpf             VARCHAR(11)  NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL,
    titulo          VARCHAR(12)  NOT NULL,
    aluno           BOOLEAN      NOT NULL DEFAULT TRUE,
    professor       BOOLEAN      NOT NULL DEFAULT FALSE,
    ativo           BOOLEAN      NOT NULL DEFAULT TRUE,
    atualizado_em   TIMESTAMP,
    atualizado_por  INTEGER,
    criado_em       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Permissoes por usuario. Ainda nao usada pela API.
CREATE TABLE IF NOT EXISTS regras_usuario (
    regra_cpf       VARCHAR(11) PRIMARY KEY REFERENCES usuario (cpf),
    ver             BOOLEAN     NOT NULL DEFAULT TRUE,
    alterar         BOOLEAN     NOT NULL DEFAULT FALSE,
    apagar          BOOLEAN     NOT NULL DEFAULT FALSE,
    atualizado_em   TIMESTAMP,
    atualizado_por  INTEGER,
    criado_em       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- nome_exercicio nao e unico de proposito: o mesmo nome aparece em tipos
-- diferentes (CROSS OVER existe em BICEPS e em TRICEPS).
CREATE TABLE IF NOT EXISTS exercicio (
    id_exercicio    SERIAL PRIMARY KEY,
    nome_exercicio  VARCHAR(90)  NOT NULL,
    tipo            VARCHAR(60)  NOT NULL,
    observacao      VARCHAR(255),
    criado_em       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pedido_treino (
    id_pedido   SERIAL PRIMARY KEY,
    id_aluno    INTEGER      NOT NULL REFERENCES usuario (id),
    -- DEFAULT TRUE: um pedido nasce em aberto. A API insere o valor
    -- explicitamente de qualquer forma, para funcionar tambem em bancos
    -- antigos onde o default era FALSE.
    ativo       BOOLEAN      NOT NULL DEFAULT TRUE,
    observacao  VARCHAR(255),
    criado_em   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS treino (
    id_treino     SERIAL PRIMARY KEY,
    id_aluno      INTEGER   NOT NULL REFERENCES usuario (id),
    id_professor  INTEGER   NOT NULL REFERENCES usuario (id),
    ativo         BOOLEAN   NOT NULL DEFAULT TRUE,
    criado_em     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Divisao do treino em blocos (o A/B/C/D das fichas de academia).
--
-- Todo treino tem pelo menos um bloco: treino sem divisao e um bloco "A"
-- sozinho. Isso evita dois caminhos no codigo — nao existe exercicio solto.
CREATE TABLE IF NOT EXISTS treino_bloco (
    id_bloco   SERIAL PRIMARY KEY,
    id_treino  INTEGER     NOT NULL REFERENCES treino (id_treino) ON DELETE CASCADE,
    letra      VARCHAR(2)  NOT NULL,
    -- Opcional: "Peito e Triceps". Em branco, a tela mostra so "Treino A".
    nome       VARCHAR(60),
    ordem      SMALLINT    NOT NULL DEFAULT 1
);

-- Exercicios de um treino.
--
-- id_treino e a ligacao correta e e o que torna o historico possivel: sem ele
-- so existiria "o treino atual". id_user continua desnormalizado porque varias
-- consultas filtram direto pelo aluno.
--
-- numero_serie e carga aceitam 0, e repeticoes aceita vazio, porque exercicios
-- de cardio (esteira, bicicleta) sao registrados so com a observacao.
CREATE TABLE IF NOT EXISTS ex_usuario (
    id                     SERIAL PRIMARY KEY,
    id_treino              INTEGER      NOT NULL REFERENCES treino (id_treino) ON DELETE CASCADE,
    id_bloco               INTEGER      NOT NULL REFERENCES treino_bloco (id_bloco) ON DELETE CASCADE,
    id_user                INTEGER      NOT NULL REFERENCES usuario (id),
    id_exercicio           INTEGER      NOT NULL REFERENCES exercicio (id_exercicio),
    numero_serie           INTEGER      NOT NULL DEFAULT 0,
    carga                  INTEGER      NOT NULL DEFAULT 0,
    repeticoes             VARCHAR(30)  NOT NULL DEFAULT '',
    observacao_ex_usuario  VARCHAR(60),
    ativo                  BOOLEAN      NOT NULL DEFAULT TRUE,
    atualizado_em          TIMESTAMP,
    atualizado_por         INTEGER,
    criado_em              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Execução de um treino: o aluno inicia, marca os exercícios conforme faz, e
-- finaliza. `treino` é a prescrição; `sessao_treino` é cada vez que ela foi
-- executada.
--
-- A duração é derivada dos dois timestamps no servidor e gravada em
-- duracao_segundos ao finalizar — o cronômetro da tela é só apresentação.
CREATE TABLE IF NOT EXISTS sessao_treino (
    id_sessao         SERIAL PRIMARY KEY,
    id_treino         INTEGER   NOT NULL REFERENCES treino (id_treino) ON DELETE CASCADE,
    -- Qual bloco foi executado nesta sessao. E o que permite o historico dizer
    -- "Treino B" e a sugestao saber qual vem em seguida.
    id_bloco          INTEGER   REFERENCES treino_bloco (id_bloco),
    id_aluno          INTEGER   NOT NULL REFERENCES usuario (id),
    iniciado_em       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- NULL enquanto o treino está em andamento.
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

CREATE INDEX IF NOT EXISTS idx_usuario_cpf        ON usuario (cpf);
CREATE INDEX IF NOT EXISTS idx_treino_aluno_ativo ON treino (id_aluno, ativo);
CREATE INDEX IF NOT EXISTS idx_ex_usuario_treino  ON ex_usuario (id_treino);
CREATE INDEX IF NOT EXISTS idx_ex_usuario_user    ON ex_usuario (id_user, ativo);
CREATE INDEX IF NOT EXISTS idx_pedido_aluno_ativo ON pedido_treino (id_aluno, ativo);
CREATE INDEX IF NOT EXISTS idx_exercicio_tipo     ON exercicio (tipo);
CREATE INDEX IF NOT EXISTS idx_sessao_aluno       ON sessao_treino (id_aluno, iniciado_em);
CREATE INDEX IF NOT EXISTS idx_bloco_treino       ON treino_bloco (id_treino, ordem);
CREATE INDEX IF NOT EXISTS idx_ex_usuario_bloco   ON ex_usuario (id_bloco);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bloco_letra_por_treino
    ON treino_bloco (id_treino, letra);

-- No máximo uma sessão em andamento por aluno. Garantido no banco, e não só
-- no código, porque dois toques rápidos em "Iniciar" chegariam em paralelo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessao_aberta_por_aluno
    ON sessao_treino (id_aluno) WHERE finalizado_em IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessao_exercicio_unico
    ON sessao_exercicio (id_sessao, id_ex_usuario);
