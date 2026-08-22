# Leva 1 — o banco do APK, provado sem Android

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> caixas (`- [ ]`) para acompanhamento.

**Objetivo:** fazer os 179 testes do backend rodarem também sobre SQLite, provando que as regras se
comportam igual no banco que vai dentro do APK.

**Arquitetura:** um tradutor de dialeto (função pura de string para string) e um driver que imita a
interface do pool do `pg`. Nenhum controller, rota ou middleware é alterado — a troca acontece na
fachada `db`, que já é injetável por causa dos testes. Ao fim, `npm test` roda no `pg-mem` e
`npm run test:sqlite` roda a mesma suíte no SQLite.

**Tecnologias:** Node ≥20 (ESM), `node:sqlite` (nativo, já disponível no Node 25 da máquina),
`pg-mem` (continua para o dialeto PostgreSQL), `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-22-app-android-standalone-design.md`

## Restrições globais

- **Nada de `sed -i`** para editar arquivo-fonte neste Windows: grava por arquivo temporário +
  rename, o observador do Vite não percebe e passa a servir módulo velho. Usar editor ou script Node.
- **Nenhum arquivo de `src/controllers/`, `src/routes/` ou `src/middlewares/` é alterado nesta leva.**
  Se um teste só passa mexendo em controller, isso é achado a relatar, não licença para editar.
- **Timestamps sempre em ISO UTC com `Z`.** `CURRENT_TIMESTAMP` do SQLite grava
  `"2026-08-22 19:48:04"`, que `new Date()` lê como hora **local** — três horas de erro no Brasil, e a
  expulsão de sessão por troca de senha/CPF passaria a acontecer na hora errada.
- **Formato do hash de senha inalterado:** `"<sal_hex>:<hash_hex>"`, scrypt.
- **Comentários explicam o porquê**, não o quê. Vários marcam armadilha já resolvida.
- **Commits em pt-BR, sem acento na mensagem, direto na `main`, sem push.** Sem `Co-Authored-By`.
- `node:sqlite` é experimental no Node 25 e emite aviso: os scripts usam
  `--disable-warning=ExperimentalWarning`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/dialetoSqlite.js` (novo) | Traduzir SQL do PostgreSQL para SQLite. Função pura, sem I/O. |
| `src/config/sqlite.js` (novo) | Driver: abre o banco, imita a interface do pool, converte valores na ida e na volta. |
| `test/dialetoSqlite.test.js` (novo) | Testes do tradutor, isolados. |
| `test/sqlite.test.js` (novo) | Testes do driver contra um banco de verdade em memória. |
| `test/helpers.js` (alterado) | Escolher o banco, e expor SQL cru de forma neutra aos testes. |
| 6 arquivos de teste (alterados) | Trocar os 7 usos de `api.memoria` pelos helpers neutros. |
| `package.json` (alterado) | Script `test:sqlite`. |

O tradutor e o driver são separados de propósito: o tradutor é a parte que erra de forma sutil, e
sendo função pura ele é testável linha a linha, sem banco no caminho.

---

### Tarefa 1: O tradutor de dialeto

**Arquivos:**
- Criar: `backend/src/lib/dialetoSqlite.js`
- Teste: `backend/test/dialetoSqlite.test.js`

**Interfaces:**
- Consome: nada.
- Produz: `traduzir(sql: string) => string` e `AGORA: string` (a expressão de data e hora do SQLite,
  reutilizada pelo driver e pelos helpers de teste).

- [ ] **Passo 1: escrever os testes que falham**

Criar `backend/test/dialetoSqlite.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { traduzir, AGORA } from "../src/lib/dialetoSqlite.js";

test("parametro $n vira ?n, preservando o numero", () => {
  assert.equal(traduzir("SELECT * FROM usuario WHERE id = $1"), "SELECT * FROM usuario WHERE id = ?1");
  assert.equal(traduzir("VALUES ($1, $2, $10)"), "VALUES (?1, ?2, ?10)");
});

// O projeto reusa o mesmo parametro na mesma consulta (a busca por cpf OU titulo).
// Trocar por "?" sem numero quebraria isso em silencio, consumindo dois valores.
test("o mesmo parametro repetido continua apontando para o mesmo valor", () => {
  assert.equal(
    traduzir("WHERE ($1 <> '' AND cpf = $1) OR ($2 <> '' AND titulo = $2)"),
    "WHERE (?1 <> '' AND cpf = ?1) OR (?2 <> '' AND titulo = ?2)"
  );
});

test("ILIKE vira LIKE", () => {
  assert.equal(traduzir("WHERE nome ILIKE $1"), "WHERE nome LIKE ?1");
});

test("NOW() vira a expressao de agora do SQLite", () => {
  assert.equal(traduzir("SET criado_em = NOW()"), `SET criado_em = ${AGORA}`);
});

// A data precisa sair em ISO UTC: o CURRENT_TIMESTAMP do SQLite grava sem T e sem
// Z, e new Date() disso interpreta como hora local — tres horas de erro aqui.
test("a expressao de agora produz ISO UTC", () => {
  assert.match(AGORA, /%Y-%m-%dT%H:%M:%fZ/);
  assert.match(AGORA, /'now'/);
});

