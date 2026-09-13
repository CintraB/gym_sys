# Sincronização do APK — Leva 1: o SQL

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> caixa (`- [ ]`) para acompanhamento.

**Objetivo:** dar ao banco do Supabase a autorização em SQL que o APK vai precisar para sincronizar
— colunas de identidade, políticas RLS, a função transacional de subida e a tabela de tentativas —
com uma suíte que prova tudo isso num Postgres de verdade.

**Arquitetura:** nada do aplicativo muda nesta leva. Entram arquivos SQL novos (`db/rls.sql`,
`db/sincronizacao.sql`, `db/migracao-v8-uuid.sql`), colunas novas em quatro tabelas do `schema.sql`,
e uma suíte `npm run test:rls` que roda num container Postgres descartável, conectando como o papel
`authenticated` com claims de JWT forjadas. Ao fim da leva a Data API **continua fechada** — abrir
antes das políticas prontas recria o buraco que a spec anterior fechou.

**Stack:** PostgreSQL 16, plpgsql, `node --test`, `pg`, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-07-sincronizacao-do-apk-design.md`

## Restrições globais

- **Node ≥ 20, ESM em tudo.** Não há CommonJS no projeto.
- **Nomes e comentários em pt-BR.** Comentário explica **por quê**, não o quê.
- **Convenções do banco que não se "corrigem"**: `criado_em`/`atualizado_em` (nunca
  `created_at`), grupo muscular é a coluna `tipo`, `usuario.titulo` é `NOT NULL`,
  `exercicio.nome_exercicio` **não** é único.
- **`db/schema.sql` é a fonte da verdade.** Toda coluna nova entra nele **e** numa migração para
  bancos que já existem.
- **O `pg-mem` não executa plpgsql.** É por isso que `triggers.sql` já mora fora do `schema.sql`, e
  é por isso que `rls.sql` e `sincronizacao.sql` também ficam de fora. **Não** montá-los no
  `docker-compose.yml` de desenvolvimento nesta leva.
- **A suíte atual não pode mudar de resultado:** 260 no backend (nos dois bancos) e 264 no front.
  Se `npm test` mudar de número, algo saiu do lugar.
- **Um commit por tarefa**, direto na `main`, sem push. Mensagem em pt-BR sem acento no corpo, e
  **sem `Co-Authored-By`** — só o Cristhian assina os commits deste repositório, como em todos os
  planos anteriores. Esta linha já esteve escrita ao contrário aqui, e os commits da leva 1
  precisaram ser reescritos por causa disso.
- **Nunca usar `sed -i`** em arquivo-fonte nesta máquina, e não mandar texto acentuado por `curl`
  no Git Bash.
- **Decidido em 13/09/2026 e já refletido na spec:** o limite de tentativas é tabela no Postgres
  (a tabela nasce aqui, na leva 1); o token vale 30 dias; a primeira sincronização **não** preserva
  sessão local.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `backend/db/schema.sql` (modificar) | Ganha a coluna `uuid` em quatro tabelas, o índice único e a tabela `tentativa_login` |
| `backend/db/migracao-v8-uuid.sql` (criar) | Leva um banco existente ao formato acima, idempotente |
| `backend/db/rls.sql` (criar) | Papéis, `GRANT`s, funções de identidade e todas as políticas |
| `backend/db/sincronizacao.sql` (criar) | Só a função `sincronizar_sessao(jsonb)` |
| `backend/db/teste-supabase-falso.sql` (criar) | **Só para teste**: recria o que o Supabase dá pronto (schema `auth`, `auth.jwt()`, papéis `anon`/`authenticated`) num Postgres puro |
| `backend/docker-compose.test.yml` (criar) | Container descartável na porta 5433, sem volume, para a suíte |
| `backend/test-rls/ajuda.js` (criar) | Sobe o schema, popula o cenário e devolve conexões por papel |
| `backend/test-rls/*.test.js` (criar) | As asserções, uma área por arquivo |
| `backend/package.json` (modificar) | Scripts `test:rls`, `rls:up`, `rls:down` |

**Por que um compose separado, e não o `docker-compose.yml` de sempre:** o de desenvolvimento tem
volume nomeado (`gymsys-dados`) e aplica `schema/triggers/seed` só na criação do volume. A suíte
precisa de um banco limpo a cada execução e não pode arriscar os dados de desenvolvimento dele. O
container de teste sobe sem volume, em porta própria, e a suíte aplica o SQL ela mesma — o que
também garante que os arquivos SQL rodam do zero, que é como vão rodar no Supabase.

---

### Tarefa 1: O container de teste e o runner

**Arquivos:**
- Criar: `backend/docker-compose.test.yml`
- Criar: `backend/db/teste-supabase-falso.sql`
- Criar: `backend/test-rls/ajuda.js`
- Criar: `backend/test-rls/fundacao.test.js`
- Modificar: `backend/package.json` (scripts)

**Interfaces:**
- Produz: `abrirBanco()` → `{ pool, encerrar }` (conexão de dono, aplica o schema);
  `conectarComo(claims)` → cliente `pg` já com `SET ROLE authenticated` e as claims postas;
  `conectarAnon()` → cliente com `SET ROLE anon`. Todas as tarefas seguintes usam estes três.

- [ ] **Passo 1: escrever o compose de teste**

`backend/docker-compose.test.yml`:

```yaml
# Postgres descartável para a suíte de RLS (`npm run test:rls`).
#
# Separado do docker-compose.yml de propósito: aquele tem volume nomeado e
# aplica schema/seed só na criação do volume. Aqui o banco precisa nascer vazio
# a cada execução, para provar que os arquivos SQL rodam do zero — que é como
# vão rodar no Supabase — e para nunca encostar nos dados de desenvolvimento.
services:
  db-teste:
    image: postgres:16-alpine
    container_name: gymsys-db-rls
    environment:
      POSTGRES_USER: gymsys
      POSTGRES_PASSWORD: gymsys
      POSTGRES_DB: gymsys_rls
      POSTGRES_INITDB_ARGS: "--encoding=UTF8 --locale=C"
      PGUSER: gymsys
      PGDATABASE: gymsys_rls
    ports:
      - "5433:5432"
    # tmpfs: os dados morrem com o container. Não há o que limpar depois.
    tmpfs:
      - /var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready"]
      interval: 2s
      timeout: 3s
      retries: 30
      start_period: 3s
```

- [ ] **Passo 2: escrever o Supabase falso**

`backend/db/teste-supabase-falso.sql` — só o container de teste aplica isto. No Supabase real estes
objetos já existem, e aplicar este arquivo lá seria erro.

```sql
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
```

- [ ] **Passo 3: escrever o helper da suíte**

`backend/test-rls/ajuda.js`:

```js
/**
 * Infraestrutura da suíte de RLS.
 *
 * Roda contra o Postgres do `docker-compose.test.yml` — Postgres de verdade,
 * porque o pg-mem não executa plpgsql nem RLS. Cada arquivo de teste pede um
 * banco limpo: o schema inteiro é reaplicado num schema `public` recriado, o
 * que é rápido e evita um teste enxergar a sujeira do outro.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const AQUI = dirname(fileURLToPath(import.meta.url));
const DB = join(AQUI, "..", "db");

export const CONEXAO = {
  host: "127.0.0.1",
  port: 5433,
  user: "gymsys",
  password: "gymsys",
  database: "gymsys_rls",
};

const arquivo = (nome) => readFile(join(DB, nome), "utf8");

/**
 * Recria o schema do zero e devolve o pool do dono (que ignora RLS).
 *
 * A ordem importa: `teste-supabase-falso.sql` antes de tudo, porque `rls.sql`
 * referencia os papéis e o `auth.jwt()` que ele cria.
 */
export async function abrirBanco() {
  const pool = new pg.Pool(CONEXAO);

  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await pool.query(await arquivo("teste-supabase-falso.sql"));
  await pool.query(await arquivo("schema.sql"));
  await pool.query(await arquivo("seed.sql"));

  return {
    pool,
    encerrar: () => pool.end(),
    /** Aplica um arquivo do `db/` no banco já de pé. */
    aplicar: async (nome) => pool.query(await arquivo(nome)),
  };
}

/**
 * Abre uma conexão no papel `authenticated`, com as claims do token.
 *
 * É o que o PostgREST faz a cada requisição: valida o JWT, põe as claims em
 * `request.jwt.claims` e troca para o papel. `SET LOCAL` não serve aqui porque
 * não estamos numa transação — a configuração vale para a sessão.
 */
export async function conectarComo(claims) {
  const cliente = new pg.Client(CONEXAO);
  await cliente.connect();
  await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
    JSON.stringify(claims),
  ]);
  await cliente.query("SET ROLE authenticated");
  return cliente;
}

/** O visitante sem token nenhum. */
export async function conectarAnon() {
  const cliente = new pg.Client(CONEXAO);
  await cliente.connect();
  await cliente.query("SET ROLE anon");
  return cliente;
}

/** Claims no formato que a Edge Function vai emitir na leva 2. */
export function tokenDe(id, { iat = Math.floor(Date.now() / 1000) } = {}) {
  return { sub: String(id), role: "authenticated", iat };
}

/**
 * Roda uma consulta esperando que ela seja recusada.
 *
 * RLS nega de dois jeitos diferentes, e confundi-los esconde bug: leitura
 * bloqueada volta **vazia**, escrita bloqueada **lança**. Quem chama diz qual
 * espera.
 */
export async function recusa(cliente, sql, valores = []) {
  try {
    await cliente.query(sql, valores);
    return null;
  } catch (erro) {
    return erro;
  }
}
```

- [ ] **Passo 4: escrever o teste de fundação**

`backend/test-rls/fundacao.test.js`:

```js
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { abrirBanco, conectarComo, tokenDe } from "./ajuda.js";

