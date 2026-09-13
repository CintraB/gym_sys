import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/config/db.js";
import { comUsuarioDeTeste, encerrar, exigirAmbiente, rest, tokenDe } from "./ajuda.js";

/**
 * A subida de verdade: o pacote que `frontend/src/local/sincronizacao/subida.js`
 * monta, mandado ao `sincronizar_sessao` do servidor, pelo PostgREST.
 *
 * É a prova da leva 3. Os testes do app usam um cliente falso — necessários,
 * porque provam a lógica sem rede —, mas nenhum deles diz se o **formato** do
 * pacote é o que a função do banco espera. Um nome de campo errado passaria por
 * todos eles e só apareceria no aparelho.
 */

/** Ficha mínima no servidor, com os ids de lá. Devolve o que apagar depois. */
async function comFichaNoServidor(usuario, callback) {
  const { rows: treinos } = await db.query(
    "INSERT INTO treino (id_aluno, id_professor) VALUES ($1, $1) RETURNING id_treino",
    [usuario.id],
  );
  const idTreino = treinos[0].id_treino;

  const { rows: blocos } = await db.query(
    "INSERT INTO treino_bloco (id_treino, letra, nome, ordem) VALUES ($1, 'A', 'Teste', 1) RETURNING id_bloco",
    [idTreino],
  );
  const idBloco = blocos[0].id_bloco;

  const { rows: exercicios } = await db.query(
    `INSERT INTO ex_usuario (id_treino, id_bloco, id_user, id_exercicio, numero_serie, repeticoes)
     VALUES ($1, $2, $3, (SELECT id_exercicio FROM exercicio LIMIT 1), 3, '10')
     RETURNING id`,
    [idTreino, idBloco, usuario.id],
  );

  try {
    return await callback({ idTreino, idBloco, idExUsuario: exercicios[0].id });
  } finally {
    // A ordem importa: sessao_treino referencia treino, e treino_bloco é
    // referenciado por sessao_treino sem cascade.
    await db.query("DELETE FROM sessao_treino WHERE id_treino = $1", [idTreino]);
    await db.query("DELETE FROM ex_usuario WHERE id_treino = $1", [idTreino]);
    await db.query("DELETE FROM treino_bloco WHERE id_treino = $1", [idTreino]);
    await db.query("DELETE FROM treino WHERE id_treino = $1", [idTreino]);
  }
}

/** O mesmo formato que `montarPacote` produz no aparelho. */
function pacoteComoOApp({ idTreino, idBloco, idAluno, idExUsuario, uuid = randomUUID() }) {
  return {
    uuid,
    id_treino: idTreino,
    id_bloco: idBloco,
    id_aluno: idAluno,
    iniciado_em: new Date(Date.now() - 3600_000).toISOString(),
    finalizado_em: new Date().toISOString(),
    duracao_segundos: 3600,
    observacao: "subida de teste",
    calorias: 250,
    exercicios: [
      {
        uuid: randomUUID(),
        id_ex_usuario: idExUsuario,
        concluido: true,
        concluido_em: new Date().toISOString(),
        series: [
          { uuid: randomUUID(), carga: 20, repeticoes: "10" },
          { uuid: randomUUID(), carga: 25, repeticoes: "8" },
        ],
      },
    ],
  };
}

describe("a subida, contra o servidor de verdade", () => {
  before(() => exigirAmbiente());
  after(() => encerrar());

  it("o pacote do app grava a sessão inteira, com as séries", async () => {
    await comUsuarioDeTeste({}, async (usuario) => {
      const token = await tokenDe(usuario);

      await comFichaNoServidor(usuario, async (ficha) => {
        const pacote = pacoteComoOApp({ ...ficha, idAluno: usuario.id });

        const { status, corpo } = await rest("/rpc/sincronizar_sessao", {
          token,
          metodo: "POST",
          corpo: { pacote },
        });

        assert.equal(status, 200, JSON.stringify(corpo));
        assert.equal(corpo.criada, true);

        const { rows } = await db.query(
          `SELECT s.duracao_segundos, s.observacao,
                  (SELECT count(*)::int FROM sessao_exercicio se WHERE se.id_sessao = s.id_sessao) AS exercicios,
                  (SELECT count(*)::int FROM sessao_serie ss
                     JOIN sessao_exercicio se2 ON se2.id = ss.id_sessao_exercicio
                    WHERE se2.id_sessao = s.id_sessao) AS series
             FROM sessao_treino s WHERE s.uuid = $1`,
          [pacote.uuid],
        );

        assert.equal(rows.length, 1, "a sessão não chegou ao servidor");
        assert.equal(rows[0].duracao_segundos, 3600);
        assert.equal(rows[0].observacao, "subida de teste");
        assert.equal(rows[0].exercicios, 1);
        assert.equal(rows[0].series, 2, "as séries não subiram junto");
      });
    });
  });

  it("subir o mesmo pacote duas vezes deixa UMA sessão", async () => {
    await comUsuarioDeTeste({}, async (usuario) => {
      const token = await tokenDe(usuario);

      await comFichaNoServidor(usuario, async (ficha) => {
        const pacote = pacoteComoOApp({ ...ficha, idAluno: usuario.id });
        const envio = () =>
          rest("/rpc/sincronizar_sessao", { token, metodo: "POST", corpo: { pacote } });

        const primeira = await envio();
        const segunda = await envio();

        assert.equal(primeira.corpo.criada, true);
        assert.equal(segunda.corpo.criada, false, "a segunda tinha de ser reconhecida");
        assert.equal(segunda.corpo.id_sessao, primeira.corpo.id_sessao);

        const { rows } = await db.query(
          "SELECT count(*)::int AS total FROM sessao_treino WHERE uuid = $1",
          [pacote.uuid],
        );
        assert.equal(rows[0].total, 1);
      });
    });
  });

  it("o aluno não sobe sessão no nome de outro — o RLS vale dentro da função", async () => {
    await comUsuarioDeTeste({}, async (dono) => {
      await comFichaNoServidor(dono, async (ficha) => {
        await comUsuarioDeTeste({}, async (intruso) => {
          const token = await tokenDe(intruso);
          const pacote = pacoteComoOApp({ ...ficha, idAluno: dono.id });

          const { status } = await rest("/rpc/sincronizar_sessao", {
            token,
            metodo: "POST",
            corpo: { pacote },
          });

          assert.ok(status >= 400, "um aluno gravou sessão no nome de outro");
        });
      });
    });
  });

  it("sessão sem finalizado_em é recusada", async () => {
    await comUsuarioDeTeste({}, async (usuario) => {
      const token = await tokenDe(usuario);

      await comFichaNoServidor(usuario, async (ficha) => {
        const pacote = pacoteComoOApp({ ...ficha, idAluno: usuario.id });
        pacote.finalizado_em = null;

        const { status, corpo } = await rest("/rpc/sincronizar_sessao", {
          token,
          metodo: "POST",
          corpo: { pacote },
        });

        assert.ok(status >= 400, `sessão aberta subiu: ${JSON.stringify(corpo)}`);
      });
    });
  });
});