test("os casts do PostgreSQL somem", () => {
  assert.equal(traduzir("SELECT COUNT(*)::int AS total FROM usuario"), "SELECT COUNT(*) AS total FROM usuario");
  assert.equal(traduzir("($2::text IS NOT NULL AND cpf = $2)"), "(?2 IS NOT NULL AND cpf = ?2)");
  assert.equal(traduzir("SELECT $1::int, id FROM ex_usuario"), "SELECT ?1, id FROM ex_usuario");
});

test("SERIAL PRIMARY KEY vira chave que se autoincrementa", () => {
  assert.equal(
    traduzir("    id              SERIAL PRIMARY KEY,"),
    "    id              INTEGER PRIMARY KEY AUTOINCREMENT,"
  );
});

// TIMESTAMPTZ precisa ser trocado ANTES de TIMESTAMP, senao sobra "TEXTTZ".
test("TIMESTAMPTZ e TIMESTAMP viram TEXT, sem sobra", () => {
  assert.equal(traduzir("sessoes_invalidadas_em TIMESTAMPTZ,"), "sessoes_invalidadas_em TEXT,");
  assert.equal(traduzir("atualizado_em   TIMESTAMP,"), "atualizado_em   TEXT,");
  assert.ok(!traduzir("iniciado_em TIMESTAMPTZ NOT NULL").includes("TZ"), "sobrou TZ solto");
});

test("VARCHAR com tamanho e SMALLINT viram tipos do SQLite", () => {
  assert.equal(traduzir("cpf VARCHAR(11) NOT NULL UNIQUE"), "cpf TEXT NOT NULL UNIQUE");
  assert.equal(traduzir("ordem SMALLINT NOT NULL DEFAULT 1"), "ordem INTEGER NOT NULL DEFAULT 1");
});

test("DEFAULT CURRENT_TIMESTAMP passa a gravar ISO UTC", () => {
  assert.equal(
    traduzir("criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"),
    `criado_em TEXT NOT NULL DEFAULT (${AGORA})`
  );
});

// O indice parcial e o motivo de o SQLite ganhar do pg-mem: precisa atravessar
// a traducao intacto.
test("o indice parcial atravessa sem alteracao", () => {
  const sql = `CREATE UNIQUE INDEX IF NOT EXISTS idx_sessao_aberta_por_aluno
    ON sessao_treino (id_aluno) WHERE finalizado_em IS NULL;`;
  assert.equal(traduzir(sql), sql);
});

test("o que nao tem equivalente a traduzir passa igual", () => {
  const sql = "SELECT id, nome FROM usuario WHERE ativo = TRUE ORDER BY nome";
  assert.equal(traduzir(sql), sql);
});
```

- [ ] **Passo 2: rodar e confirmar o vermelho**

```bash
cd backend && node --test test/dialetoSqlite.test.js
```

Esperado: falha ao carregar o módulo — `Cannot find module '../src/lib/dialetoSqlite.js'`.

- [ ] **Passo 3: escrever o tradutor**

Criar `backend/src/lib/dialetoSqlite.js`:

```js
/**
 * Traduz o SQL do projeto, escrito para PostgreSQL, para o dialeto do SQLite —
 * o banco que vai embutido no APK.
 *
 * É uma função só, aplicada a tudo: as regras de DDL não aparecem em consulta e
 * as de consulta não aparecem em DDL, então não há por que ter dois caminhos e
 * arriscar chamar o errado.
 *
 * O que NÃO precisa de tradução, e por isso não está aqui: RETURNING (o SQLite
 * tem desde a 3.35), índice parcial, ON DELETE CASCADE, ON CONFLICT e INTERVAL
 * (que o código de produção não usa).
 */

/**
 * Data e hora de agora, em ISO UTC.
 *
 * Não usar o CURRENT_TIMESTAMP do SQLite: ele grava "2026-08-22 19:48:04", sem
 * T e sem Z, e `new Date()` disso interpreta como hora local — três horas de
 * erro no Brasil. Isso quebraria a comparação do `iat` do token com
 * `sessoes_invalidadas_em`, que é o que expulsa a sessão de quem trocou a senha
 * ou o CPF: a expulsão passaria a valer na hora errada.
 */
