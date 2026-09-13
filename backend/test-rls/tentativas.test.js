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
