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