export const AGORA = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export function traduzir(sql) {
  return (
    sql
      // $1 vira ?1, e não "?": o SQLite numera igual, e o projeto reusa o mesmo
      // parâmetro na mesma consulta (a busca por CPF ou título). Com "?" solto,
      // a segunda aparição consumiria o valor seguinte.
      .replace(/\$(\d+)/g, "?$1")
      .replace(/\bILIKE\b/gi, "LIKE")
      .replace(/\bNOW\(\)/gi, AGORA)
      // Os casts existem para o PostgreSQL decidir tipo de parâmetro; o SQLite
      // não precisa deles, e o sentido das consultas não muda sem eles.
      .replace(/::(?:int(?:eger)?|text)\b/g, "")
      .replace(/\bSERIAL PRIMARY KEY\b/g, "INTEGER PRIMARY KEY AUTOINCREMENT")
      // TIMESTAMPTZ antes de TIMESTAMP, ou sobraria "TEXTTZ".
      .replace(/\bTIMESTAMPTZ\b/g, "TEXT")
      .replace(/\bTIMESTAMP\b/g, "TEXT")
      .replace(/\bVARCHAR\(\d+\)/g, "TEXT")
      .replace(/\bSMALLINT\b/g, "INTEGER")
      .replace(/DEFAULT CURRENT_TIMESTAMP/g, `DEFAULT (${AGORA})`)
  );
}
```

- [ ] **Passo 4: rodar e confirmar o verde**

```bash
cd backend && node --test test/dialetoSqlite.test.js
```

Esperado: 11 testes passando.

- [ ] **Passo 5: quebrar de propósito e confirmar que o teste protege**

A ordem `TIMESTAMPTZ` antes de `TIMESTAMP` é uma armadilha silenciosa. Inverter as duas linhas do
`traduzir` e rodar de novo: o teste "TIMESTAMPTZ e TIMESTAMP viram TEXT, sem sobra" precisa ficar
**vermelho**, acusando `TEXTTZ`. Depois desfazer.

Mesma coisa com `?$1` → `?`: o teste do parâmetro repetido precisa ficar vermelho. Desfazer.

- [ ] **Passo 6: commit**

```bash
cd backend && git add src/lib/dialetoSqlite.js test/dialetoSqlite.test.js
git commit -m "Traduz o SQL do projeto para o dialeto do SQLite"
```

---

### Tarefa 2: O driver SQLite

**Arquivos:**
- Criar: `backend/src/config/sqlite.js`
- Teste: `backend/test/sqlite.test.js`

**Interfaces:**
- Consome: `traduzir`, `AGORA` de `src/lib/dialetoSqlite.js`.
- Produz: `criarBancoSqlite({ arquivo = ":memory:" }) => bd`, onde `bd` tem:
  - `query(sql, valores?) => Promise<{ rows: object[] }>` — a mesma forma do pool do `pg`
  - `connect() => Promise<{ query, release }>` — para as transações
  - `end() => Promise<void>`
  - `aplicarSql(sql) => void` — executa SQL cru sem retorno (schema, seed)
  - `consultarSql(sql) => object[]` — SQL cru **síncrono** com retorno, já com booleanos
    convertidos. É síncrono porque os testes usam sem `await`, como faziam com o `pg-mem`.

- [ ] **Passo 1: escrever os testes que falham**

Criar `backend/test/sqlite.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { criarBancoSqlite } from "../src/config/sqlite.js";

const caminho = (relativo) => fileURLToPath(new URL(relativo, import.meta.url));
const schema = readFileSync(caminho("../db/schema.sql"), "utf8");

function bancoNovo() {
  const bd = criarBancoSqlite({ arquivo: ":memory:" });
  bd.aplicarSql(schema);
  return bd;
}

const inserirUsuario = (bd, cpf, nome = "Fulano") =>
  bd.query(
    `INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
     VALUES ($1, $2, 'sal:hash', $3, $4, TRUE, FALSE, FALSE, TRUE)
     RETURNING id, nome, ativo, aluno, criado_em`,
    [cpf, nome, `${cpf}@t.com`, `${cpf}0`]
  );

test("aplica o schema.sql de verdade, com as dez tabelas", (t) => {
  const bd = bancoNovo();
  t.after(() => bd.end());

  const nomes = bd.consultarSql("SELECT name FROM sqlite_master WHERE type = 'table'").map((l) => l.name);
  for (const tabela of [
    "usuario", "exercicio", "treino", "treino_bloco", "ex_usuario",
    "sessao_treino", "sessao_exercicio", "pedido_treino", "regras_usuario", "admin_user",
  ]) {
    assert.ok(nomes.includes(tabela), `faltou a tabela ${tabela}`);
  }

  const indices = bd
    .consultarSql("SELECT name FROM sqlite_master WHERE type = 'index'")
    .map((l) => l.name);
  assert.ok(indices.includes("idx_sessao_aberta_por_aluno"), "o indice parcial de sessao aberta nao foi criado");
  assert.ok(indices.includes("idx_bloco_letra_por_treino"), "o indice parcial de letra por treino nao foi criado");
});

test("query devolve { rows }, como o pool do pg", async (t) => {
  const bd = bancoNovo();
  t.after(() => bd.end());

  const resultado = await inserirUsuario(bd, "11111111111");
  assert.ok(Array.isArray(resultado.rows), "precisa vir em rows");
  assert.equal(resultado.rows[0].nome, "Fulano");
  assert.equal(typeof resultado.rows[0].id, "number");
});

// O SQLite guarda 0 e 1. Sem converter, a API devolveria "ativo: 1" e a tela de
// editar usuario compararia false !== 0 como se o perfil tivesse mudado.
test("booleano volta como boolean, e nao como 0 ou 1", async (t) => {
  const bd = bancoNovo();
  t.after(() => bd.end());

  const { rows } = await inserirUsuario(bd, "11111111111");
  assert.equal(rows[0].ativo, true);
  assert.equal(rows[0].aluno, true);
  assert.equal(rows[0].professor ?? false, false, "professor foi gravado como FALSE");
});

