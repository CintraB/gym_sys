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
     RETURNING id, nome, ativo, aluno, professor, criado_em`,
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
  assert.equal(rows[0].professor, false);
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

// O errorHandler traduz o 23505 do PostgreSQL em 409 "Registro ja existe". Sem
// normalizar, a mesma colisao no APK viraria 500 generico — a pessoa veria
// "erro interno" no lugar de "esse CPF ja existe".
test("violacao de unicidade chega com o codigo que o errorHandler entende", async (t) => {
  const bd = bancoNovo();
  t.after(() => bd.end());

  await inserirUsuario(bd, "11111111111");

  await assert.rejects(
    () => inserirUsuario(bd, "11111111111", "Outro"),
    (erro) => {
      assert.equal(erro.code, "23505", `codigo inesperado: ${erro.code}`);
      return true;
    }
  );
});

// A mensagem original nao pode ser perdida: e o que diz QUAL coluna colidiu, e
// vai para o log do servidor quando o erro nao for tratado.
test("a violacao preserva a mensagem original do SQLite", async (t) => {
  const bd = bancoNovo();
  t.after(() => bd.end());

  await inserirUsuario(bd, "11111111111");

  await assert.rejects(
    () => inserirUsuario(bd, "11111111111", "Outro"),
    /UNIQUE constraint failed/
  );
});

// Erro que nao e de unicidade nao pode virar 409: uma chave estrangeira violada
// e defeito nosso, e precisa continuar chegando como erro interno.
test("outros erros do banco nao ganham o codigo de unicidade", async (t) => {
  const bd = bancoNovo();
  t.after(() => bd.end());

  await assert.rejects(
    () => bd.query("INSERT INTO treino (id_aluno, id_professor) VALUES (9999, 9999)"),
    (erro) => {
      assert.notEqual(erro.code, "23505", "erro de chave estrangeira nao e conflito de unicidade");
      return true;
    }
  );
});
