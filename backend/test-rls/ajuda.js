/**
 * Infraestrutura da suíte de RLS.
 *
 * Roda contra o Postgres do `docker-compose.test.yml` — Postgres de verdade,
 * porque o pg-mem não executa plpgsql nem RLS. Cada arquivo de teste pede um
 * banco limpo: o schema inteiro é reaplicado num schema `public` recriado, o
 * que é rápido e evita um teste enxergar a sujeira do outro.
 *
 * É por isso que `test:rls` roda com `--test-concurrency=1`: são todos o mesmo
 * banco, e dois arquivos em paralelo derrubariam o schema um do outro no meio
 * da execução ("schema public already exists", e tabela sumindo do nada).
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const AQUI = dirname(fileURLToPath(import.meta.url));
const DB = join(AQUI, "..", "db");

export const CONEXAO = {
  host: "127.0.0.1",
  port: 5433,
  user: "gymsys",
  password: "gymsys",
  database: "gymsys_rls",
};

const arquivo = (nome) => readFile(join(DB, nome), "utf8");

/**
 * Recria o schema do zero e devolve o pool do dono (que ignora RLS).
 *
 * A ordem importa: `teste-supabase-falso.sql` antes de tudo, porque `rls.sql`
 * referencia os papéis e o `auth.jwt()` que ele cria.
 */
export async function abrirBanco() {
  const pool = new pg.Pool(CONEXAO);

  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await pool.query(await arquivo("teste-supabase-falso.sql"));
  await pool.query(await arquivo("schema.sql"));
  await pool.query(await arquivo("seed.sql"));

  return {
    pool,
    encerrar: () => pool.end(),
    /** Aplica um arquivo do `db/` no banco já de pé. */
    aplicar: async (nome) => pool.query(await arquivo(nome)),
  };
}

/**
 * Abre uma conexão no papel `authenticated`, com as claims do token.
 *
 * É o que o PostgREST faz a cada requisição: valida o JWT, põe as claims em
 * `request.jwt.claims` e troca para o papel. `SET LOCAL` não serve aqui porque
 * não estamos numa transação — a configuração vale para a sessão.
 */
export async function conectarComo(claims) {
  const cliente = new pg.Client(CONEXAO);
  await cliente.connect();
  await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
    JSON.stringify(claims),
  ]);
  await cliente.query("SET ROLE authenticated");
  return cliente;
}

/** O visitante sem token nenhum. */
export async function conectarAnon() {
  const cliente = new pg.Client(CONEXAO);
  await cliente.connect();
  await cliente.query("SET ROLE anon");
  return cliente;
}

/** Claims no formato que a Edge Function vai emitir na leva 2. */
export function tokenDe(id, { iat = Math.floor(Date.now() / 1000) } = {}) {
  return { sub: String(id), role: "authenticated", iat };
}

/**
 * Roda uma consulta esperando que ela seja recusada.
 *
 * RLS nega de dois jeitos diferentes, e confundi-los esconde bug: leitura
 * bloqueada volta **vazia**, escrita bloqueada **lança**. Quem chama diz qual
 * espera.
 */
export async function recusa(cliente, sql, valores = []) {
  try {
    await cliente.query(sql, valores);
    return null;
  } catch (erro) {
    return erro;
  }
}
