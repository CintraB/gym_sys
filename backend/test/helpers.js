import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";

// Precisa vir antes de qualquer carregarConfig(). Todos os usos são lazy,
// então basta estar definido no momento da primeira chamada.
process.env.DB_USER ??= "teste";
process.env.DB_HOST ??= "localhost";
process.env.DB_NAME ??= "teste";
process.env.DB_PASSWORD ??= "teste";
process.env.DB_PORT ??= "5432";
process.env.TOKEN_SEG ??= "segredo-de-teste-nao-usar-em-producao";

const caminho = (relativo) => fileURLToPath(new URL(relativo, import.meta.url));

/**
 * Monta o banco de teste.
 *
 * São dois de propósito: o `pg-mem` fala o dialeto do PostgreSQL, que é o banco
 * do servidor de casa, e o SQLite é o que vai embutido no APK. A mesma suíte
 * roda nos dois, então divergência de comportamento entre a versão web e o
 * aplicativo aparece como teste vermelho aqui — e não como bug no celular.
 */
async function montarBanco(banco) {
  const schema = readFileSync(caminho("../db/schema.sql"), "utf8");
  const seed = readFileSync(caminho("../db/seed.sql"), "utf8");

  if (banco === "sqlite") {
    const { criarBancoSqlite } = await import("../src/config/sqlite.js");
    const bd = criarBancoSqlite({ arquivo: ":memory:" });
    bd.aplicarSql(schema);
    bd.aplicarSql(seed);

    return {
      pool: bd,
      encerrar: () => bd.end(),
      executar: (sql) => bd.aplicarSql(sql),
      consultar: (sql) => bd.consultarSql(sql),
      agoraMais: (segundos) => `strftime('%Y-%m-%dT%H:%M:%fZ','now','+${segundos} seconds')`,
    };
  }

  const memoria = newDb();
  memoria.public.none(schema);
  memoria.public.none(seed);

  // O pg-mem usa um índice parcial para responder consultas que NÃO casam com
  // o predicado dele, e some com as linhas: depois de criar
  // idx_sessao_aberta_por_aluno, qualquer "WHERE id_aluno = X" em
  // sessao_treino deixa de enxergar as sessões finalizadas.
  //
  // É bug do emulador, não do schema — o PostgreSQL real trata certo, e o
  // SQLite também, por isso o DROP só acontece neste ramo. A garantia de "uma
  // sessão aberta por aluno" é conferida no banco do APK e no Postgres de
  // verdade, não aqui.
  memoria.public.none("DROP INDEX idx_sessao_aberta_por_aluno");

  const { Pool } = memoria.adapters.createPg();
  return {
    pool: new Pool(),
    encerrar: () => Promise.resolve(),
    executar: (sql) => memoria.public.none(sql),
    consultar: (sql) => memoria.public.many(sql),
    agoraMais: (segundos) => `NOW() + INTERVAL '${segundos} seconds'`,
  };
}

/**
 * Sobe a API sobre um banco em memória e devolve um cliente HTTP.
 *
 * `limites` sobrescreve os limitadores de requisição. Cada chamada cria um app
 * novo, com contadores próprios — um teste não interfere no outro.
 *
 * `banco` escolhe entre `pg-mem` (padrão) e `sqlite`. Pela linha de comando vem
 * como `npm test --banco=sqlite`: o npm transforma isso em `npm_config_banco` e
 * a variável chega aos processos filhos que o `node --test` cria — o que evita
 * depender da sintaxe de variável de ambiente, que difere entre PowerShell e sh.
 */
