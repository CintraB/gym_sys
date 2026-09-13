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
