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