// node:sqlite RECUSA boolean como parametro: sem converter, toda escrita com
// flag estoura em "cannot be bound to SQLite parameter".
test("boolean passado como parametro e aceito", async (t) => {
  const bd = bancoNovo();
  t.after(() => bd.end());
  const { rows } = await inserirUsuario(bd, "11111111111");

  await bd.query("UPDATE usuario SET ativo = $1 WHERE id = $2", [false, rows[0].id]);
  const depois = await bd.query("SELECT ativo FROM usuario WHERE id = $1", [rows[0].id]);
  assert.equal(depois.rows[0].ativo, false);
});

// O node:sqlite ACEITA um Date e grava NULL, sem reclamar. E o pior caso:
// finalizado_em ficaria nulo, a sessao nunca fecharia, e o indice de sessao
// aberta barraria a proxima. Silencioso.
test("Date passado como parametro grava a data, e nao null", async (t) => {
  const bd = bancoNovo();
  t.after(() => bd.end());
  const { rows } = await inserirUsuario(bd, "11111111111");

  const quando = new Date("2026-08-22T19:00:00.000Z");
  await bd.query("UPDATE usuario SET sessoes_invalidadas_em = $1 WHERE id = $2", [quando, rows[0].id]);

  const depois = await bd.query("SELECT sessoes_invalidadas_em FROM usuario WHERE id = $1", [rows[0].id]);
  assert.equal(depois.rows[0].sessoes_invalidadas_em, "2026-08-22T19:00:00.000Z");
  assert.equal(new Date(depois.rows[0].sessoes_invalidadas_em).getTime(), quando.getTime());
});

test("criado_em nasce em ISO UTC, legivel por new Date sem erro de fuso", async (t) => {
  const bd = bancoNovo();
  t.after(() => bd.end());

  const { rows } = await inserirUsuario(bd, "11111111111");
  const criado = rows[0].criado_em;
  assert.match(criado, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$/, `formato inesperado: ${criado}`);
  assert.ok(Math.abs(Date.now() - new Date(criado).getTime()) < 60_000, "a hora saiu deslocada");
});

test("coluna nula continua nula, e nao vira false", async (t) => {
  const bd = bancoNovo();
  t.after(() => bd.end());

  const { rows } = await inserirUsuario(bd, "11111111111");
  const { rows: lidas } = await bd.query("SELECT sessoes_invalidadas_em FROM usuario WHERE id = $1", [rows[0].id]);
  assert.equal(lidas[0].sessoes_invalidadas_em, null);
});

test("connect devolve conexao com query e release, e a transacao vale", async (t) => {
  const bd = bancoNovo();
  t.after(() => bd.end());

  const cliente = await bd.connect();
  await cliente.query("BEGIN");
  await inserirUsuario(bd, "11111111111");
  await cliente.query("ROLLBACK");
  cliente.release();

  const { rows } = await bd.query("SELECT COUNT(*)::int AS total FROM usuario");
  assert.equal(rows[0].total, 0, "o ROLLBACK precisa ter desfeito a insercao");
});

test("COMMIT mantem o que foi escrito", async (t) => {
  const bd = bancoNovo();
  t.after(() => bd.end());

  const cliente = await bd.connect();
  await cliente.query("BEGIN");
  await inserirUsuario(bd, "11111111111");
  await cliente.query("COMMIT");
  cliente.release();

  const { rows } = await bd.query("SELECT COUNT(*)::int AS total FROM usuario");
  assert.equal(rows[0].total, 1);
});

// A trava que o pg-mem nao consegue exercitar, e o principal ganho de usar
// SQLite no APK.
test("o indice parcial barra a segunda sessao aberta do mesmo aluno", async (t) => {
  const bd = bancoNovo();
  t.after(() => bd.end());

  const { rows } = await inserirUsuario(bd, "11111111111");
  const id = rows[0].id;
  const { rows: treinos } = await bd.query(
    "INSERT INTO treino (id_aluno, id_professor) VALUES ($1, $1) RETURNING id_treino",
    [id]
  );
  const idTreino = treinos[0].id_treino;

  await bd.query("INSERT INTO sessao_treino (id_treino, id_aluno) VALUES ($1, $2)", [idTreino, id]);
  await assert.rejects(
    () => bd.query("INSERT INTO sessao_treino (id_treino, id_aluno) VALUES ($1, $2)", [idTreino, id]),
    /UNIQUE|constraint/i,
    "duas sessoes abertas para o mesmo aluno precisam ser recusadas"
  );
});

// Sem PRAGMA foreign_keys = ON o SQLite ignora as chaves estrangeiras, e o
// ON DELETE CASCADE de que a edicao de treino depende nao acontece.
test("as chaves estrangeiras estao ligadas, com cascade", async (t) => {
  const bd = bancoNovo();
  t.after(() => bd.end());

  const { rows } = await inserirUsuario(bd, "11111111111");
  const { rows: treinos } = await bd.query(
    "INSERT INTO treino (id_aluno, id_professor) VALUES ($1, $1) RETURNING id_treino",
    [rows[0].id]
  );
  await bd.query("INSERT INTO treino_bloco (id_treino, letra, ordem) VALUES ($1, 'A', 1)", [treinos[0].id_treino]);

  await bd.query("DELETE FROM treino WHERE id_treino = $1", [treinos[0].id_treino]);
  const { rows: blocos } = await bd.query("SELECT COUNT(*)::int AS total FROM treino_bloco");
  assert.equal(blocos[0].total, 0, "o cascade precisa ter levado o bloco");

  await assert.rejects(
    () => bd.query("INSERT INTO treino (id_aluno, id_professor) VALUES (9999, 9999)"),
    /FOREIGN KEY|constraint/i,
    "aluno inexistente precisa ser recusado"
  );
});
```

- [ ] **Passo 2: rodar e confirmar o vermelho**

```bash
cd backend && node --test --disable-warning=ExperimentalWarning test/sqlite.test.js
```

Esperado: falha ao carregar `../src/config/sqlite.js`.

- [ ] **Passo 3: escrever o driver**

Criar `backend/src/config/sqlite.js`:

```js
import { DatabaseSync } from "node:sqlite";
import { traduzir } from "../lib/dialetoSqlite.js";

