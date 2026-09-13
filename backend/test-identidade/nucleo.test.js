import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { criarHashComSal } from "../src/lib/senha.js";
import {
  LIMITE_FALHAS,
  VALIDADE_DIAS,
  avaliarLogin,
  montarClaims,
  normalizarCpf,
  verificarSenha,
} from "../../supabase/functions/identidade/nucleo.ts";

const usuarioBase = {
  id: 7,
  senha: "",
  ativo: true,
  aluno: true,
  professor: false,
  admin: false,
};

describe("núcleo da identidade", () => {
  it("normaliza o CPF como o backend faz", () => {
    assert.equal(normalizarCpf("111.111.111-11"), "11111111111");
    assert.equal(normalizarCpf(" 22222222222 "), "22222222222");
    assert.equal(normalizarCpf(null), "");
    assert.equal(normalizarCpf(12345678901), "12345678901");
  });

  // O teste que importa desta tarefa: a hash gerada pelo backend confere aqui.
  // Se o scrypt divergir, a conta criada no site não entra pelo app — e não dá
  // erro nenhum, só recusa a senha certa.
  it("confere a hash que o backend gerou", async () => {
    const hash = await criarHashComSal("senha123");
    assert.equal(await verificarSenha(hash, "senha123"), true);
    assert.equal(await verificarSenha(hash, "senha124"), false);
  });

  it("não quebra com hash malformada", async () => {
    assert.equal(await verificarSenha("sem-dois-pontos", "x"), false);
    assert.equal(await verificarSenha("", "x"), false);
    assert.equal(await verificarSenha("ab:cd", "x"), false);
  });

  it("aceita quem acertou a senha", async () => {
    const usuario = { ...usuarioBase, senha: await criarHashComSal("senha123") };
    const decisao = await avaliarLogin({ usuario, senha: "senha123", falhas: 0 });
    assert.equal(decisao.ok, true);
    assert.equal(decisao.id, 7);
    assert.equal(decisao.cargo, "aluno");
    assert.deepEqual(decisao.perfis, ["aluno"]);
  });

  it("recusa senha errada e CPF inexistente com o MESMO motivo", async () => {
    const usuario = { ...usuarioBase, senha: await criarHashComSal("senha123") };
    const comSenhaErrada = await avaliarLogin({ usuario, senha: "errada", falhas: 0 });
    const semUsuario = await avaliarLogin({ usuario: null, senha: "qualquer", falhas: 0 });

    assert.equal(comSenhaErrada.ok, false);
    assert.equal(semUsuario.ok, false);
    assert.equal(
      comSenhaErrada.motivo,
      semUsuario.motivo,
      "motivos diferentes vazam quais CPFs existem",
    );
    assert.equal(comSenhaErrada.motivo, "credencial");
  });

  it("recusa inativo mesmo com a senha certa, como authController:24", async () => {
    const usuario = { ...usuarioBase, ativo: false, senha: await criarHashComSal("senha123") };
    const decisao = await avaliarLogin({ usuario, senha: "senha123", falhas: 0 });
    assert.equal(decisao.ok, false);
    assert.equal(decisao.motivo, "inativo");
  });

  it("recusa por excesso ANTES de olhar a senha", async () => {
    const usuario = { ...usuarioBase, senha: await criarHashComSal("senha123") };
    const decisao = await avaliarLogin({ usuario, senha: "senha123", falhas: LIMITE_FALHAS });
    assert.equal(decisao.ok, false);
    assert.equal(decisao.motivo, "excesso", "com a trava batida nem a senha certa passa");
  });

  it("o cargo segue a precedência admin > professor > aluno", async () => {
    const senha = await criarHashComSal("senha123");
    const casos = [
      [{ aluno: true, professor: true, admin: true }, "admin", ["aluno", "professor", "admin"]],
      [{ aluno: true, professor: true, admin: false }, "professor", ["aluno", "professor"]],
      [{ aluno: true, professor: false, admin: false }, "aluno", ["aluno"]],
    ];
    for (const [perfis, cargo, lista] of casos) {
      const decisao = await avaliarLogin({
        usuario: { ...usuarioBase, ...perfis, senha },
        senha: "senha123",
        falhas: 0,
      });
      assert.equal(decisao.cargo, cargo);
      assert.deepEqual(decisao.perfis, lista);
    }
  });

  it("as claims são as que o RLS da leva 1 lê", () => {
    const agora = 1_760_000_000;
    const claims = montarClaims(7, agora);
    assert.equal(claims.sub, "7", "auth_id_valido() faz cast de sub para INTEGER");
    assert.equal(claims.role, "authenticated", "é a claim que o PostgREST usa no SET ROLE");
    assert.equal(claims.aud, "authenticated");
    assert.equal(claims.iat, agora, "auth_id_valido() compara iat com sessoes_invalidadas_em");
    assert.equal(claims.exp, agora + VALIDADE_DIAS * 24 * 60 * 60);
  });
});
