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