/**
 * Driver SQLite com a mesma interface do pool do `pg`, para entrar na fachada
 * `db` por `configurarPool()` — o mesmo encaixe que o pg-mem usa nos testes.
 *
 * É o banco que vai dentro do APK: um arquivo, sem servidor, e a persistência
 * é do próprio motor. Nos testes roda em memória.
 *
 * Há uma conexão só, e não um pool. Para `connect()` isso significa devolver
 * sempre a mesma, com `release()` que não faz nada: o SQLite não tem conexão
 * ociosa para devolver, e no APK existe um usuário só. Consequência a saber:
 * uma transação aberta aqui envolve tudo que rodar enquanto ela estiver aberta.
 * Nenhuma transação do projeto é aninhada nem concorrente, então isso não
 * muda comportamento.
 */
export function criarBancoSqlite({ arquivo = ":memory:" } = {}) {
  const conexao = new DatabaseSync(arquivo);

  // Sem isto o SQLite ignora as chaves estrangeiras — e o ON DELETE CASCADE de
  // que a edição de treino depende simplesmente não aconteceria.
  conexao.exec("PRAGMA foreign_keys = ON");

  let booleanas = new Set();

  /**
   * Nomes de coluna declaradas BOOLEAN no schema.
   *
   * O SQLite guarda 0 e 1. Sem converter na volta, a API devolveria `ativo: 1`,
   * e o EditarUsuario compara `perfis.aluno !== usuario.aluno` — `false !== 0`
   * é verdadeiro, então a tela acharia que o perfil mudou a cada abertura.
   *
   * O conjunto sai do schema, e não de uma lista digitada aqui, para não
   * envelhecer quando uma flag nova aparecer. O limite: consulta que renomeie
   * uma coluna booleana com AS escapa da conversão — hoje nenhuma faz isso.
   */
  function mapearBooleanas() {
    const nomes = new Set();
    const tabelas = conexao.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    for (const { name } of tabelas) {
      for (const coluna of conexao.prepare(`PRAGMA table_info(${name})`).all()) {
        if (String(coluna.type).toUpperCase() === "BOOLEAN") nomes.add(coluna.name);
      }
    }
    return nomes;
  }

  /**
   * Converte o que o node:sqlite não aceita ligar a um parâmetro.
   *
   * `boolean` ele recusa com erro claro. `Date` é pior: ele aceita e grava
   * NULL, calado. Se isso passasse, `finalizado_em` ficaria nulo, a sessão
   * nunca fecharia, e o índice de sessão aberta barraria a próxima — um bug que
   * só apareceria no meio de um treino.
   */
  function paraSqlite(valor) {
    if (valor instanceof Date) return valor.toISOString();
    if (typeof valor === "boolean") return valor ? 1 : 0;
    return valor;
  }

  function daSqlite(linha) {
    const convertida = {};
    for (const [coluna, valor] of Object.entries(linha)) {
      // Nulo continua nulo: "nunca trocou a senha" não é "não trocou".
      convertida[coluna] = booleanas.has(coluna) && valor !== null ? valor === 1 : valor;
    }
    return convertida;
  }

  function executar(sql, valores = []) {
    const preparada = conexao.prepare(traduzir(sql));
    const parametros = valores.map(paraSqlite);

    // `all()` serve para os dois casos: statement sem retorno devolve lista
    // vazia, e com RETURNING devolve as linhas.
    const linhas = preparada.all(...parametros);
    return { rows: linhas.map(daSqlite) };
  }

  const bd = {
    query: async (sql, valores) => executar(sql, valores),

    connect: async () => ({
      query: async (sql, valores) => executar(sql, valores),
      release: () => {},
    }),

    end: async () => conexao.close(),

    /** SQL cru sem retorno: schema e seed. Traduz e reconta as colunas booleanas. */
    aplicarSql: (sql) => {
      conexao.exec(traduzir(sql));
      booleanas = mapearBooleanas();
    },

    /**
     * SQL cru com retorno, síncrono.
     *
     * Existe para os testes, que consultavam o `pg-mem` sem `await` e continuam
     * assim — o driver ser síncrono por dentro é o que permite não espalhar
     * `await` por dezenas de asserções.
     */
    consultarSql: (sql) => executar(sql).rows,
  };

  return bd;
}
```

- [ ] **Passo 4: rodar e confirmar o verde**

```bash
cd backend && node --test --disable-warning=ExperimentalWarning test/sqlite.test.js
```

Esperado: 12 testes passando. Se `BEGIN`/`COMMIT` falharem em `prepare().all()`, trocar apenas esse
caminho por `conexao.exec(traduzir(sql))` quando o SQL for exatamente `BEGIN`, `COMMIT` ou
`ROLLBACK`, e manter o resto como está.

- [ ] **Passo 5: quebrar de propósito, três vezes**

Cada uma protege um bug que o driver existe para evitar:

1. Comentar a linha do `Date` em `paraSqlite`. O teste "Date passado como parametro grava a data"
   precisa ficar **vermelho** — se ficar verde, a conversão não está sendo exercitada.
2. Comentar a linha do `boolean` em `paraSqlite`. "boolean passado como parametro e aceito" precisa
   ficar vermelho com "cannot be bound".
3. Fazer `daSqlite` devolver a linha sem converter. "booleano volta como boolean" precisa ficar
   vermelho com `1 !== true`.
4. Comentar o `PRAGMA foreign_keys = ON`. "as chaves estrangeiras estao ligadas" precisa ficar
   vermelho.

Desfazer as quatro.

- [ ] **Passo 6: commit**

```bash
cd backend && git add src/config/sqlite.js test/sqlite.test.js
git commit -m "Cria o driver SQLite com a interface do pool do pg"
```

---

### Tarefa 3: Helpers neutros, ainda no pg-mem

Refactor sem mudança de comportamento: os testes deixam de falar com o `pg-mem` direto. A suíte
continua rodando só no `pg-mem` e continua verde — é o que prova que o refactor não quebrou nada.

**Arquivos:**
- Modificar: `backend/test/helpers.js`
- Modificar: `backend/test/admin.test.js:133`, `backend/test/api.test.js:382`,
  `backend/test/catalogo.test.js:116`, `backend/test/edicaoTreino.test.js:321`,
  `backend/test/senha.test.js:87,117`, `backend/test/trocaDeLogin.test.js:29`

**Interfaces:**
- Produz, em `criarApiDeTeste`:
  - `api.executar(sql) => void` — SQL sem retorno
  - `api.consultar(sql) => object[]` — SQL com retorno, já com booleanos convertidos
  - `api.adiarCorteDeSessao({ id?, cpf? }, segundos) => void` — empurra
    `sessoes_invalidadas_em` para o futuro, sem que o teste precise saber o dialeto

- [ ] **Passo 1: acrescentar os três helpers ao `criarApiDeTeste`**

Em `backend/test/helpers.js`, dentro do `return { ... }`, acrescentar:

```js
    /** SQL cru sem retorno. Existe para o teste não depender do banco escolhido. */
    executar: (sql) => memoria.public.none(sql),

    /** SQL cru com retorno. */
    consultar: (sql) => memoria.public.many(sql),

    /**
     * Empurra o corte de sessão para o futuro.
     *
     * Os testes de expulsão precisam que o corte fique depois do `iat` do token,
     * que tem resolução de segundos — a comparação é estritamente menor, de
     * propósito, para quem troca a própria senha não se desconectar.
     *
     * Fica aqui porque o jeito de somar segundos a uma data é a diferença mais
     * visível entre os dois bancos: o PostgreSQL usa INTERVAL, que o SQLite não
     * tem.
     */
    adiarCorteDeSessao: ({ id, cpf }, segundos = 10) => {
      const onde = id !== undefined ? `id = ${id}` : `cpf = '${cpf}'`;
      memoria.public.none(
        `UPDATE usuario SET sessoes_invalidadas_em = NOW() + INTERVAL '${segundos} seconds' WHERE ${onde}`
      );
    },
