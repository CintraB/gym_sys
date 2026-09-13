import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { abrirBanco, conectarAnon, conectarComo, recusa, tokenDe } from "./ajuda.js";

describe("grants", () => {
  let banco;
  before(async () => {
    banco = await abrirBanco();
    await banco.aplicar("rls.sql");
    await banco.pool.query(`
      INSERT INTO usuario (id, nome, senha, cpf, email, titulo)
      VALUES (1, 'Aluno', 'sal:hash', '11111111111', 'a@b.c', '111111111111')`);
  });
  after(() => banco.encerrar());

  it("anon não lê nada, em tabela nenhuma", async () => {
    const cliente = await conectarAnon();
    try {
      for (const tabela of ["usuario", "treino", "sessao_treino", "exercicio", "pedido_treino"]) {
        const erro = await recusa(cliente, `SELECT * FROM ${tabela}`);
        assert.ok(erro, `anon conseguiu ler ${tabela}`);
      }
    } finally {
      await cliente.end();
    }
  });

  it("a coluna senha não sai nem para o próprio dono", async () => {
    const cliente = await conectarComo(tokenDe(1));
    try {
      const erro = await recusa(cliente, "SELECT senha FROM usuario WHERE id = 1");
      assert.ok(erro, "a senha nunca pode ser selecionável");
      assert.match(erro.message, /permission denied|permissão negada/i);
    } finally {
      await cliente.end();
    }
  });

  it("as tabelas sem uso continuam inalcançáveis", async () => {
    const cliente = await conectarComo(tokenDe(1));
    try {
      for (const tabela of ["admin_user", "regras_usuario"]) {
        const erro = await recusa(cliente, `SELECT * FROM ${tabela}`);
        assert.ok(erro, `${tabela} devia seguir sem grant nenhum`);
      }
    } finally {
      await cliente.end();
    }
  });

  it("o RLS está ligado em toda tabela que o app alcança", async () => {
    // Asserção sobre o catálogo, e não sobre "um SELECT volta vazio": a Tarefa
    // 6 vai criar políticas de leitura, e um teste escrito como "nem o dono
    // enxerga a própria linha" ficaria vermelho lá na frente por motivo certo.
    const { rows } = await banco.pool.query(
      `SELECT c.relname, c.relrowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY c.relname`,
    );
    const desligadas = rows
      .filter((t) => !t.relrowsecurity)
      .map((t) => t.relname)
      .filter((nome) => !["admin_user", "regras_usuario"].includes(nome));

    assert.deepEqual(
      desligadas,
      [],
      `tabela alcançável com RLS desligado: ${desligadas.join(", ")}`,
    );
  });
});
