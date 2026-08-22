import { paraPosicionais } from './parametros.js'

const NOME_DO_BANCO = 'gymsys'

/**
 * Colunas declaradas BOOLEAN no schema.
 *
 * É lista, e não `PRAGMA table_info` como no driver dos testes: cada consulta de
 * pragma pelo plugin custa uma ida à camada nativa, e seriam dez na abertura do
 * app. Um teste confere esta lista contra o `schema.sql`, então ela não
 * envelhece em silêncio.
 */
export const COLUNAS_BOOLEANAS = new Set([
  'aluno',
  'professor',
  'admin',
  'ativo',
  'concluido',
  'ver',
  'alterar',
  'apagar',
])

/** O SQLite recusa boolean como parâmetro, e grava Date como nulo, calado. */
function paraSqlite(valor) {
  if (valor instanceof Date) return valor.toISOString()
  if (typeof valor === 'boolean') return valor ? 1 : 0
  return valor
}

function daSqlite(linha) {
  const convertida = {}
  for (const [coluna, valor] of Object.entries(linha)) {
    // Nulo continua nulo: "nunca trocou a senha" não é "não trocou".
    convertida[coluna] = COLUNAS_BOOLEANAS.has(coluna) && valor !== null ? valor === 1 : valor
  }
  return convertida
}

/**
 * O `errorHandler` é compartilhado com a versão web e reconhece o `23505` do
 * PostgreSQL. Sem normalizar, um CPF duplicado viraria 500 "erro interno" no
 * lugar de 409 "Registro já existe".
 */
function normalizar(erro) {
  if (/UNIQUE constraint failed/i.test(erro?.message ?? '')) erro.code = '23505'
  return erro
}

const ehLeitura = (sql) => /^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql)
const temRetorno = (sql) => /\bRETURNING\b/i.test(sql)
const ehControleDeTransacao = (sql) => /^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(sql)

/**
 * Abre o banco do aparelho e devolve o contrato que a fachada `db` espera.
 *
 * `plugin` e `semear` são injetáveis para o teste — em produção o plugin vem do
 * Capacitor e o seed é o de `semear.js`. É o que torna este arquivo testável sem
 * aparelho: o que importa é **como** o plugin é chamado.
 */
export async function abrirBancoDoAparelho({ plugin, semear } = {}) {
  const sqlite = plugin ?? (await conectarAoPlugin())
  const semearBanco = semear ?? (await import('./semear.js')).semear

  const conexao = await sqlite.createConnection(NOME_DO_BANCO, false, 'no-encryption', 1, false)
  await conexao.open()

  async function executar(sql, valores = []) {
    // BEGIN, COMMIT e ROLLBACK têm método próprio no plugin, que controla o
    // estado da transação por dentro. Mandá-los como SQL deixaria a transação
    // pendurada — e os controllers pedem transação exatamente assim.
    if (ehControleDeTransacao(sql)) {
      const comando = sql.trim().split(/\s+/)[0].toUpperCase()
      if (comando === 'BEGIN') await conexao.beginTransaction()
      else if (comando === 'COMMIT') await conexao.commitTransaction()
      else await conexao.rollbackTransaction()
      return { rows: [] }
    }

    const pedido = paraPosicionais(sql, valores.map(paraSqlite))

    try {
      if (ehLeitura(pedido.sql)) {
        const resultado = await conexao.query(pedido.sql, pedido.valores)
        return { rows: (resultado.values ?? []).map(daSqlite) }
      }

      // `transaction: false` porque a transação é dos controllers, e
      // `returnMode: 'all'` porque o projeto tem 16 RETURNING — com os padrões
      // do plugin (true e 'no'), a transação externa perderia efeito e todo
      // RETURNING voltaria vazio.
      const resultado = await conexao.run(
        pedido.sql,
        pedido.valores,
        false,
        temRetorno(pedido.sql) ? 'all' : 'no',
      )
      return { rows: (resultado.changes?.values ?? []).map(daSqlite) }
    } catch (erro) {
      throw normalizar(erro)
    }
  }

  const bd = {
    query: (sql, valores) => executar(sql, valores),
    connect: async () => ({
      query: (sql, valores) => executar(sql, valores),
      release: () => {},
    }),
    end: async () => {
      await conexao.close()
      await sqlite.closeConnection(NOME_DO_BANCO, false)
    },
    /** SQL cru sem retorno: é como o seed aplica o schema e o catálogo. */
    aplicarSql: (sql) => conexao.execute(sql, false),
  }

  await semearBanco(bd)
  return bd
}

/**
 * Carrega o plugin do Capacitor.
 *
 * Import dinâmico para este módulo continuar carregável em Node, onde o
 * Capacitor não existe — é o que permite testá-lo com um duplo.
 */
async function conectarAoPlugin() {
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite')
  return new SQLiteConnection(CapacitorSQLite)
}