```

- [ ] **Passo 2: trocar os sete usos nos testes**

`test/admin.test.js:133-135` passa a ser:

```js
  // O corte precisa ficar depois do iat, que tem resolução de segundos.
  api.adiarCorteDeSessao({ id: idAluno });
```

`test/senha.test.js:87-89`:

```js
  // O corte precisa ficar depois do iat do token, que tem resolução de segundos.
  api.adiarCorteDeSessao({ cpf: CPF });
```

`test/api.test.js:382`:

```js
  api.executar("UPDATE usuario SET aluno = TRUE WHERE cpf = '11111111111'");
```

`test/catalogo.test.js:116`:

```js
    const [linha] = api.consultar(
      `SELECT observacao FROM exercicio WHERE id_exercicio = ${criado.corpo.id_exercicio}`
    );
```

`test/edicaoTreino.test.js:321`:

```js
  const treinos = api.consultar(
    `SELECT id_treino, ativo FROM treino WHERE id_aluno = ${idAluno}`
  );
```

`test/senha.test.js:117`:

```js
  const linhas = api.consultar(
    `SELECT sessoes_invalidadas_em FROM usuario WHERE cpf = '${CPF}'`
  );
```

`test/trocaDeLogin.test.js:28-30`:

```js
const corteDe = (api, id) =>
  api.consultar(`SELECT sessoes_invalidadas_em FROM usuario WHERE id = ${id}`)[0]
    .sessoes_invalidadas_em;
