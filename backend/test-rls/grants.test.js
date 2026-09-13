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

  it("aplicar o rls.sql duas vezes não quebra", async () => {
    // `CREATE POLICY` não tem `IF NOT EXISTS`, e o arquivo vai ser reaplicado a
    // cada leva da sincronização. Sem os DROP do topo da seção de políticas, a
    // segunda aplicação para no primeiro CREATE — foi o que aconteceu ao
    // reaplicar no Supabase em 13/09/2026.
    await banco.aplicar("rls.sql");

    const { rows } = await banco.pool.query(
      "SELECT count(*)::int AS total FROM pg_policies WHERE schemaname = 'public'",
    );
    assert.equal(rows[0].total, 31, "a reaplicação mudou o número de políticas");
  });

  it("ninguém tem TRUNCATE nem TRIGGER em tabela nenhuma", async () => {
    // TRUNCATE **ignora RLS**: quem o tem esvazia a tabela sem política nenhuma
    // ver. TRIGGER deixa pendurar código na tabela dos outros.
    //
    // Não é hipótese: no Supabase os dois papéis nascem com ALL por default
    // privilege, e a primeira versão deste arquivo revogava só de `anon` —
    // `authenticated` ficou com os dois em toda tabela, inclusive nas duas que
    // deviam estar fora de alcance. Achado ao aplicar no projeto real.
    const { rows } = await banco.pool.query(
      `SELECT table_name, grantee, privilege_type
         FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND grantee IN ('anon', 'authenticated')
          AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES', 'DELETE')
        ORDER BY table_name, grantee, privilege_type`,
    );
    assert.deepEqual(
      rows,
      [],
      `privilégio perigoso concedido: ${rows
        .map((l) => `${l.grantee}:${l.privilege_type} em ${l.table_name}`)
        .join(", ")}`,
    );
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