export async function criarApiDeTeste({
  limites,
  proxiesConfiaveis,
  banco = process.env.BANCO_TESTE ?? process.env.npm_config_banco ?? "pg-mem",
} = {}) {
  const { configurarPool } = await import("../src/config/db.js");
  const { criarApp } = await import("../src/app.js");

  const bancoDeTeste = await montarBanco(banco);
  configurarPool(bancoDeTeste.pool);

  const servidor = criarApp({
    origensCors: ["http://localhost:5173"],
    limites,
    proxiesConfiaveis,
  }).listen(0);
  await new Promise((resolve) => servidor.once("listening", resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  async function requisicao(metodo, rota, { token, corpo, headers, corpoBruto } = {}) {
    const resposta = await fetch(`${base}${rota}`, {
      method: metodo,
      headers: {
        ...(corpo || corpoBruto ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: corpoBruto ?? (corpo ? JSON.stringify(corpo) : undefined),
    });

    const texto = await resposta.text();
    let corpoResposta = null;
    if (texto) {
      try {
        corpoResposta = JSON.parse(texto);
      } catch {
        // Resposta nao-JSON e em si um achado: devolve o texto cru.
        corpoResposta = { naoJson: texto };
      }
    }

    return {
      status: resposta.status,
      corpo: corpoResposta,
      headers: resposta.headers,
    };
  }

  return {
    base,
    requisicao,

    /** SQL cru sem retorno. Existe para o teste não depender do banco escolhido. */
    executar: (sql) => bancoDeTeste.executar(sql),

    /** SQL cru com retorno. */
    consultar: (sql) => bancoDeTeste.consultar(sql),

    /**
     * Empurra o corte de sessão para o futuro.
     *
     * Os testes de expulsão precisam que o corte fique depois do `iat` do token,
     * que tem resolução de segundos — a comparação é estritamente menor, de
     * propósito, para quem troca a própria senha não se desconectar.
     *
     * Fica aqui porque somar segundos a uma data é a diferença mais visível
     * entre os dois bancos: o PostgreSQL usa INTERVAL, que o SQLite não tem.
     */
    adiarCorteDeSessao: ({ id, cpf }, segundos = 10) => {
      const onde = id !== undefined ? `id = ${id}` : `cpf = '${cpf}'`;
      bancoDeTeste.executar(
        `UPDATE usuario SET sessoes_invalidadas_em = ${bancoDeTeste.agoraMais(segundos)} WHERE ${onde}`
      );
    },
    get: (rota, opcoes) => requisicao("GET", rota, opcoes),
    post: (rota, corpo, opcoes) => requisicao("POST", rota, { ...opcoes, corpo }),
    put: (rota, corpo, opcoes) => requisicao("PUT", rota, { ...opcoes, corpo }),
    encerrar: async () => {
      await new Promise((resolve) => servidor.close(resolve));
      // O SQLite mantém um arquivo aberto (em memória, aqui) que precisa ser
      // fechado; o pg-mem não tem o que soltar.
      await bancoDeTeste.encerrar();
    },
  };
}

/** Insere um professor direto no banco e devolve o token dele. */
export async function criarProfessorELogar(api, { cpf = "11111111111", senha = "senha123" } = {}) {
  const { criarHashComSal } = await import("../src/lib/senha.js");
  const hash = await criarHashComSal(senha);

  api.executar(`
    INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, ativo)
    VALUES ('${cpf}', 'Professor Teste', '${hash}', 'prof@teste.com', '111111111111', FALSE, TRUE, TRUE)
  `);

  const resposta = await api.post("/login", { cpf, senha });
  return resposta.corpo.token;
}

/** Insere um admin com os três perfis e devolve o token dele. */
export async function criarAdminELogar(api, { cpf = "99999999999", senha = "senha123" } = {}) {
  const { criarHashComSal } = await import("../src/lib/senha.js");
  const hash = await criarHashComSal(senha);

  api.executar(`
    INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
    VALUES ('${cpf}', 'Admin Teste', '${hash}', 'admin@teste.com', '999999999999', TRUE, TRUE, TRUE, TRUE)
  `);

  const resposta = await api.post("/login", { cpf, senha });
  return resposta.corpo.token;
}