```

- [ ] **Passo 3: trocar os INSERTs dos helpers de usuário**

Em `criarProfessorELogar` e `criarAdminELogar`, trocar `api.memoria.public.none(...)` por
`api.executar(...)`. O SQL não muda.

- [ ] **Passo 4: confirmar que nada quebrou**

```bash
cd backend && npm test
```

Esperado: 179 testes, 0 falhas — os mesmos números de antes do refactor.

- [ ] **Passo 5: confirmar que `api.memoria` saiu dos testes**

```bash
cd backend && grep -rn "api\.memoria" test/*.test.js
```

Esperado: nenhuma linha. (Em `helpers.js` a referência continua — é lá que o banco é montado.)

- [ ] **Passo 6: commit**

```bash
cd backend && git add test/
git commit -m "Neutraliza o acesso ao banco nos testes"
```

---

### Tarefa 4: A suíte inteira nos dois bancos

**Arquivos:**
- Modificar: `backend/test/helpers.js`
- Modificar: `backend/package.json`

**Interfaces:**
- Consome: `criarBancoSqlite` de `src/config/sqlite.js`.
- Produz: `criarApiDeTeste({ banco })`, com `banco` vindo de `BANCO_TESTE` e padrão `"pg-mem"`.

- [ ] **Passo 1: parametrizar o banco no `criarApiDeTeste`**

Substituir, em `backend/test/helpers.js`, o trecho que monta o `pg-mem` e chama `configurarPool`:

```js
/**
 * Monta o banco de teste.
 *
 * São dois de propósito: o `pg-mem` fala o dialeto do PostgreSQL, que é o banco
 * do servidor de casa, e o SQLite é o que vai embutido no APK. A mesma suíte
 * roda nos dois, então divergência de comportamento entre a versão web e o
 * aplicativo aparece como teste vermelho aqui — e não como bug no celular.
 */
