import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeJwt } from "jose";
import { abrirBanco } from "../test-rls/ajuda.js";
import { cenario } from "../test-rls/cenario.js";
import {
  chamarIdentidade,
  comUsuarioDeTeste,
  conectarComoPostgREST,
  encerrar,
  exigirAmbiente,
} from "./ajuda.js";

/**
 * As claims do token REAL, emitido pela função publicada, postas no container
 * da leva 1. É o encontro das duas levas.
 *
 * O id do cenário local não é o mesmo do usuário criado no Supabase, e nem
 * precisa ser: o que se prova aqui é que as claims têm a FORMA que
 * `auth_id_valido()` entende. Por isso o `sub` é trocado pelo id do cenário.
 */
describe("o token da função abre as portas da leva 1", () => {
  let banco;

  before(async () => {
    exigirAmbiente();
    banco = await abrirBanco();
    await banco.aplicar("rls.sql");
    await cenario(banco.pool);
  });
  after(async () => {
    await banco.encerrar();
    await encerrar();
  });

  async function claimsReais() {
    return await comUsuarioDeTeste({}, async ({ cpf, senha }) => {
      const { status, corpo } = await chamarIdentidade({ cpf, senha });
      assert.equal(status, 200, JSON.stringify(corpo));
      return decodeJwt(corpo.token);
    });
  }

  it("as claims emitidas são reconhecidas como identidade", async () => {
    const claims = await claimsReais();
    const cliente = await conectarComoPostgREST({ ...claims, sub: "1" });
    try {
      const { rows } = await cliente.query("SELECT auth_id_valido() AS id");
      assert.equal(rows[0].id, 1, "o formato das claims não bate com auth_id_valido()");
    } finally {
      await cliente.end();
    }
  });

  it("com o token real, o aluno lê o próprio treino e só ele", async () => {
    const claims = await claimsReais();
    const cliente = await conectarComoPostgREST({ ...claims, sub: "1" });
    try {
      const { rows } = await cliente.query("SELECT id_treino FROM treino");
      assert.deepEqual(rows.map((l) => l.id_treino), [1]);
    } finally {
      await cliente.end();
    }
  });

  it("o corte de sessão vale para o token real", async () => {
    const claims = await claimsReais();
    // O corte é gravado DEPOIS do token ser emitido, e um segundo à frente
    // para não cair no mesmo segundo do `iat` — token do mesmo segundo vale de
    // propósito, e é o que identidade.test.js prova.
    await banco.pool.query(
      "UPDATE usuario SET sessoes_invalidadas_em = NOW() + INTERVAL '1 second' WHERE id = 1",
    );
    try {
      const cliente = await conectarComoPostgREST({ ...claims, sub: "1" });
      try {
        const { rows } = await cliente.query("SELECT id FROM usuario");
        assert.equal(rows.length, 0, "token anterior à troca de credencial ainda lia");
      } finally {
        await cliente.end();
      }
    } finally {
      await banco.pool.query("UPDATE usuario SET sessoes_invalidadas_em = NULL WHERE id = 1");
    }
  });

  it("o token não dá acesso ao que não é do dono", async () => {
    const claims = await claimsReais();
    const cliente = await conectarComoPostgREST({ ...claims, sub: "1" });
    try {
      const { rows } = await cliente.query("SELECT id_sessao, id_aluno FROM sessao_treino");
      assert.ok(
        rows.every((l) => l.id_aluno === 1),
        `vazou sessão de outro aluno: ${JSON.stringify(rows)}`,
      );
    } finally {
      await cliente.end();
    }
  });
});
