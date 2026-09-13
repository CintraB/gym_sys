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
    // Uma hora atrás, e não `agora`: o corte acabou de ser gravado, e um token
    // emitido no mesmo segundo dele vale de propósito — a comparação é `>=`,
    // igual à do backend (provado em identidade.test.js). Com `agora` este
    // teste passaria a afirmar o contrário daquele.
    const cliente = await conectarComo(tokenDe(1, { iat: Math.floor(Date.now() / 1000) - 3600 }));
    try {
      const { rows } = await cliente.query("SELECT id FROM usuario");
      assert.equal(rows.length, 0, "o corte de sessão tinha de valer no PostgREST também");
    } finally {
      await cliente.end();
      await banco.pool.query("UPDATE usuario SET sessoes_invalidadas_em = NULL WHERE id = 1");
    }
  });
});
