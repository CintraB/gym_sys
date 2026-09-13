import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { comUsuarioDeTeste, encerrar, exigirAmbiente, rest, tokenDe } from "./ajuda.js";

describe("a Data API reaberta continua fechada para quem não é dono", () => {
  before(() => exigirAmbiente());
  after(() => encerrar());

  it("o visitante sem token não lê tabela nenhuma", async () => {
    for (const tabela of ["usuario", "treino", "sessao_treino", "exercicio", "pedido_treino"]) {
      const { status, corpo } = await rest(`/${tabela}?select=*`);
      assert.ok(
        status >= 400 || (Array.isArray(corpo) && corpo.length === 0),
        `anon leu ${tabela}: ${status} ${JSON.stringify(corpo)}`,
      );
    }
  });

  it("a coluna senha não sai nem para quem tem token", async () => {
    await comUsuarioDeTeste({}, async ({ cpf, senha }) => {
      const token = await tokenDe({ cpf, senha });
      const { status, corpo } = await rest("/usuario?select=senha", { token });
      assert.notEqual(status, 200, `a senha saiu: ${JSON.stringify(corpo)}`);
    });
  });

  it("com token, o aluno lê a própria linha e só ela", async () => {
    await comUsuarioDeTeste({}, async ({ id, cpf, senha }) => {
      const token = await tokenDe({ cpf, senha });
      const { status, corpo } = await rest("/usuario?select=id,nome", { token });
      assert.equal(status, 200, JSON.stringify(corpo));
      assert.deepEqual(
        corpo.map((l) => l.id),
        [id],
        "o token abriu mais do que a própria linha",
      );
    });
  });

  it("o aluno lê o catálogo, que é catálogo", async () => {
    await comUsuarioDeTeste({}, async ({ cpf, senha }) => {
      const token = await tokenDe({ cpf, senha });
      const { status, corpo } = await rest("/exercicio?select=id_exercicio&limit=5", { token });
      assert.equal(status, 200, JSON.stringify(corpo));
      assert.ok(corpo.length > 0, "o catálogo devia estar visível para quem tem token");
    });
  });

  it("o aluno não escreve na ficha pelo PostgREST", async () => {
    await comUsuarioDeTeste({}, async ({ id, cpf, senha }) => {
      const token = await tokenDe({ cpf, senha });
      const { status } = await rest("/treino", {
        token,
        metodo: "POST",
        corpo: { id_aluno: id, id_professor: id },
      });
      assert.ok(status >= 400, "o aluno escreveu ficha pelo PostgREST");
    });
  });

  it("o aluno não lê a sessão de outro aluno", async () => {
    await comUsuarioDeTeste({}, async ({ cpf, senha }) => {
      const token = await tokenDe({ cpf, senha });
      const { status, corpo } = await rest("/sessao_treino?select=id_sessao,id_aluno", { token });
      assert.equal(status, 200, JSON.stringify(corpo));
      // A conta é recém-criada e não tem sessão nenhuma: se vier linha, é de
      // outra pessoa.
      assert.deepEqual(corpo, [], `vazou sessão de outro aluno: ${JSON.stringify(corpo)}`);
    });
  });

  it("as tabelas sem uso seguem inalcançáveis", async () => {
    await comUsuarioDeTeste({}, async ({ cpf, senha }) => {
      const token = await tokenDe({ cpf, senha });
      for (const tabela of ["admin_user", "regras_usuario", "tentativa_login"]) {
        const { status } = await rest(`/${tabela}?select=*`, { token });
        assert.ok(status >= 400, `${tabela} respondeu ${status}`);
      }
    });
  });
});
