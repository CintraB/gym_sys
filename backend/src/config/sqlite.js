import { DatabaseSync } from "node:sqlite";
import { traduzir } from "../lib/dialetoSqlite.js";

/**
 * Driver SQLite com a mesma interface do pool do `pg`, para entrar na fachada
 * `db` por `configurarPool()` — o mesmo encaixe que o pg-mem usa nos testes.
 *
 * É o banco que vai dentro do APK: um arquivo, sem servidor, e a persistência é
 * do próprio motor. Nos testes roda em memória.
 *
 * Há uma conexão só, e não um pool. Para `connect()` isso significa devolver
 * sempre a mesma, com `release()` que não faz nada: o SQLite não tem conexão
 * ociosa para devolver, e no APK existe um usuário só. Consequência a saber:
 * uma transação aberta aqui envolve tudo que rodar enquanto ela estiver aberta.
 * Nenhuma transação do projeto é aninhada nem concorrente, então isso não muda
 * comportamento.
 */
export function criarBancoSqlite({ arquivo = ":memory:" } = {}) {
  const conexao = new DatabaseSync(arquivo);

  // No SQLite as chaves estrangeiras nascem DESLIGADAS, e sem elas o
  // ON DELETE CASCADE de que a edição de treino depende não aconteceria.
  //
  // O `node:sqlite` já liga por conta própria (medido: `PRAGMA foreign_keys`
  // responde 1 logo depois de abrir), então esta linha é redundante aqui — e
  // fica de propósito. O driver nativo do Android é outro wrapper, com outro
  // padrão, e este é o tipo de diferença que só apareceria como histórico
  // apagado em silêncio.
  conexao.exec("PRAGMA foreign_keys = ON");

  let booleanas = new Set();

  /**
   * Nomes de coluna declaradas BOOLEAN no schema.
   *
   * O SQLite guarda 0 e 1. Sem converter na volta, a API devolveria `ativo: 1`,
   * e o EditarUsuario compara `perfis.aluno !== usuario.aluno` — `false !== 0` é
   * verdadeiro, então a tela acharia que o perfil mudou a cada abertura.
   *
   * O conjunto sai do schema, e não de uma lista digitada aqui, para não
   * envelhecer quando uma flag nova aparecer. O limite: consulta que renomeie
   * uma coluna booleana com AS escapa da conversão — hoje nenhuma faz isso.
   */
  function mapearBooleanas() {
    const nomes = new Set();
    const tabelas = conexao.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    for (const { name } of tabelas) {
      for (const coluna of conexao.prepare(`PRAGMA table_info(${name})`).all()) {
        if (String(coluna.type).toUpperCase() === "BOOLEAN") nomes.add(coluna.name);
      }
    }
    return nomes;
  }

  /**
   * Converte o que o node:sqlite não aceita ligar a um parâmetro.
   *
   * `boolean` ele recusa com erro claro. `Date` é pior: ele aceita e grava NULL,
   * calado. Se isso passasse, `finalizado_em` ficaria nulo, a sessão nunca
   * fecharia, e o índice de sessão aberta barraria a próxima — um bug que só
   * apareceria no meio de um treino.
   */
  function paraSqlite(valor) {
    if (valor instanceof Date) return valor.toISOString();
    if (typeof valor === "boolean") return valor ? 1 : 0;
    return valor;
  }

  function daSqlite(linha) {
    const convertida = {};
    for (const [coluna, valor] of Object.entries(linha)) {
      // Nulo continua nulo: "nunca trocou a senha" não é "não trocou".
      convertida[coluna] = booleanas.has(coluna) && valor !== null ? valor === 1 : valor;
    }
    return convertida;
  }

  function executar(sql, valores = []) {
    const traduzido = traduzir(sql);

    // BEGIN, COMMIT e ROLLBACK não passam por prepare(): o node:sqlite trata
    // controle de transação como comando, não como consulta preparável.
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(traduzido)) {
      conexao.exec(traduzido);
      return { rows: [] };
    }

    // `all()` serve para os dois casos: statement sem retorno devolve lista
    // vazia, e com RETURNING devolve as linhas.
    const linhas = conexao.prepare(traduzido).all(...valores.map(paraSqlite));
    return { rows: linhas.map(daSqlite) };
  }

  return {
    query: async (sql, valores) => executar(sql, valores),

    connect: async () => ({
      query: async (sql, valores) => executar(sql, valores),
      release: () => {},
    }),

    end: async () => conexao.close(),

    /** SQL cru sem retorno: schema e seed. Traduz e reconta as colunas booleanas. */
    aplicarSql: (sql) => {
      conexao.exec(traduzir(sql));
      booleanas = mapearBooleanas();
    },

    /**
     * SQL cru com retorno, síncrono.
     *
     * Existe para os testes, que consultavam o `pg-mem` sem `await` e continuam
     * assim — o driver ser síncrono por dentro é o que permite não espalhar
     * `await` por dezenas de asserções.
     */
    consultarSql: (sql) => executar(sql).rows,
  };
}
