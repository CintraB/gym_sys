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
