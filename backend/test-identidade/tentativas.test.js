import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/config/db.js";
import {
  chamarIdentidade,
  comUsuarioDeTeste,
  encerrar,
  exigirAmbiente,
  limparTentativasDeTeste,
} from "./ajuda.js";

const LIMITE = 20;

describe("trava de tentativas da função", () => {
  before(async () => {
    exigirAmbiente();
    // Sem isto, a contagem de uma execução anterior entra nesta.
    await limparTentativasDeTeste();
  });
  after(() => encerrar());

  it("cada falha é registrada no banco", async () => {
    await comUsuarioDeTeste({}, async ({ cpf }) => {
      await chamarIdentidade({ cpf, senha: "errada" });
      await chamarIdentidade({ cpf, senha: "errada" });

      const { rows } = await db.query(
        "SELECT count(*)::int AS total FROM tentativa_login WHERE cpf = $1 AND NOT sucesso",
        [cpf],
      );
      assert.equal(rows[0].total, 2, "a borda não está chamando registrar_tentativa");
    });
  });

  it("o acerto zera a contagem", async () => {
    await comUsuarioDeTeste({}, async ({ cpf, senha }) => {
      await chamarIdentidade({ cpf, senha: "errada" });
      await chamarIdentidade({ cpf, senha });

      const { rows } = await db.query(
        "SELECT count(*)::int AS total FROM tentativa_login WHERE cpf = $1 AND NOT sucesso",
        [cpf],
      );
      assert.equal(rows[0].total, 0, "quem acertou a senha não pode ficar de castigo");
    });
  });

  it("depois do limite, nem a senha certa passa", async () => {
    await comUsuarioDeTeste({}, async ({ cpf, senha }) => {
      // Semeia as falhas direto no banco: 20 chamadas HTTP levariam ~30 s, e o
      // que se prova aqui é a decisão da borda, não a contagem — essa é do
      // tentativas.test.js da leva 1.
      await db.query(
        `INSERT INTO tentativa_login (cpf, sucesso)
         SELECT $1, FALSE FROM generate_series(1, $2)`,
        [cpf, LIMITE],
      );

      const { status, corpo } = await chamarIdentidade({ cpf, senha });
      assert.equal(status, 429, JSON.stringify(corpo));
      assert.equal(corpo.token, undefined, "emitiu token com a trava batida");
    });
  });

  it("a trava é por CPF, e não global", async () => {
    await comUsuarioDeTeste({}, async (travado) => {
      await db.query(
        `INSERT INTO tentativa_login (cpf, sucesso)
         SELECT $1, FALSE FROM generate_series(1, $2)`,
        [travado.cpf, LIMITE],
      );

      await comUsuarioDeTeste({}, async (outro) => {
        const { status } = await chamarIdentidade({ cpf: outro.cpf, senha: outro.senha });
        assert.equal(status, 200, "a trava de um CPF derrubou o login de outro");
      });
    });
  });
});
