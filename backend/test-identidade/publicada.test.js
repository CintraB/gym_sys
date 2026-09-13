import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeJwt } from "jose";
import {
  PADRAO_HASH,
  chamarIdentidade,
  comUsuarioDeTeste,
  encerrar,
  exigirAmbiente,
  limparTentativas,
} from "./ajuda.js";

describe("a função de identidade publicada", () => {
  before(() => exigirAmbiente());
  after(() => encerrar());

  it("emite token para quem acertou a senha", async () => {
    await comUsuarioDeTeste({}, async ({ id, cpf, senha }) => {
      const { status, corpo } = await chamarIdentidade({ cpf, senha });
      assert.equal(status, 200, JSON.stringify(corpo));
      assert.equal(corpo.usuario.id, id);
      assert.equal(corpo.usuario.cargo, "aluno");

      const claims = decodeJwt(corpo.token);
      assert.equal(claims.sub, String(id));
      assert.equal(claims.role, "authenticated");
      assert.ok(claims.exp - claims.iat === 30 * 24 * 60 * 60, "o token vale 30 dias");
    });
  });

  it("aceita CPF com máscara, como o app pode mandar", async () => {
    await comUsuarioDeTeste({}, async ({ cpf, senha }) => {
      const mascarado = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
      const { status } = await chamarIdentidade({ cpf: mascarado, senha });
      assert.equal(status, 200);
    });
  });

  it("a resposta NUNCA traz a hash da senha", async () => {
    await comUsuarioDeTeste({}, async ({ cpf, senha }) => {
      const { corpo } = await chamarIdentidade({ cpf, senha });
      const texto = JSON.stringify(corpo);
      // Procurar só por ":" não serviria — todo JSON tem. Que o PADRAO_HASH
      // realmente detecta uma hash é provado offline, em nucleo.test.js.
      assert.ok(!PADRAO_HASH.test(texto), "hash de senha na resposta da função");
      assert.equal(corpo.usuario.senha, undefined);
    });
  });

  it("senha errada e CPF inexistente respondem a MESMA coisa", async () => {
    const inexistente = await chamarIdentidade({ cpf: "99999999999", senha: "qualquer" });
    await limparTentativas("99999999999");

    const comSenhaErrada = await comUsuarioDeTeste({}, ({ cpf }) =>
      chamarIdentidade({ cpf, senha: "errada" }),
    );

    assert.equal(inexistente.status, 401);
    assert.equal(comSenhaErrada.status, 401);
    assert.deepEqual(
      inexistente.corpo,
      comSenhaErrada.corpo,
      "respostas diferentes entregam quais CPFs existem",
    );
  });

  it("usuário inativo não recebe token, mesmo com a senha certa", async () => {
    await comUsuarioDeTeste({ ativo: false }, async ({ cpf, senha }) => {
      const { status, corpo } = await chamarIdentidade({ cpf, senha });
      assert.equal(status, 403);
      assert.equal(corpo.token, undefined);
    });
  });

  it("corpo sem CPF nem senha é recusado antes de qualquer consulta", async () => {
    const { status } = await chamarIdentidade({});
    assert.equal(status, 400);
  });

  it("o professor recebe o cargo certo", async () => {
    await comUsuarioDeTeste({ aluno: false, professor: true }, async ({ cpf, senha }) => {
      const { corpo } = await chamarIdentidade({ cpf, senha });
      assert.equal(corpo.usuario.cargo, "professor");
      assert.deepEqual(corpo.usuario.perfis, ["professor"]);
    });
  });
});
