import { autenticar, exigirPerfil } from '../../../backend/src/middlewares/auth.js'
import { ErroApi, erroRequisicao } from '../../../backend/src/lib/erros.js'
import { TABELA } from './rotas.js'

/**
 * O lugar do Express dentro do app.
 *
 * Não há servidor, porta nem HTTP: o adapter do axios entrega método e caminho,
 * isto acha o controller e devolve `{ status, corpo }`. Os controllers não
 * mudam, então precisam receber algo com a cara de `req` e de `res` — e é só
 * disso que eles usam:
 *
 *   req: body, params.id, query.*, usuario, headers.authorization
 *   res: json e status().json()
 *
 * `req.ip` fica de fora porque só o limitador de requisições usava, e limitador
 * não faz sentido num aplicativo local: quem tentaria força bruta já está com o
 * aparelho na mão, e com o banco também.
 */

/** Casa o caminho pedido com um padrão de rota, devolvendo os parâmetros. */
function casar(padrao, caminho) {
  const partesPadrao = padrao.split('/')
  const partesCaminho = caminho.split('/')
  if (partesPadrao.length !== partesCaminho.length) return null

  const params = {}
  for (const [i, parte] of partesPadrao.entries()) {
    if (parte.startsWith(':')) {
      params[parte.slice(1)] = decodeURIComponent(partesCaminho[i])
      continue
    }
    if (parte !== partesCaminho[i]) return null
  }
  return params
}

/**
 * Acha a rota numa tabela. Literal ganha de parâmetro no mesmo número de
 * segmentos, e não a ordem em que foram declaradas.
 *
 * Hoje as rotas reais não têm esse conflito — conferido — então a regra é
 * defensiva: sem ela, acrescentar um `GET /professores/treino/pedidos` depois de
 * um `GET /professores/treino/:id` faria o "pedidos" virar id inválido, com um
 * 400 que ninguém entenderia. É exportada, e não interna, para poder ser
 * testada com o conflito construído de propósito.
 */
export function escolherRota(tabela, metodo, caminho) {
  const candidatas = tabela.filter((rota) => rota.metodo === metodo)
  const literais = candidatas.filter((rota) => !rota.caminho.includes(':'))
  const comParametro = candidatas.filter((rota) => rota.caminho.includes(':'))

  for (const rota of [...literais, ...comParametro]) {
    const params = casar(rota.caminho, caminho)
    if (params) return { rota, params }
  }
  return null
}

const acharRota = (metodo, caminho) => escolherRota(TABELA, metodo, caminho)

export async function despachar({ metodo, caminho, corpo, cabecalhos = {} }) {
  const [semQuery, query = ''] = caminho.split('?')
  const achada = acharRota(metodo, semQuery)

  if (!achada) {
    return { status: 404, corpo: { message: 'Rota não encontrada' } }
  }

  const req = {
    body: corpo ?? {},
    params: achada.params,
    query: Object.fromEntries(new URLSearchParams(query)),
    headers: normalizarCabecalhos(cabecalhos),
  }

  let status = 200
  let enviado
  const res = {
    status: (codigo) => {
      status = codigo
      return res
    },
    json: (dados) => {
      enviado = dados
      return res
    },
  }

  try {
    // O Express recusava id não numérico antes do controller, com 400: sem
    // isso o "abc" chegava ao banco e virava 500 sem explicar nada.
    if (achada.params.id !== undefined) {
      const id = Number(achada.params.id)
      if (!Number.isInteger(id) || id <= 0) throw erroRequisicao('Identificador inválido')
    }

    if (achada.rota.autenticado) {
      await comoPromessa((proximo) => autenticar(req, res, proximo))
      if (achada.rota.perfil) {
        await comoPromessa((proximo) => exigirPerfil(achada.rota.perfil)(req, res, proximo))
      }
    }

    const resultado = await achada.rota.acao(req, res, (erro) => {
      if (erro) throw erro
    })

    // As duas rotas de status devolvem o objeto direto; os controllers usam
    // res.json e não retornam nada.
    if (enviado === undefined && resultado !== undefined) enviado = resultado

    return { status, corpo: enviado ?? null }
  } catch (erro) {
    return traduzirErro(erro)
  }
}

/** Cabeçalhos em minúsculas, como o Express entrega. */
function normalizarCabecalhos(cabecalhos) {
  return Object.fromEntries(
    Object.entries(cabecalhos).map(([nome, valor]) => [nome.toLowerCase(), valor]),
  )
}

/**
 * Transforma um middleware de callback em promessa.
 *
 * `autenticar` é embrulhado em `asyncHandler`, que captura a rejeição e chama
 * `next(erro)` em vez de propagar — então esperar pelo retorno não basta, é
 * preciso esperar pelo `next`.
 */
function comoPromessa(executar) {
  return new Promise((resolver, rejeitar) => {
    executar((erro) => (erro ? rejeitar(erro) : resolver()))
  })
}

/**
 * O mesmo contrato do `errorHandler` do Express: só `ErroApi` vira mensagem, e
 * o resto vira 500 genérico. Devolver o erro do banco à tela entregaria query,
 * tabela e constraint.
 */
function traduzirErro(erro) {
  if (erro instanceof ErroApi) {
    return { status: erro.status, corpo: { message: erro.message } }
  }
  // O driver do SQLite normaliza a violação de unicidade para o código do
  // PostgreSQL, então este ramo vale nos dois bancos.
  if (erro?.code === '23505') {
    return { status: 409, corpo: { message: 'Registro já existe' } }
  }

  console.error('[erro nao tratado]', erro)
  return { status: 500, corpo: { message: 'Erro interno do servidor' } }
}