async function montarBanco(banco) {
  const schema = readFileSync(caminho("../db/schema.sql"), "utf8");
  const seed = readFileSync(caminho("../db/seed.sql"), "utf8");

  if (banco === "sqlite") {
    const { criarBancoSqlite } = await import("../src/config/sqlite.js");
    const bd = criarBancoSqlite({ arquivo: ":memory:" });
    bd.aplicarSql(schema);
    bd.aplicarSql(seed);

    return {
      pool: bd,
      encerrar: () => bd.end(),
      executar: (sql) => bd.aplicarSql(sql),
      consultar: (sql) => bd.consultarSql(sql),
    };
  }

  const memoria = newDb();
  memoria.public.none(schema);
  memoria.public.none(seed);

  // O pg-mem usa um índice parcial para responder consultas que NÃO casam com o
  // predicado dele, e some com as linhas. É bug do emulador: o PostgreSQL real
  // trata certo, e o SQLite também — por isso o DROP só acontece aqui.
  memoria.public.none("DROP INDEX idx_sessao_aberta_por_aluno");

  const { Pool } = memoria.adapters.createPg();
  return {
    pool: new Pool(),
    encerrar: () => Promise.resolve(),
    executar: (sql) => memoria.public.none(sql),
    consultar: (sql) => memoria.public.many(sql),
  };
}
```

- [ ] **Passo 2: ligar o resto do `criarApiDeTeste` ao que `montarBanco` devolve**

Na assinatura:

```js
export async function criarApiDeTeste({
  limites,
  proxiesConfiaveis,
  banco = process.env.BANCO_TESTE ?? process.env.npm_config_banco ?? "pg-mem",
} = {}) {
```

Depois dos imports dinâmicos:

```js
  const bancoDeTeste = await montarBanco(banco);
  configurarPool(bancoDeTeste.pool);
```

E no `return`, trocar os três helpers para delegar, e o `encerrar` para fechar os dois:

```js
    executar: (sql) => bancoDeTeste.executar(sql),
    consultar: (sql) => bancoDeTeste.consultar(sql),

    adiarCorteDeSessao: ({ id, cpf }, segundos = 10) => {
      const onde = id !== undefined ? `id = ${id}` : `cpf = '${cpf}'`;
      // INTERVAL é do PostgreSQL; o SQLite soma com modificador dentro do
      // strftime. É a diferença mais visível entre os dois dialetos, e o motivo
      // de este helper existir em vez de o SQL ficar espalhado nos testes.
      const quando =
        banco === "sqlite"
          ? `strftime('%Y-%m-%dT%H:%M:%fZ','now','+${segundos} seconds')`
          : `NOW() + INTERVAL '${segundos} seconds'`;
      bancoDeTeste.executar(`UPDATE usuario SET sessoes_invalidadas_em = ${quando} WHERE ${onde}`);
    },

    encerrar: async () => {
      await new Promise((resolve) => servidor.close(resolve));
      await bancoDeTeste.encerrar();
    },
```

Remover o `memoria` do objeto devolvido, junto com o campo `memoria` que existia.

- [ ] **Passo 3: acrescentar o script ao `package.json`**

A escolha do banco viaja por `npm_config_banco`: o npm transforma qualquer `--banco=sqlite` em
variável de ambiente com esse nome, e ela **chega aos processos filhos** que o `node --test` cria.
Isso foi medido antes de escrever este plano, no PowerShell da máquina. É o que evita depender da
sintaxe de variável do shell, que difere entre PowerShell, cmd e sh — e este projeto roda no Windows
aqui e em Linux no servidor de casa.

Em `backend/package.json`, ao lado de `"test"`:

```json
    "test:sqlite": "npm test --banco=sqlite",
```

E o `--disable-warning` no script existente, porque o `node:sqlite` é experimental no Node 25 e
polui a saída com aviso a cada arquivo de teste:

```json
    "test": "node --test --disable-warning=ExperimentalWarning",
```

A assinatura de `criarApiDeTeste`, no Passo 2, já lê as duas fontes — `BANCO_TESTE` para quem
preferir exportar à mão, e `npm_config_banco` para o script:

```js
  banco = process.env.BANCO_TESTE ?? process.env.npm_config_banco ?? "pg-mem",
```

- [ ] **Passo 4: rodar a suíte no SQLite e ver o que cai**

```bash
cd backend && npm run test:sqlite
```

Esperado: **falhas**. Registrar a lista antes de corrigir qualquer coisa. Candidatos conhecidos, com
o diagnóstico de cada um:

| Sintoma | Causa provável | Correção |
|---|---|---|
| `cannot be bound to SQLite parameter` | valor que `paraSqlite` não cobre | ver o tipo e acrescentar a conversão |
| Coluna de data chegando `null` | `Date` indo cru como parâmetro | mesma função, caso do `Date` |
| `1 !== true` numa asserção | coluna booleana fora do mapa | conferir o tipo declarado no schema |
| `no such function` | função do PostgreSQL sem tradução | acrescentar regra ao tradutor **com teste na Tarefa 1** |
| Erro de sintaxe em `seed.sql` | construção não suportada | traduzir, ou ajustar o seed mantendo a ordem das linhas |
| Busca por nome com acento maiúsculo | divergência aceita na spec | ajustar o **teste** para o caso ASCII e anotar |

Regra desta tarefa: correção vai no tradutor ou no driver. **Nenhuma correção em controller.** Se um
teste só passar mexendo em regra de negócio, parar e relatar — é achado, não obstáculo.

- [ ] **Passo 5: fechar a suíte e conferir os dois lados**

```bash
cd backend && npm test && npm run test:sqlite
```

Esperado: 179 + os novos das Tarefas 1 e 2, com 0 falhas nos dois bancos.

- [ ] **Passo 6: provar que a suíte SQLite está mesmo no SQLite**

O risco desta tarefa é a suíte "passar" porque continuou no `pg-mem` sem ninguém notar. Fazer
`montarBanco` lançar `new Error("banco sqlite escolhido")` no ramo do SQLite e rodar:

```bash
cd backend && npm run test:sqlite   # tudo vermelho
cd backend && npm test                   # tudo verde
```

Se a primeira ficar verde, a variável não está chegando. Desfazer depois de confirmar.

- [ ] **Passo 7: commit**

```bash
cd backend && git add test/ package.json src/config/sqlite.js src/lib/dialetoSqlite.js
git commit -m "Roda a suite inteira tambem sobre SQLite"
```

---

### Tarefa 5: Documentação

**Arquivos:**
- Modificar: `backend/README.md`, `ROADMAP.md`, `CLAUDE.md` (local, não versionado)

- [ ] **Passo 1: `backend/README.md`**

Na seção de comandos, ao lado de `npm test`:

```markdown
`npm run test:sqlite` roda a **mesma suíte** sobre SQLite — o banco que vai embutido no APK
(seção 6 do roadmap). Um teste que passa num banco e falha no outro é divergência entre a versão web
e o aplicativo, e é para isso que os dois existem. O SQLite cobre um caso a mais: o índice parcial de
"uma sessão aberta por aluno", que o `pg-mem` obriga a derrubar por bug do emulador.
```

Acrescentar uma seção curta explicando o tradutor, o driver, e as três conversões de valor (`Date`,
`boolean` na ida, `boolean` na volta) com o motivo de cada uma.

- [ ] **Passo 2: `ROADMAP.md`**

Reescrever a seção 6 para refletir a decisão da spec: o APK usa **SQLite nativo**, não `pg-mem`.
Substituir o texto de 6.1 e 6.2 pelo resultado das sondas (o contador de id que não dá para
reacertar), marcar a etapa "núcleo portável" como parcialmente entregue por esta leva, e apontar para
a spec.

- [ ] **Passo 3: `CLAUDE.md`**

Acrescentar, na seção de arquitetura do backend, que a fachada `db` tem duas implementações e que a
suíte roda nos dois bancos — com o aviso de que corrigir divergência mexendo em controller é sinal de
que a tradução está errada.

- [ ] **Passo 4: commit**

```bash
git add backend/README.md ROADMAP.md
git commit -m "Documenta a suite dupla e corrige a secao 6 do roadmap"
```

---

## Pronto quando

- [ ] `npm test` verde no `pg-mem`
- [ ] `npm run test:sqlite` verde, sem `DROP INDEX`
- [ ] Nenhum arquivo de `src/controllers/`, `src/routes/` ou `src/middlewares/` alterado
- [ ] Nenhum `api.memoria` nos arquivos `*.test.js`
- [ ] As divergências encontradas estão anotadas na spec ou no README, não escondidas em `if`
