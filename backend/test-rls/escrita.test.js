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