describe("fundação da suíte de RLS", () => {
  let banco;
  before(async () => {
    banco = await abrirBanco();
  });
  after(() => banco.encerrar());

  it("o schema aplica inteiro num Postgres de verdade", async () => {
    const { rows } = await banco.pool.query(
      `SELECT count(*)::int AS total FROM information_schema.tables
        WHERE table_schema = 'public'`,
    );
    assert.ok(rows[0].total >= 10, `esperava as tabelas do projeto, veio ${rows[0].total}`);
  });

  it("o seed do catálogo entra", async () => {
    const { rows } = await banco.pool.query("SELECT count(*)::int AS total FROM exercicio");
    assert.ok(rows[0].total > 0, "o catálogo de exercícios devia estar populado");
  });

  it("as claims do token chegam ao banco, que é como o PostgREST trabalha", async () => {
    const cliente = await conectarComo(tokenDe(42));
    try {
      const { rows } = await cliente.query("SELECT auth.jwt() ->> 'sub' AS sub");
      assert.equal(rows[0].sub, "42");
    } finally {
      await cliente.end();
    }
  });
});
```

- [ ] **Passo 5: acrescentar os scripts**

Em `backend/package.json`, dentro de `"scripts"`:

```json
"rls:up": "docker compose -f docker-compose.test.yml up -d --wait",
"rls:down": "docker compose -f docker-compose.test.yml down",
"test:rls": "npm run rls:up && node --test test-rls/ --disable-warning=ExperimentalWarning"
```

- [ ] **Passo 6: rodar e ver passar**

```bash
cd backend && npm run test:rls
```

Esperado: os três testes passam. Se `docker compose` não estiver disponível, a falha é do ambiente
— o container é requisito desta leva, conforme a spec.

- [ ] **Passo 7: provar que a suíte pega o que deve**

Quebre de propósito: em `ajuda.js`, troque `SET ROLE authenticated` por `SET ROLE anon`. Rode de
novo. O terceiro teste deve continuar passando (as claims independem do papel) — e é justamente por
isso que ele não basta sozinho. Agora comente a linha do `set_config` e rode: o terceiro teste
**tem de ficar vermelho** com `sub` nulo. Desfaça as duas mudanças.

- [ ] **Passo 8: commit**

```bash
git add backend/docker-compose.test.yml backend/db/teste-supabase-falso.sql \
        backend/test-rls/ backend/package.json
git commit -m "suite de RLS: container descartavel e conexao por papel"
```

---

### Tarefa 2: A coluna `uuid` e a migração v8

**Arquivos:**
- Modificar: `backend/db/schema.sql`
- Criar: `backend/db/migracao-v8-uuid.sql`
- Criar: `backend/test-rls/uuid.test.js`

**Interfaces:**
- Produz: coluna `uuid UUID` em `sessao_treino`, `sessao_exercicio`, `sessao_serie` e
  `pedido_treino`, com índice único parcial por tabela. A Tarefa 8 (`sincronizar_sessao`) depende
  destes nomes.

**Por que nulo é permitido:** o banco do Supabase já tem sessões gravadas, e a migração roda sobre
elas. `NOT NULL` quebraria. A garantia de idempotência é o **índice único**, que ignora nulos por
natureza — duas linhas antigas sem `uuid` não colidem entre si.

- [ ] **Passo 1: escrever o teste**

`backend/test-rls/uuid.test.js`:

```js
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { abrirBanco, recusa } from "./ajuda.js";

const TABELAS = ["sessao_treino", "sessao_exercicio", "sessao_serie", "pedido_treino"];

describe("coluna uuid", () => {
  let banco;
  before(async () => {
    banco = await abrirBanco();
    await banco.pool.query(`
      INSERT INTO usuario (id, nome, senha, cpf, email, titulo)
      VALUES (1, 'Aluno', 'x', '11111111111', 'a@b.c', '111111111111')`);
    await banco.pool.query(
      "INSERT INTO treino (id_treino, id_aluno, id_professor) VALUES (1, 1, 1)",
    );
  });
  after(() => banco.encerrar());

  for (const tabela of TABELAS) {
    it(`${tabela} tem a coluna uuid`, async () => {
      const { rows } = await banco.pool.query(
        `SELECT data_type FROM information_schema.columns
          WHERE table_name = $1 AND column_name = 'uuid'`,
        [tabela],
      );
      assert.equal(rows.length, 1, `${tabela} devia ter a coluna uuid`);
      assert.equal(rows[0].data_type, "uuid");
    });
  }

  it("aceita nulo, porque as linhas que já existem no Supabase não têm uuid", async () => {
    const erro = await recusa(
      banco.pool,
      "INSERT INTO pedido_treino (id_aluno, ativo) VALUES (1, TRUE)",
    );
    assert.equal(erro, null, "inserir sem uuid tinha de continuar valendo");
  });

  it("recusa o mesmo uuid duas vezes — é daqui que vem a idempotência", async () => {
    const id = "11111111-2222-3333-4444-555555555555";
    await banco.pool.query(
      "INSERT INTO pedido_treino (id_aluno, ativo, uuid) VALUES (1, TRUE, $1)",
      [id],
    );
    const erro = await recusa(
      banco.pool,
      "INSERT INTO pedido_treino (id_aluno, ativo, uuid) VALUES (1, TRUE, $1)",
      [id],
    );
    assert.ok(erro, "o segundo insert com o mesmo uuid tinha de falhar");
    assert.match(erro.message, /duplicad|duplicate|unique/i);
  });

  it("dois nulos não colidem entre si", async () => {
    await banco.pool.query("INSERT INTO pedido_treino (id_aluno, ativo) VALUES (1, TRUE)");
    const erro = await recusa(
      banco.pool,
      "INSERT INTO pedido_treino (id_aluno, ativo) VALUES (1, TRUE)",
    );
    assert.equal(erro, null, "índice único não pode barrar linhas antigas sem uuid");
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
cd backend && npm run test:rls
```

Esperado: FALHA em `uuid.test.js` com "devia ter a coluna uuid".

- [ ] **Passo 3: acrescentar as colunas ao schema**

Em `backend/db/schema.sql`, na definição de cada uma das quatro tabelas, acrescente a coluna como
**última** do bloco. Para `sessao_treino`, depois de `calorias INTEGER`:

```sql
    -- Identidade da linha no aparelho, gerada por crypto.randomUUID() antes de
    -- subir. Nula nas linhas que já existiam quando a sincronização chegou, e
    -- nas que nascem aqui pela API — só o que vem do APK a preenche.
    --
    -- O índice único sobre ela é a garantia de idempotência: subir o mesmo
    -- pacote duas vezes resulta numa linha só. A marca de "já subiu" que o app
    -- guarda é atalho, não garantia.
    uuid              UUID
```

Para `sessao_exercicio` e `sessao_serie`, a mesma coluna com o comentário curto
`-- Ver sessao_treino.uuid.`; para `pedido_treino`, idem.

Depois, junto dos outros índices ao final do arquivo:

```sql
-- Um por tabela, e nao um so: os uuid vivem em tabelas diferentes e nunca sao
-- comparados entre si. Nulo nao entra em indice unico, entao as linhas antigas
-- sem uuid nao colidem.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessao_treino_uuid    ON sessao_treino (uuid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessao_exercicio_uuid ON sessao_exercicio (uuid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessao_serie_uuid     ON sessao_serie (uuid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedido_treino_uuid    ON pedido_treino (uuid);
```

- [ ] **Passo 4: escrever a migração**

`backend/db/migracao-v8-uuid.sql`:

```sql
-- Migração para um banco que já existe: identidade das linhas que sobem do APK.
--
-- O aparelho gera o uuid antes de subir, e o índice único é o que faz subir o
-- mesmo pacote duas vezes resultar numa linha só. Quatro tabelas, porque o
-- pedido de treino também nasce no aluno.
--
-- Nula de propósito: o banco do Supabase já tem sessões gravadas e a migração
-- roda sobre elas. Nulo não entra em índice único, então elas não colidem.
--
-- Só é necessária se você já tem dados. Em banco novo, use schema.sql direto.
-- Faça backup antes:
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
```

- [ ] **Passo 5: rodar e ver passar**

```bash
cd backend && npm run test:rls
```

Esperado: PASS. Rode também `npm test` e `npm run test:sqlite` — os 260 continuam passando, porque
coluna nova opcional não afeta nenhuma consulta existente.

- [ ] **Passo 6: provar que o índice único é o que segura**

Apague a linha `CREATE UNIQUE INDEX ... idx_pedido_treino_uuid` do `schema.sql` e rode. O teste
"recusa o mesmo uuid duas vezes" **tem de ficar vermelho**. Desfaça.

- [ ] **Passo 7: commit**

```bash
git add backend/db/schema.sql backend/db/migracao-v8-uuid.sql backend/test-rls/uuid.test.js
git commit -m "coluna uuid nas quatro tabelas que sobem do aparelho"
```

---

### Tarefa 3: A tabela de tentativas de login

**Arquivos:**
- Modificar: `backend/db/schema.sql`
- Modificar: `backend/db/migracao-v8-uuid.sql`
- Criar: `backend/test-rls/tentativas.test.js`

**Interfaces:**
- Produz: tabela `tentativa_login (id, cpf, ocorrida_em, sucesso)` e a função
  `registrar_tentativa(p_cpf text, p_sucesso boolean) → integer`, que grava e devolve **quantas
  falhas** há na janela. A Edge Function da leva 2 chama só essa função.

**Por que uma função e não a Edge Function consultando a tabela:** a função é `SECURITY DEFINER` e
concentra a regra num lugar só. A tabela não precisa ser legível por ninguém — nem pelo
`authenticated` —, o que reduz a superfície: um token roubado não enumera CPFs pelas tentativas.

- [ ] **Passo 1: escrever o teste**

`backend/test-rls/tentativas.test.js`:

```js
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { abrirBanco, conectarComo, recusa, tokenDe } from "./ajuda.js";

const JANELA_MINUTOS = 15;

describe("tentativas de login", () => {
  let banco;
  before(async () => {
    banco = await abrirBanco();
    await banco.aplicar("rls.sql");
  });
  after(() => banco.encerrar());

  it("conta só as falhas da janela", async () => {
    const cpf = "99999999901";
    for (let i = 0; i < 3; i++) {
      await banco.pool.query("SELECT registrar_tentativa($1, FALSE)", [cpf]);
    }
    const { rows } = await banco.pool.query("SELECT registrar_tentativa($1, FALSE) AS falhas", [
      cpf,
    ]);
    assert.equal(rows[0].falhas, 4);
  });

  it("falha antiga não conta", async () => {
    const cpf = "99999999902";
    await banco.pool.query(
      `INSERT INTO tentativa_login (cpf, sucesso, ocorrida_em)
       VALUES ($1, FALSE, NOW() - INTERVAL '${JANELA_MINUTOS + 5} minutes')`,
      [cpf],
    );
    const { rows } = await banco.pool.query("SELECT registrar_tentativa($1, FALSE) AS falhas", [
      cpf,
    ]);
    assert.equal(rows[0].falhas, 1, "a de fora da janela não podia contar");
  });

  it("sucesso zera a contagem — quem acertou não fica de castigo", async () => {
    const cpf = "99999999903";
    await banco.pool.query("SELECT registrar_tentativa($1, FALSE)", [cpf]);
    await banco.pool.query("SELECT registrar_tentativa($1, FALSE)", [cpf]);
    await banco.pool.query("SELECT registrar_tentativa($1, TRUE)", [cpf]);

    const { rows } = await banco.pool.query("SELECT registrar_tentativa($1, FALSE) AS falhas", [
      cpf,
    ]);
    assert.equal(rows[0].falhas, 1, "depois do acerto a contagem recomeça");
  });

  it("ninguém autenticado lê a tabela — ela não é fonte de enumeração de CPF", async () => {
    const cliente = await conectarComo(tokenDe(1));
    try {
      const erro = await recusa(cliente, "SELECT * FROM tentativa_login");
      assert.ok(erro, "authenticated não podia ler tentativa_login");
      assert.match(erro.message, /permission denied|permissão negada/i);
    } finally {
      await cliente.end();
    }
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Esperado: FALHA com `relation "tentativa_login" does not exist`.

- [ ] **Passo 3: a tabela, no `schema.sql`**

Depois da tabela `usuario`:

```sql
-- Trava de forca bruta da Edge Function de identidade.
--
-- A API tem o express-rate-limit, que guarda contagem na memoria do processo.
-- A Edge Function e sem estado: sem esta tabela, a porta nova ficaria sem
-- limite de tentativas. Decisao dele em 13/09/2026.
--
-- Guarda o CPF digitado, e nao o id do usuario: CPF que nao existe tambem
-- precisa contar, senao varrer CPFs sairia de graca.
CREATE TABLE IF NOT EXISTS tentativa_login (
    id           BIGSERIAL PRIMARY KEY,
    cpf          VARCHAR(11) NOT NULL,
    sucesso      BOOLEAN     NOT NULL,
    ocorrida_em  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tentativa_cpf ON tentativa_login (cpf, ocorrida_em);
```

Acrescente as mesmas duas instruções ao final da migração v8, antes do `COMMIT`.

- [ ] **Passo 4: a função, no `rls.sql`**

Este é o primeiro conteúdo de `backend/db/rls.sql`. Comece o arquivo com:

```sql
-- Autorizacao em SQL: papeis, grants, identidade e politicas.
--
-- Fica fora do schema.sql pelo mesmo motivo do triggers.sql: o pg-mem da suite
-- principal nao executa plpgsql. Aplicado no Supabase e no container da suite
-- de RLS, nunca no docker-compose de desenvolvimento.
--
-- Aplicar:  psql -U <usuario> -d <banco> -f db/rls.sql

-- ---------------------------------------------------------------------------
-- Trava de tentativas, usada pela Edge Function de identidade (leva 2).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION registrar_tentativa(p_cpf TEXT, p_sucesso BOOLEAN)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_falhas INTEGER;
BEGIN
  INSERT INTO public.tentativa_login (cpf, sucesso) VALUES (p_cpf, p_sucesso);

  -- Sucesso zera: quem acertou a senha nao fica de castigo pelas tentativas
  -- anteriores. Apagar em vez de ignorar mantem a tabela pequena sozinha.
  IF p_sucesso THEN
    DELETE FROM public.tentativa_login
     WHERE cpf = p_cpf AND NOT sucesso;
    RETURN 0;
  END IF;

  SELECT count(*) INTO v_falhas
    FROM public.tentativa_login
   WHERE cpf = p_cpf
     AND NOT sucesso
     AND ocorrida_em > NOW() - INTERVAL '15 minutes';

  RETURN v_falhas;
END;
$$;

-- A tabela nao e legivel por ninguem: um token roubado nao enumera CPF por ela.
-- So a funcao acima toca nela, e ela e SECURITY DEFINER.
REVOKE ALL ON public.tentativa_login FROM PUBLIC, anon, authenticated;

-- REVOKE de PUBLIC antes do GRANT: o default do Postgres e EXECUTE para PUBLIC,
-- e revogar so de anon/authenticated roda sem erro e sem efeito — a licao de
-- 06/09/2026.
REVOKE ALL ON FUNCTION registrar_tentativa(TEXT, BOOLEAN) FROM PUBLIC;
```

- [ ] **Passo 5: rodar e ver passar**

```bash
cd backend && npm run test:rls
```

- [ ] **Passo 6: provar a janela**

Troque `INTERVAL '15 minutes'` por `INTERVAL '15 hours'` e rode. O teste "falha antiga não conta"
**tem de ficar vermelho**. Desfaça.

- [ ] **Passo 7: commit**

```bash
git add backend/db/schema.sql backend/db/migracao-v8-uuid.sql backend/db/rls.sql \
        backend/test-rls/tentativas.test.js
git commit -m "tabela de tentativas de login para a Edge Function"
```

---

### Tarefa 4: As funções de identidade

**Arquivos:**
- Modificar: `backend/db/rls.sql`
- Criar: `backend/test-rls/identidade.test.js`

**Interfaces:**
- Produz: `auth_id_valido() → INTEGER` (id do usuário do token, ou `NULL`),
  `auth_e_professor() → BOOLEAN`, `auth_e_admin() → BOOLEAN`. Todas as políticas das Tarefas 6 e 7
  chamam estas três, e a Tarefa 8 também.

**As três armadilhas desta tarefa:**
1. **Recursão.** Política em `usuario` que consulta `usuario` estoura. Por isso `SECURITY DEFINER`
   — o dono ignora RLS dentro da função.
2. **`search_path = ''`.** Sem isso, `SECURITY DEFINER` é escalada de privilégio: quem controla o
   `search_path` troca qual tabela a função enxerga. Com ele, todo nome precisa ser qualificado
   (`public.usuario`).
3. **O `REVOKE` precisa citar `PUBLIC`.** Foi a lição de 06/09: `REVOKE ... FROM anon, authenticated`
   rodou sem erro e sem efeito, porque o grant era para `PUBLIC`.

- [ ] **Passo 1: escrever o teste**

`backend/test-rls/identidade.test.js`:

```js
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { abrirBanco, conectarComo, tokenDe } from "./ajuda.js";

const AGORA = () => Math.floor(Date.now() / 1000);

describe("funções de identidade", () => {
  let banco;

  before(async () => {
    banco = await abrirBanco();
    await banco.aplicar("rls.sql");
  });
  after(() => banco.encerrar());

  beforeEach(async () => {
    await banco.pool.query("TRUNCATE usuario RESTART IDENTITY CASCADE");
    await banco.pool.query(`
      INSERT INTO usuario (id, nome, senha, cpf, email, titulo, aluno, professor, admin, ativo)
      VALUES (1, 'Aluno',     'x', '11111111111', 'a@b.c', '111111111111', TRUE,  FALSE, FALSE, TRUE),
             (2, 'Professor', 'x', '22222222222', 'p@b.c', '222222222222', FALSE, TRUE,  FALSE, TRUE),
             (3, 'Admin',     'x', '33333333333', 'd@b.c', '333333333333', FALSE, FALSE, TRUE,  TRUE),
             (4, 'Inativo',   'x', '44444444444', 'i@b.c', '444444444444', TRUE,  FALSE, FALSE, FALSE)`);
  });

  async function comToken(claims, consulta) {
    const cliente = await conectarComo(claims);
    try {
      const { rows } = await cliente.query(consulta);
      return rows[0];
    } finally {
      await cliente.end();
    }
  }

  it("devolve o id de quem tem token bom", async () => {
    const r = await comToken(tokenDe(1), "SELECT auth_id_valido() AS id");
    assert.equal(r.id, 1);
  });

  it("usuário inativo não tem identidade, mesmo com token válido", async () => {
    const r = await comToken(tokenDe(4), "SELECT auth_id_valido() AS id");
    assert.equal(r.id, null);
  });

  it("usuário que não existe não tem identidade", async () => {
    const r = await comToken(tokenDe(999), "SELECT auth_id_valido() AS id");
    assert.equal(r.id, null);
  });

  it("sem token nenhum, não há identidade", async () => {
    const cliente = await conectarComo({});
    try {
      const { rows } = await cliente.query("SELECT auth_id_valido() AS id");
      assert.equal(rows[0].id, null);
    } finally {
      await cliente.end();
    }
  });

  it("token anterior à troca de senha é recusado — o corte de sessão vale aqui também", async () => {
    await banco.pool.query("UPDATE usuario SET sessoes_invalidadas_em = NOW() WHERE id = 1");
    const r = await comToken(tokenDe(1, { iat: AGORA() - 3600 }), "SELECT auth_id_valido() AS id");
    assert.equal(r.id, null);
  });

  it("token posterior à troca continua valendo", async () => {
    await banco.pool.query(
      "UPDATE usuario SET sessoes_invalidadas_em = NOW() - INTERVAL '1 hour' WHERE id = 1",
    );
    const r = await comToken(tokenDe(1), "SELECT auth_id_valido() AS id");
    assert.equal(r.id, 1);
  });

  it("iat igual ao corte vale, como no backend (a comparação é estritamente menor)", async () => {
    const { rows } = await banco.pool.query(
      "UPDATE usuario SET sessoes_invalidadas_em = NOW() WHERE id = 1 RETURNING sessoes_invalidadas_em",
    );
    const corte = Math.floor(new Date(rows[0].sessoes_invalidadas_em).getTime() / 1000);
    const r = await comToken(tokenDe(1, { iat: corte }), "SELECT auth_id_valido() AS id");
    assert.equal(r.id, 1, "iat == corte tinha de valer; divergir do backend é bug");
  });

  it("professor é reconhecido, e aluno não é", async () => {
    assert.equal((await comToken(tokenDe(2), "SELECT auth_e_professor() AS v")).v, true);
    assert.equal((await comToken(tokenDe(1), "SELECT auth_e_professor() AS v")).v, false);
  });

  it("professor rebaixado perde o perfil na hora — os perfis vêm do banco", async () => {
    const claims = tokenDe(2);
    assert.equal((await comToken(claims, "SELECT auth_e_professor() AS v")).v, true);

    await banco.pool.query("UPDATE usuario SET professor = FALSE WHERE id = 2");

    assert.equal(
      (await comToken(claims, "SELECT auth_e_professor() AS v")).v,
      false,
      "o MESMO token tinha de perder o perfil; se passar, o perfil está vindo do JWT",
    );
  });

  it("admin é reconhecido", async () => {
    assert.equal((await comToken(tokenDe(3), "SELECT auth_e_admin() AS v")).v, true);
    assert.equal((await comToken(tokenDe(1), "SELECT auth_e_admin() AS v")).v, false);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Esperado: FALHA com `function auth_id_valido() does not exist`.

- [ ] **Passo 3: escrever as funções**

Acrescente a `backend/db/rls.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Identidade: quem e o dono do token, e o que ele e.
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER porque politica em `usuario` que consulta `usuario` estoura
-- em recursao. STABLE porque o resultado nao muda dentro do mesmo comando: o
-- planejador avalia uma vez, e nao uma vez por linha.
--
-- search_path = '' nao e estilo: sem ele, SECURITY DEFINER vira escalada de
-- privilegio, porque quem controla o search_path escolhe qual tabela a funcao
-- enxerga. Com ele, todo nome tem de vir qualificado.
CREATE OR REPLACE FUNCTION auth_id_valido() RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT u.id
    FROM public.usuario u
   WHERE u.id = nullif(auth.jwt() ->> 'sub', '')::INTEGER
     AND u.ativo
     -- O corte de sessao, o mesmo de src/middlewares/auth.js: token emitido
     -- antes da troca de credencial nao vale. O floor reproduz a resolucao de
     -- segundos do iat -- sem ele, um corte com milissegundos recusaria um
     -- token que o backend aceita, e as duas portas divergiriam.
     AND (
       u.sessoes_invalidadas_em IS NULL
       OR (auth.jwt() ->> 'iat')::BIGINT
          >= floor(extract(epoch FROM u.sessoes_invalidadas_em))
     )
$$;

-- Le do banco, e nao do JWT, de proposito: com o perfil carimbado num token de
-- 30 dias, professor rebaixado seguiria professor por 30 dias. Hoje o
-- `autenticar` consulta o banco a cada requisicao, e isso mantem a propriedade.
CREATE OR REPLACE FUNCTION auth_e_professor() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT u.professor FROM public.usuario u WHERE u.id = public.auth_id_valido()),
    FALSE)
$$;

CREATE OR REPLACE FUNCTION auth_e_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT u.admin FROM public.usuario u WHERE u.id = public.auth_id_valido()),
    FALSE)
$$;

-- O default do Postgres e EXECUTE para PUBLIC. Revogar so de anon/authenticated
-- roda sem erro e sem efeito nenhum -- foi o que aconteceu em 06/09/2026.
REVOKE ALL ON FUNCTION auth_id_valido()   FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_e_professor() FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_e_admin()     FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_id_valido()   TO authenticated;
GRANT EXECUTE ON FUNCTION auth_e_professor() TO authenticated;
GRANT EXECUTE ON FUNCTION auth_e_admin()     TO authenticated;
```

- [ ] **Passo 4: rodar e ver passar**

- [ ] **Passo 5: provar as duas asserções que mais importam**

Primeiro: troque `>=` por `>` na comparação do `iat`. O teste "iat igual ao corte vale" **tem de
ficar vermelho** — é a divergência com o backend que o teste existe para pegar. Desfaça.

Depois: troque o corpo de `auth_e_professor()` por
`SELECT coalesce((auth.jwt() ->> 'professor')::BOOLEAN, FALSE)`, que é a versão "perfil no token".
O teste "professor rebaixado perde o perfil na hora" **tem de ficar vermelho**. Desfaça.

- [ ] **Passo 6: commit**

```bash
git add backend/db/rls.sql backend/test-rls/identidade.test.js
git commit -m "funcoes de identidade do RLS, com perfil vindo do banco"
```

---

### Tarefa 5: Os `GRANT`s — a primeira camada

**Arquivos:**
- Modificar: `backend/db/rls.sql`
- Criar: `backend/test-rls/grants.test.js`

**Interfaces:**
- Produz: `anon` sem nada; `authenticated` com `SELECT` coluna a coluna onde importa. Nenhuma
  política ainda — esta tarefa prova que **sem** política o RLS nega por padrão, e que a coluna
  `senha` está fora do alcance de todos.

**Por que isto é uma tarefa própria:** a auditoria de 06/09 mostrou que o grant é a camada que hoje
segura o banco. RLS sem grant é redundante; grant sem RLS é buraco. Separar deixa claro qual das
duas quebrou quando um teste ficar vermelho.

- [ ] **Passo 1: escrever o teste**

`backend/test-rls/grants.test.js`:

```js
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { abrirBanco, conectarAnon, conectarComo, recusa, tokenDe } from "./ajuda.js";

describe("grants", () => {
  let banco;
  before(async () => {
    banco = await abrirBanco();
    await banco.aplicar("rls.sql");
    await banco.pool.query(`
      INSERT INTO usuario (id, nome, senha, cpf, email, titulo)
      VALUES (1, 'Aluno', 'sal:hash', '11111111111', 'a@b.c', '111111111111')`);
  });
  after(() => banco.encerrar());

  it("anon não lê nada, em tabela nenhuma", async () => {
    const cliente = await conectarAnon();
    try {
      for (const tabela of ["usuario", "treino", "sessao_treino", "exercicio", "pedido_treino"]) {
        const erro = await recusa(cliente, `SELECT * FROM ${tabela}`);
        assert.ok(erro, `anon conseguiu ler ${tabela}`);
      }
    } finally {
      await cliente.end();
    }
  });

  it("a coluna senha não sai nem para o próprio dono", async () => {
    const cliente = await conectarComo(tokenDe(1));
    try {
      const erro = await recusa(cliente, "SELECT senha FROM usuario WHERE id = 1");
      assert.ok(erro, "a senha nunca pode ser selecionável");
      assert.match(erro.message, /permission denied|permissão negada/i);
    } finally {
      await cliente.end();
    }
  });

  it("as tabelas sem uso continuam inalcançáveis", async () => {
    const cliente = await conectarComo(tokenDe(1));
    try {
      for (const tabela of ["admin_user", "regras_usuario"]) {
        const erro = await recusa(cliente, `SELECT * FROM ${tabela}`);
        assert.ok(erro, `${tabela} devia seguir sem grant nenhum`);
      }
    } finally {
      await cliente.end();
    }
  });

  it("o RLS está ligado em toda tabela que o app alcança", async () => {
    // Asserção sobre o catálogo, e não sobre "um SELECT volta vazio": a Tarefa
    // 6 vai criar políticas de leitura, e um teste escrito como "nem o dono
    // enxerga a própria linha" ficaria vermelho lá na frente por motivo certo.
    const { rows } = await banco.pool.query(
      `SELECT c.relname, c.relrowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY c.relname`,
    );
    const desligadas = rows
      .filter((t) => !t.relrowsecurity)
      .map((t) => t.relname)
      .filter((nome) => !["admin_user", "regras_usuario"].includes(nome));

    assert.deepEqual(
      desligadas,
      [],
      `tabela alcançável com RLS desligado: ${desligadas.join(", ")}`,
    );
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Esperado: FALHA no último teste, listando todas as tabelas do projeto como "RLS desligado" — é o
estado do banco hoje.

- [ ] **Passo 3: escrever os grants**

Acrescente a `backend/db/rls.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Camada 1: o GRANT. Sem ele o RLS e redundante; sem o RLS ele e buraco.
-- ---------------------------------------------------------------------------

-- O anon nao ganha nada em lugar nenhum, e continua assim depois desta leva.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Coluna a coluna onde importa: `senha` fica de fora, e nao ha SELECT que a
-- alcance -- nem o do proprio dono. As politicas filtram linha; o grant filtra
-- coluna, e sao coisas diferentes.
GRANT SELECT (id, nome, cpf, email, titulo, aluno, professor, admin, ativo, criado_em)
  ON usuario TO authenticated;
GRANT INSERT, UPDATE (nome, cpf, email, titulo, aluno, professor, ativo, atualizado_em, atualizado_por)
  ON usuario TO authenticated;

GRANT SELECT, INSERT          ON exercicio      TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON treino         TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON treino_bloco   TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON ex_usuario     TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON pedido_treino  TO authenticated;
GRANT SELECT, INSERT          ON sessao_treino  TO authenticated;
GRANT SELECT, INSERT          ON sessao_exercicio TO authenticated;
GRANT SELECT, INSERT          ON sessao_serie   TO authenticated;

-- SERIAL precisa da sequencia, senao o INSERT permitido falha na hora de gerar
-- o id -- e o erro nao parece de permissao.
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- admin_user e regras_usuario ficam de fora de proposito: o app nunca as toca.

-- ---------------------------------------------------------------------------
-- Camada 2: liga o RLS. A partir daqui, sem politica ninguem ve linha nenhuma.
-- ---------------------------------------------------------------------------

ALTER TABLE usuario          ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercicio        ENABLE ROW LEVEL SECURITY;
ALTER TABLE treino           ENABLE ROW LEVEL SECURITY;
ALTER TABLE treino_bloco     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ex_usuario       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_treino    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessao_treino    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessao_exercicio ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessao_serie     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tentativa_login  ENABLE ROW LEVEL SECURITY;
```

- [ ] **Passo 4: rodar e ver passar**

- [ ] **Passo 5: provar que o grant por coluna é o que esconde a senha**

Troque o `GRANT SELECT (...)` de `usuario` por `GRANT SELECT ON usuario TO authenticated`. O teste
"a coluna senha não sai nem para o próprio dono" **tem de ficar vermelho**. Desfaça.

- [ ] **Passo 6: commit**

```bash
git add backend/db/rls.sql backend/test-rls/grants.test.js
git commit -m "grants por coluna e RLS ligado em todas as tabelas do app"
```

---

### Tarefa 6: Políticas de leitura

**Arquivos:**
- Modificar: `backend/db/rls.sql`
- Criar: `backend/test-rls/cenario.js`
- Criar: `backend/test-rls/leitura.test.js`

**Interfaces:**
- Consome: `auth_id_valido()`, `auth_e_professor()` da Tarefa 4.
- Produz: `cenario(pool)` — dois alunos (1 e 3), um professor (2), um inativo (4) e um admin (5),
  com ficha e sessão finalizada para cada aluno. As Tarefas 7 e 8 importam esta mesma função.
- Produz: políticas `SELECT` em `usuario`, `exercicio`, `treino`, `treino_bloco`, `ex_usuario`,
  `pedido_treino`, `sessao_treino`, `sessao_exercicio`, `sessao_serie`.

- [ ] **Passo 1: escrever o teste**

`backend/test-rls/leitura.test.js`:

```js
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { abrirBanco, conectarComo, tokenDe } from "./ajuda.js";
import { cenario } from "./cenario.js";

describe("políticas de leitura", () => {
  let banco;
  before(async () => {
    banco = await abrirBanco();
    await banco.aplicar("rls.sql");
    await cenario(banco.pool);
  });
  after(() => banco.encerrar());

  async function comoAluno1(consulta, valores) {
    const cliente = await conectarComo(tokenDe(1));
    try {
      return (await cliente.query(consulta, valores)).rows;
    } finally {
      await cliente.end();
    }
  }

  it("o aluno lê a própria linha de usuário", async () => {
    const linhas = await comoAluno1("SELECT id, nome FROM usuario");
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].id, 1);
  });

  it("o aluno não lê a ficha de outro aluno", async () => {
    const linhas = await comoAluno1("SELECT id_treino FROM treino");
    assert.deepEqual(
      linhas.map((l) => l.id_treino),
      [1],
      "só o treino dele podia aparecer",
    );
  });

  it("o aluno não lê a sessão de outro aluno", async () => {
    const linhas = await comoAluno1("SELECT id_sessao, id_aluno FROM sessao_treino");
    assert.ok(
      linhas.every((l) => l.id_aluno === 1),
      `vazou sessão de outro aluno: ${JSON.stringify(linhas)}`,
    );
  });

  it("o aluno lê o catálogo inteiro — é catálogo", async () => {
    const linhas = await comoAluno1("SELECT id_exercicio FROM exercicio");
    assert.ok(linhas.length > 10, "o catálogo devia estar todo visível");
  });

  it("o aluno lê os próprios blocos e exercícios da ficha", async () => {
    const blocos = await comoAluno1("SELECT id_bloco FROM treino_bloco");
    assert.deepEqual(blocos.map((b) => b.id_bloco), [1]);
    const exercicios = await comoAluno1("SELECT id FROM ex_usuario");
    assert.deepEqual(exercicios.map((e) => e.id), [1]);
  });

  it("o aluno lê as próprias linhas filhas de sessão", async () => {
    const ex = await comoAluno1("SELECT id FROM sessao_exercicio");
    assert.deepEqual(ex.map((e) => e.id), [1]);
    const series = await comoAluno1("SELECT id FROM sessao_serie");
    assert.deepEqual(series.map((s) => s.id), [1]);
  });

  it("o professor lê os alunos e as sessões deles", async () => {
    const cliente = await conectarComo(tokenDe(2));
    try {
      const usuarios = await cliente.query("SELECT id FROM usuario ORDER BY id");
      assert.ok(usuarios.rows.length >= 3, "o professor devia enxergar os alunos");
      const sessoes = await cliente.query("SELECT id_sessao FROM sessao_treino");
      assert.ok(sessoes.rows.length >= 2, "o professor devia enxergar as sessões dos alunos");
    } finally {
      await cliente.end();
    }
  });

  it("usuário inativo não lê nada, mesmo com token válido", async () => {
    const cliente = await conectarComo(tokenDe(4));
    try {
      const { rows } = await cliente.query("SELECT id FROM usuario");
      assert.equal(rows.length, 0);
    } finally {
      await cliente.end();
    }
  });

  it("token anterior à troca de senha não lê nada", async () => {
    await banco.pool.query("UPDATE usuario SET sessoes_invalidadas_em = NOW() WHERE id = 1");
    try {
      const linhas = await comoAluno1("SELECT id FROM usuario");
      assert.equal(linhas.length, 0, "o corte de sessão tinha de valer no PostgREST também");
    } finally {
      await banco.pool.query("UPDATE usuario SET sessoes_invalidadas_em = NULL WHERE id = 1");
    }
  });
});
```

- [ ] **Passo 2: escrever o cenário compartilhado**

`backend/test-rls/cenario.js` — as Tarefas 6, 7 e 8 usam o mesmo.

```js
/**
 * O cenário mínimo que exercita as políticas: dois alunos, um professor, um
 * admin e um inativo; uma ficha por aluno; uma sessão finalizada por aluno.
 *
 * Ids fixos de propósito: os testes falam "o treino 1 é do aluno 1", e um id
 * gerado tornaria as asserções ilegíveis.
 */
export async function cenario(pool) {
  await pool.query(`
    INSERT INTO usuario (id, nome, senha, cpf, email, titulo, aluno, professor, admin, ativo)
    VALUES (1, 'Aluno Um',  'x', '11111111111', 'a1@b.c', '111111111111', TRUE,  FALSE, FALSE, TRUE),
           (2, 'Professor', 'x', '22222222222', 'p@b.c',  '222222222222', FALSE, TRUE,  FALSE, TRUE),
           (3, 'Aluno Dois','x', '33333333333', 'a2@b.c', '333333333333', TRUE,  FALSE, FALSE, TRUE),
           (4, 'Inativo',   'x', '44444444444', 'i@b.c',  '444444444444', TRUE,  FALSE, FALSE, FALSE),
           (5, 'Admin',     'x', '55555555555', 'd@b.c',  '555555555555', FALSE, FALSE, TRUE,  TRUE)`);

  await pool.query(`
    INSERT INTO treino (id_treino, id_aluno, id_professor)
    VALUES (1, 1, 2), (2, 3, 2)`);

  await pool.query(`
    INSERT INTO treino_bloco (id_bloco, id_treino, letra, nome, ordem)
    VALUES (1, 1, 'A', 'Peito', 1), (2, 2, 'A', 'Costas', 1)`);

  await pool.query(`
    INSERT INTO ex_usuario (id, id_treino, id_bloco, id_user, id_exercicio, numero_serie, repeticoes)
    VALUES (1, 1, 1, 1, 1, 3, '10'), (2, 2, 2, 3, 1, 3, '10')`);

  await pool.query(`
    INSERT INTO sessao_treino (id_sessao, id_treino, id_bloco, id_aluno, finalizado_em, duracao_segundos)
    VALUES (1, 1, 1, 1, NOW(), 3600), (2, 2, 2, 3, NOW(), 3600)`);

  await pool.query(`
    INSERT INTO sessao_exercicio (id, id_sessao, id_ex_usuario, concluido)
    VALUES (1, 1, 1, TRUE), (2, 2, 2, TRUE)`);

  await pool.query(`
    INSERT INTO sessao_serie (id, id_sessao_exercicio, carga, repeticoes)
    VALUES (1, 1, 20, '10'), (2, 2, 20, '10')`);

  await pool.query(`
    INSERT INTO pedido_treino (id_pedido, id_aluno, ativo) VALUES (1, 1, TRUE), (2, 3, TRUE)`);

  // As sequências ficam atrás dos ids fixos: sem isto, o primeiro INSERT sem id
  // explícito colide com uma linha do cenário, e o erro parece bug de política.
  for (const [tabela, coluna] of [
    ["usuario", "id"],
    ["treino", "id_treino"],
    ["treino_bloco", "id_bloco"],
    ["ex_usuario", "id"],
    ["sessao_treino", "id_sessao"],
    ["sessao_exercicio", "id"],
    ["sessao_serie", "id"],
    ["pedido_treino", "id_pedido"],
  ]) {
    await pool.query(
      `SELECT setval(pg_get_serial_sequence($1, $2),
                     coalesce((SELECT max(${coluna}) FROM ${tabela}), 1))`,
      [tabela, coluna],
    );
  }
}
```

- [ ] **Passo 3: rodar e ver falhar**

Esperado: FALHA — sem política, toda leitura volta vazia e o primeiro teste já quebra.

- [ ] **Passo 4: escrever as políticas de leitura**

Acrescente a `backend/db/rls.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Camada 3: as politicas. Leitura.
-- ---------------------------------------------------------------------------
--
-- Uma politica por acao e por papel, e nao uma politica generica com OR: com
-- politicas separadas, o Postgres soma (OR) as PERMISSIVE automaticamente, e
-- cada uma fica legivel sozinha. Vermelho aqui e vulnerabilidade, nao teste
-- desatualizado -- mesma regra do seguranca.test.js.

CREATE POLICY usuario_le_a_si ON usuario FOR SELECT TO authenticated
  USING (id = auth_id_valido());

CREATE POLICY usuario_professor_le ON usuario FOR SELECT TO authenticated
  USING (auth_e_professor() OR auth_e_admin());

-- Catalogo e publico para quem esta autenticado: nao tem dono nem dado pessoal.
CREATE POLICY exercicio_le ON exercicio FOR SELECT TO authenticated
  USING (auth_id_valido() IS NOT NULL);

CREATE POLICY treino_le_o_proprio ON treino FOR SELECT TO authenticated
  USING (id_aluno = auth_id_valido());
CREATE POLICY treino_professor_le ON treino FOR SELECT TO authenticated
  USING (auth_e_professor() OR auth_e_admin());

-- treino_bloco nao tem id_aluno: o dono vem pelo treino. EXISTS em vez de IN
-- porque o planejador para no primeiro acerto.
CREATE POLICY bloco_le_o_proprio ON treino_bloco FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM treino t
                  WHERE t.id_treino = treino_bloco.id_treino
                    AND t.id_aluno = auth_id_valido()));
CREATE POLICY bloco_professor_le ON treino_bloco FOR SELECT TO authenticated
  USING (auth_e_professor() OR auth_e_admin());

-- ex_usuario tem id_user desnormalizado; usar ele evita um join por linha.
CREATE POLICY ex_le_o_proprio ON ex_usuario FOR SELECT TO authenticated
  USING (id_user = auth_id_valido());
CREATE POLICY ex_professor_le ON ex_usuario FOR SELECT TO authenticated
  USING (auth_e_professor() OR auth_e_admin());

CREATE POLICY pedido_le_o_proprio ON pedido_treino FOR SELECT TO authenticated
  USING (id_aluno = auth_id_valido());
CREATE POLICY pedido_professor_le ON pedido_treino FOR SELECT TO authenticated
  USING (auth_e_professor() OR auth_e_admin());

CREATE POLICY sessao_le_a_propria ON sessao_treino FOR SELECT TO authenticated
  USING (id_aluno = auth_id_valido());
CREATE POLICY sessao_professor_le ON sessao_treino FOR SELECT TO authenticated
  USING (auth_e_professor() OR auth_e_admin());

CREATE POLICY sessao_ex_le ON sessao_exercicio FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sessao_treino s
                  WHERE s.id_sessao = sessao_exercicio.id_sessao
                    AND s.id_aluno = auth_id_valido()));
CREATE POLICY sessao_ex_professor_le ON sessao_exercicio FOR SELECT TO authenticated
  USING (auth_e_professor() OR auth_e_admin());

CREATE POLICY sessao_serie_le ON sessao_serie FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sessao_exercicio se
                   JOIN sessao_treino s ON s.id_sessao = se.id_sessao
                  WHERE se.id = sessao_serie.id_sessao_exercicio
                    AND s.id_aluno = auth_id_valido()));
CREATE POLICY sessao_serie_professor_le ON sessao_serie FOR SELECT TO authenticated
  USING (auth_e_professor() OR auth_e_admin());
```

- [ ] **Passo 5: rodar e ver passar**

- [ ] **Passo 6: provar o isolamento entre alunos**

Troque a `USING` de `sessao_le_a_propria` por `USING (true)`. O teste "o aluno não lê a sessão de
outro aluno" **tem de ficar vermelho**. Desfaça.

- [ ] **Passo 7: commit**

```bash
git add backend/db/rls.sql backend/test-rls/leitura.test.js backend/test-rls/cenario.js
git commit -m "politicas de leitura: aluno ve o proprio, professor ve os alunos"
```

---

### Tarefa 7: Políticas de escrita

**Arquivos:**
- Modificar: `backend/db/rls.sql`
- Criar: `backend/test-rls/escrita.test.js`

**Interfaces:**
- Produz: políticas `INSERT`/`UPDATE`. O aluno cria **sessão** e **pedido** e nada mais; o professor
  escreve ficha e fecha pedido.

**A premissa que esta tarefa aceita, escrita para não ser esquecida:** o aluno passa a inserir
sessão direto, sem os controllers, e pode gravar duração absurda. O RLS garante que ele escreve
**na própria linha**, não que o dado faça sentido. É decisão consciente da spec, não descuido.

- [ ] **Passo 1: escrever o teste**

`backend/test-rls/escrita.test.js`:

```js
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { abrirBanco, conectarComo, recusa, tokenDe } from "./ajuda.js";
import { cenario } from "./cenario.js";

describe("políticas de escrita", () => {
  let banco;
  before(async () => {
    banco = await abrirBanco();
    await banco.aplicar("rls.sql");
    await cenario(banco.pool);
  });
  after(() => banco.encerrar());

  async function comoAluno1(sql, valores) {
    const cliente = await conectarComo(tokenDe(1));
    try {
      return await recusa(cliente, sql, valores);
    } finally {
      await cliente.end();
    }
  }

  it("o aluno cria sessão para si", async () => {
    const erro = await comoAluno1(
      `INSERT INTO sessao_treino (id_treino, id_bloco, id_aluno, finalizado_em, duracao_segundos, uuid)
       VALUES (1, 1, 1, NOW(), 100, gen_random_uuid())`,
    );
    assert.equal(erro, null, `devia ter deixado: ${erro?.message}`);
  });

  it("o aluno NÃO cria sessão no nome de outro", async () => {
    const erro = await comoAluno1(
      `INSERT INTO sessao_treino (id_treino, id_bloco, id_aluno, finalizado_em, duracao_segundos, uuid)
       VALUES (2, 2, 3, NOW(), 100, gen_random_uuid())`,
    );
    assert.ok(erro, "escrever sessão de outro aluno tinha de ser recusado");
    assert.match(erro.message, /row-level security|violates/i);
  });

  it("o aluno cria o próprio pedido de treino", async () => {
    const erro = await comoAluno1(
      "INSERT INTO pedido_treino (id_aluno, ativo, uuid) VALUES (1, TRUE, gen_random_uuid())",
    );
    assert.equal(erro, null, `devia ter deixado: ${erro?.message}`);
  });

  it("o aluno NÃO escreve ficha", async () => {
    for (const sql of [
      "INSERT INTO treino (id_aluno, id_professor) VALUES (1, 2)",
      "INSERT INTO treino_bloco (id_treino, letra, ordem) VALUES (1, 'Z', 9)",
      `INSERT INTO ex_usuario (id_treino, id_bloco, id_user, id_exercicio, numero_serie, repeticoes)
       VALUES (1, 1, 1, 1, 3, '10')`,
    ]) {
      const erro = await comoAluno1(sql);
      assert.ok(erro, `o aluno conseguiu escrever ficha: ${sql}`);
    }
  });

  it("o aluno NÃO altera a própria ficha por UPDATE", async () => {
    const erro = await comoAluno1("UPDATE ex_usuario SET carga = 999 WHERE id = 1");
    // UPDATE sem política aplicável não lança: ele não encontra linha e afeta
    // zero. O que não pode é a carga ter mudado.
    const { rows } = await banco.pool.query("SELECT carga FROM ex_usuario WHERE id = 1");
    assert.notEqual(rows[0].carga, 999, "o aluno alterou a própria prescrição");
    assert.equal(erro, null);
  });

  it("o aluno NÃO se promove a professor", async () => {
    await comoAluno1("UPDATE usuario SET professor = TRUE WHERE id = 1");
    const { rows } = await banco.pool.query("SELECT professor FROM usuario WHERE id = 1");
    assert.equal(rows[0].professor, false, "escalada de privilégio pelo PostgREST");
  });

  it("o professor escreve a ficha do aluno", async () => {
    const cliente = await conectarComo(tokenDe(2));
    try {
      const erro = await recusa(
        cliente,
        "INSERT INTO treino (id_aluno, id_professor) VALUES (1, 2)",
      );
      assert.equal(erro, null, `o professor devia poder: ${erro?.message}`);
    } finally {
      await cliente.end();
    }
  });

  it("o professor fecha o pedido", async () => {
    const cliente = await conectarComo(tokenDe(2));
    try {
      const erro = await recusa(cliente, "UPDATE pedido_treino SET ativo = FALSE WHERE id_pedido = 1");
      assert.equal(erro, null, `o professor devia poder fechar: ${erro?.message}`);
      const { rows } = await banco.pool.query(
        "SELECT ativo FROM pedido_treino WHERE id_pedido = 1",
      );
      assert.equal(rows[0].ativo, false);
    } finally {
      await cliente.end();
    }
  });

  it("professor rebaixado para de escrever na hora", async () => {
    await banco.pool.query("UPDATE usuario SET professor = FALSE WHERE id = 2");
    const cliente = await conectarComo(tokenDe(2));
    try {
      const erro = await recusa(
        cliente,
        "INSERT INTO treino (id_aluno, id_professor) VALUES (1, 2)",
      );
      assert.ok(erro, "o mesmo token continuou escrevendo depois do rebaixamento");
    } finally {
      await cliente.end();
      await banco.pool.query("UPDATE usuario SET professor = TRUE WHERE id = 2");
    }
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Esperado: FALHA no primeiro teste — sem política de `INSERT`, o aluno não cria nem a própria sessão.

- [ ] **Passo 3: escrever as políticas de escrita**

Acrescente a `backend/db/rls.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Politicas de escrita.
-- ---------------------------------------------------------------------------
--
-- A premissa aceita na spec: o aluno passa a inserir sessao sem os controllers,
-- e pode gravar duracao absurda. O que o RLS garante e que ele escreve na
-- PROPRIA linha -- nao adultera sessao de outro aluno nem escreve ficha.

CREATE POLICY sessao_aluno_cria ON sessao_treino FOR INSERT TO authenticated
  WITH CHECK (id_aluno = auth_id_valido());

CREATE POLICY sessao_ex_aluno_cria ON sessao_exercicio FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM sessao_treino s
                       WHERE s.id_sessao = sessao_exercicio.id_sessao
                         AND s.id_aluno = auth_id_valido()));

CREATE POLICY sessao_serie_aluno_cria ON sessao_serie FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM sessao_exercicio se
                        JOIN sessao_treino s ON s.id_sessao = se.id_sessao
                       WHERE se.id = sessao_serie.id_sessao_exercicio
                         AND s.id_aluno = auth_id_valido()));

CREATE POLICY pedido_aluno_cria ON pedido_treino FOR INSERT TO authenticated
  WITH CHECK (id_aluno = auth_id_valido());

-- O professor escreve a ficha. Nao ha politica de escrita de ficha para aluno
-- nenhum: a ausencia e a regra.
CREATE POLICY treino_professor_escreve ON treino FOR INSERT TO authenticated
  WITH CHECK (auth_e_professor() OR auth_e_admin());
CREATE POLICY treino_professor_atualiza ON treino FOR UPDATE TO authenticated
  USING (auth_e_professor() OR auth_e_admin())
  WITH CHECK (auth_e_professor() OR auth_e_admin());

CREATE POLICY bloco_professor_escreve ON treino_bloco FOR INSERT TO authenticated
  WITH CHECK (auth_e_professor() OR auth_e_admin());
CREATE POLICY bloco_professor_atualiza ON treino_bloco FOR UPDATE TO authenticated
  USING (auth_e_professor() OR auth_e_admin())
  WITH CHECK (auth_e_professor() OR auth_e_admin());

CREATE POLICY ex_professor_escreve ON ex_usuario FOR INSERT TO authenticated
  WITH CHECK (auth_e_professor() OR auth_e_admin());
CREATE POLICY ex_professor_atualiza ON ex_usuario FOR UPDATE TO authenticated
  USING (auth_e_professor() OR auth_e_admin())
  WITH CHECK (auth_e_professor() OR auth_e_admin());

CREATE POLICY exercicio_professor_cria ON exercicio FOR INSERT TO authenticated
  WITH CHECK (auth_e_professor() OR auth_e_admin());

CREATE POLICY pedido_professor_fecha ON pedido_treino FOR UPDATE TO authenticated
  USING (auth_e_professor() OR auth_e_admin())
  WITH CHECK (auth_e_professor() OR auth_e_admin());

-- Usuario: o professor cria e edita aluno. Nao ha politica de UPDATE para o
-- proprio usuario -- trocar a propria senha continua sendo rota da API, com a
-- senha atual exigida, e nao ha caminho por aqui para se promover.
CREATE POLICY usuario_professor_cria ON usuario FOR INSERT TO authenticated
  WITH CHECK (auth_e_professor() OR auth_e_admin());
CREATE POLICY usuario_professor_edita ON usuario FOR UPDATE TO authenticated
  USING (auth_e_professor() OR auth_e_admin())
  WITH CHECK (auth_e_professor() OR auth_e_admin());
```

- [ ] **Passo 4: rodar e ver passar**

- [ ] **Passo 5: provar as duas travas que mais importam**

Primeiro: troque o `WITH CHECK` de `sessao_aluno_cria` por `WITH CHECK (true)`. O teste "o aluno NÃO
cria sessão no nome de outro" **tem de ficar vermelho**. Desfaça.

Depois: acrescente `CREATE POLICY teste ON usuario FOR UPDATE TO authenticated USING (id =
auth_id_valido()) WITH CHECK (id = auth_id_valido());`. O teste "o aluno NÃO se promove a professor"
**tem de ficar vermelho** — é a prova de que a ausência de política de auto-UPDATE é o que segura a
escalada. Remova a política de teste.

- [ ] **Passo 6: commit**

```bash
git add backend/db/rls.sql backend/test-rls/escrita.test.js
git commit -m "politicas de escrita: aluno so cria sessao e pedido"
```

---

### Tarefa 8: `sincronizar_sessao`

**Arquivos:**
- Criar: `backend/db/sincronizacao.sql`
- Criar: `backend/test-rls/sincronizar.test.js`

(`ajuda.js` não muda: o `aplicar()` da Tarefa 1 já recebe o nome do arquivo.)

**Interfaces:**
- Consome: as políticas das Tarefas 6 e 7, a coluna `uuid` da Tarefa 2.
- Produz: `sincronizar_sessao(pacote JSONB) → JSONB` com a forma
  `{"id_sessao": <int>, "criada": <bool>}`. A leva 3 chama isto pelo PostgREST.

**Por que uma função e não três `POST`:** as linhas filhas referenciam `id_sessao`, que é o `SERIAL`
do servidor e o aparelho não conhece — sairia um vaivém de "insere, lê o id, insere os filhos", com
meia sessão gravada se a rede cair no meio.

**Por que `SECURITY INVOKER`:** a função não é uma porta que escapa do RLS. É só a forma de mandar o
pacote junto; as políticas continuam valendo dentro dela. `SECURITY DEFINER` aqui seria um buraco
que anularia a Tarefa 7 inteira.

- [ ] **Passo 1: escrever o teste**

`backend/test-rls/sincronizar.test.js`:

```js
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { abrirBanco, conectarComo, recusa, tokenDe } from "./ajuda.js";
import { cenario } from "./cenario.js";

/** Pacote no formato que o aparelho vai montar na leva 3. */
function pacote({ idAluno = 1, idTreino = 1, idBloco = 1, idExUsuario = 1, uuid = randomUUID() } = {}) {
  return {
    uuid,
    id_treino: idTreino,
    id_bloco: idBloco,
    id_aluno: idAluno,
    iniciado_em: new Date(Date.now() - 3600_000).toISOString(),
    finalizado_em: new Date().toISOString(),
    duracao_segundos: 3600,
    observacao: "pesado",
    calorias: 300,
    exercicios: [
      {
        uuid: randomUUID(),
        id_ex_usuario: idExUsuario,
        concluido: true,
        concluido_em: new Date().toISOString(),
        series: [{ uuid: randomUUID(), carga: 20, repeticoes: "10" }],
      },
    ],
  };
}

describe("sincronizar_sessao", () => {
  let banco;
  before(async () => {
    banco = await abrirBanco();
    await banco.aplicar("rls.sql");
    await banco.aplicar("sincronizacao.sql");
    await cenario(banco.pool);
  });
  after(() => banco.encerrar());

  async function comoAluno(id, p) {
    const cliente = await conectarComo(tokenDe(id));
    try {
      const { rows } = await cliente.query("SELECT sincronizar_sessao($1::jsonb) AS r", [
        JSON.stringify(p),
      ]);
      return rows[0].r;
    } finally {
      await cliente.end();
    }
  }

  it("grava a sessão inteira numa chamada", async () => {
    const p = pacote();
    const r = await comoAluno(1, p);
    assert.equal(r.criada, true);

    const { rows } = await banco.pool.query(
      `SELECT s.id_sessao, s.duracao_segundos,
              (SELECT count(*)::int FROM sessao_exercicio se WHERE se.id_sessao = s.id_sessao) AS exercicios,
              (SELECT count(*)::int FROM sessao_serie ss
                 JOIN sessao_exercicio se2 ON se2.id = ss.id_sessao_exercicio
                WHERE se2.id_sessao = s.id_sessao) AS series
         FROM sessao_treino s WHERE s.uuid = $1`,
      [p.uuid],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].duracao_segundos, 3600);
    assert.equal(rows[0].exercicios, 1);
    assert.equal(rows[0].series, 1);
  });

  it("o mesmo pacote duas vezes dá uma sessão só", async () => {
    const p = pacote();
    const primeira = await comoAluno(1, p);
    const segunda = await comoAluno(1, p);

    assert.equal(primeira.criada, true);
    assert.equal(segunda.criada, false, "a segunda tinha de ser reconhecida como repetida");
    assert.equal(segunda.id_sessao, primeira.id_sessao);

    const { rows } = await banco.pool.query(
      "SELECT count(*)::int AS total FROM sessao_treino WHERE uuid = $1",
      [p.uuid],
    );
    assert.equal(rows[0].total, 1);
  });

  it("não deixa subir sessão no nome de outro aluno — a função não escapa do RLS", async () => {
    const cliente = await conectarComo(tokenDe(1));
    try {
      const erro = await recusa(cliente, "SELECT sincronizar_sessao($1::jsonb)", [
        JSON.stringify(pacote({ idAluno: 3, idTreino: 2, idBloco: 2, idExUsuario: 2 })),
      ]);
      assert.ok(erro, "subir sessão de outro aluno tinha de ser recusado");
    } finally {
      await cliente.end();
    }
  });

  it("falha no meio não deixa meia sessão", async () => {
    // id_ex_usuario que não existe: a FK estoura depois de a sessão-pai já ter
    // sido inserida. Se a função não for transacional, sobra órfã.
    const p = pacote();
    p.exercicios[0].id_ex_usuario = 99999;

    const cliente = await conectarComo(tokenDe(1));
    try {
      const erro = await recusa(cliente, "SELECT sincronizar_sessao($1::jsonb)", [
        JSON.stringify(p),
      ]);
      assert.ok(erro, "id_ex_usuario inexistente tinha de estourar");
    } finally {
      await cliente.end();
    }

    const { rows } = await banco.pool.query(
      "SELECT count(*)::int AS total FROM sessao_treino WHERE uuid = $1",
      [p.uuid],
    );
    assert.equal(rows[0].total, 0, "sobrou sessão órfã: a função não é atômica");
  });

  it("sessão sem finalizado_em é recusada — só sessão fechada sobe", async () => {
    const p = pacote();
    p.finalizado_em = null;

    const cliente = await conectarComo(tokenDe(1));
    try {
      const erro = await recusa(cliente, "SELECT sincronizar_sessao($1::jsonb)", [
        JSON.stringify(p),
      ]);
      assert.ok(erro, "sessão aberta não podia subir");
      assert.match(erro.message, /finalizada/i);
    } finally {
      await cliente.end();
    }
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Esperado: FALHA com `function sincronizar_sessao(jsonb) does not exist`.

- [ ] **Passo 3: escrever a função**

`backend/db/sincronizacao.sql`:

```sql
-- A subida do APK: um pacote, uma transacao.
--
-- Fica fora do schema.sql pelo mesmo motivo do rls.sql: plpgsql, que o pg-mem
-- da suite principal nao executa.
--
-- Tres POST no PostgREST nao serviriam: as linhas filhas referenciam
-- id_sessao, que e o SERIAL do servidor e o aparelho nao conhece. Sairia um
-- vaivem de "insere, le o id, insere os filhos", com meia sessao gravada se a
-- rede cair no meio.
--
-- Aplicar:  psql -U <usuario> -d <banco> -f db/sincronizacao.sql

CREATE OR REPLACE FUNCTION sincronizar_sessao(pacote JSONB)
RETURNS JSONB
LANGUAGE plpgsql
-- SECURITY INVOKER, e nao DEFINER: as politicas continuam valendo dentro da
-- funcao. Ela nao e uma porta que escapa do RLS -- e so a forma de mandar o
-- pacote junto. DEFINER aqui anularia as politicas de escrita inteiras.
SECURITY INVOKER
AS $$
DECLARE
  v_uuid          UUID    := (pacote ->> 'uuid')::UUID;
  v_id_sessao     INTEGER;
  v_exercicio     JSONB;
  v_serie         JSONB;
  v_id_sessao_ex  INTEGER;
BEGIN
  IF v_uuid IS NULL THEN
    RAISE EXCEPTION 'pacote sem uuid';
  END IF;

  -- So sessao finalizada sobe, o que a torna imutavel: nada que subiu muda
  -- depois. De quebra nunca briga com idx_sessao_aberta_por_aluno.
  IF (pacote ->> 'finalizado_em') IS NULL THEN
    RAISE EXCEPTION 'so sessao finalizada pode subir';
  END IF;

  -- Idempotencia: uuid ja gravado devolve o que existe, sem tocar em nada. O
  -- app pode ter morrido entre inserir e marcar que subiu.
  SELECT id_sessao INTO v_id_sessao FROM sessao_treino WHERE uuid = v_uuid;
  IF FOUND THEN
    RETURN jsonb_build_object('id_sessao', v_id_sessao, 'criada', false);
  END IF;

  INSERT INTO sessao_treino (
    id_treino, id_bloco, id_aluno, iniciado_em, finalizado_em,
    duracao_segundos, observacao, calorias, uuid
  ) VALUES (
    (pacote ->> 'id_treino')::INTEGER,
    (pacote ->> 'id_bloco')::INTEGER,
    (pacote ->> 'id_aluno')::INTEGER,
    (pacote ->> 'iniciado_em')::TIMESTAMPTZ,
    (pacote ->> 'finalizado_em')::TIMESTAMPTZ,
    (pacote ->> 'duracao_segundos')::INTEGER,
    pacote ->> 'observacao',
    (pacote ->> 'calorias')::INTEGER,
    v_uuid
  )
  RETURNING id_sessao INTO v_id_sessao;

  FOR v_exercicio IN
    SELECT * FROM jsonb_array_elements(coalesce(pacote -> 'exercicios', '[]'::jsonb))
  LOOP
    INSERT INTO sessao_exercicio (id_sessao, id_ex_usuario, concluido, concluido_em, uuid)
    VALUES (
      v_id_sessao,
      (v_exercicio ->> 'id_ex_usuario')::INTEGER,
      coalesce((v_exercicio ->> 'concluido')::BOOLEAN, FALSE),
      (v_exercicio ->> 'concluido_em')::TIMESTAMPTZ,
      (v_exercicio ->> 'uuid')::UUID
    )
    RETURNING id INTO v_id_sessao_ex;

    FOR v_serie IN
      SELECT * FROM jsonb_array_elements(coalesce(v_exercicio -> 'series', '[]'::jsonb))
    LOOP
      INSERT INTO sessao_serie (id_sessao_exercicio, carga, repeticoes, uuid)
      VALUES (
        v_id_sessao_ex,
        (v_serie ->> 'carga')::INTEGER,
        v_serie ->> 'repeticoes',
        (v_serie ->> 'uuid')::UUID
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('id_sessao', v_id_sessao, 'criada', true);
END;
$$;

-- Toda funcao nasce com EXECUTE para PUBLIC: revogar de PUBLIC e o que tem
-- efeito, e nao revogar so de anon.
REVOKE ALL ON FUNCTION sincronizar_sessao(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sincronizar_sessao(JSONB) TO authenticated;
```

**Nota sobre atomicidade:** uma função plpgsql roda dentro da transação de quem chamou. Uma exceção
lá dentro desfaz tudo o que ela fez — é daí que vem o "falha no meio não deixa meia sessão", sem
`BEGIN`/`COMMIT` explícitos (que aliás não são permitidos aqui).

- [ ] **Passo 4: rodar e ver passar**

- [ ] **Passo 5: provar que a função não escapa do RLS**

Troque `SECURITY INVOKER` por `SECURITY DEFINER` e rode. O teste "não deixa subir sessão no nome de
outro aluno" **tem de ficar vermelho** — é a prova de que a escolha do modo é o que segura essa
porta. Desfaça.

Depois, para provar a idempotência: comente o bloco `IF FOUND THEN RETURN ...`. O teste "o mesmo
pacote duas vezes" **tem de ficar vermelho**, agora com erro de índice único — o que também mostra
que o índice é a garantia de verdade, e o `IF FOUND` só evita o erro. Desfaça.

- [ ] **Passo 6: commit**

```bash
git add backend/db/sincronizacao.sql backend/test-rls/sincronizar.test.js
git commit -m "sincronizar_sessao: pacote fechado, transacional, sem escapar do RLS"
```

---

### Tarefa 9: Fechamento da leva

**Arquivos:**
- Modificar: `backend/README.md`
- Modificar: `CLAUDE.md`
- Criar: `backend/test-rls/README.md`

**Não aplicar nada no Supabase nesta tarefa.** A leva 1 entrega o SQL provado localmente; aplicar no
projeto real é decisão dele, e a Data API continua fechada de qualquer forma.

- [ ] **Passo 1: conferir que nada regrediu**

```bash
cd backend && npm test && npm run test:sqlite && npm run test:rls
cd ../frontend && npm test && npm run lint && npm run build
```

Esperado: 260 no backend nos dois bancos, a suíte de RLS inteira verde, 264 no front.

- [ ] **Passo 2: escrever o README da suíte**

`backend/test-rls/README.md`, cobrindo: o que a suíte prova, por que precisa de Docker (o pg-mem não
executa plpgsql nem RLS), como rodar (`npm run test:rls`, `npm run rls:down` para derrubar), que
`teste-supabase-falso.sql` **nunca** deve ser aplicado no Supabase, e que vermelho aqui é
vulnerabilidade e não teste desatualizado — a mesma regra do `seguranca.test.js`.

- [ ] **Passo 3: documentar no `backend/README.md`**

Acrescente uma seção "Autorização no banco (RLS)" com a ordem de aplicação
(`schema.sql` → `rls.sql` → `sincronizacao.sql`), o que cada arquivo faz, e o aviso de que
`migracao-v8-uuid.sql` é para bancos que já existem.

- [ ] **Passo 4: atualizar o `CLAUDE.md`**

Na seção do banco, registrar: os três arquivos SQL que ficam fora do `schema.sql` e por quê; que a
autorização passa a existir em dois lugares (`exigirPerfil` e as políticas), e que a suíte de RLS
existe para pegar a divergência; que `auth_id_valido()` replica o corte de sessão do
`src/middlewares/auth.js`, **inclusive o truncamento para segundos** — mudar um lado sem o outro faz
as duas portas divergirem.

- [ ] **Passo 5: commit**

```bash
git add backend/README.md backend/test-rls/README.md CLAUDE.md
git commit -m "fecha a leva 1 da sincronizacao: documentacao do SQL e da suite"
```

---

## Como se sabe que a leva acabou

- `npm run test:rls` passa inteira num Postgres de verdade.
- `npm test` e `npm run test:sqlite` seguem em 260; o front, em 264.
- Nenhum arquivo de `frontend/src/local/` mudou — o APK instalado continua o de hoje.
- A Data API do Supabase **continua fechada**. Reabri-la é a leva 3.
- Os arquivos `rls.sql` e `sincronizacao.sql` nunca foram montados no `docker-compose.yml` de
  desenvolvimento.

## O que esta leva deliberadamente não faz

| | Por quê |
|---|---|
| A Edge Function | Leva 2. Aqui só nasce a tabela de tentativas que ela vai usar |
| Aplicar o SQL no Supabase | Decisão dele, depois de ver a suíte verde |
| A coluna `sincronizado_em` | É **local** do SQLite do aparelho, não do servidor. Entra na leva 3 |
| Qualquer mudança no app | Levas 3 a 5 |
| Tirar os aliases `GET` de `/treino/inativar/:id` | Pendência antiga, sem relação |
