import { AxiosError } from 'axios'
import { despachar } from './roteador.js'

/**
 * Adapter do axios que entrega ao roteador local em vez de à rede.
 *
 * É o ponto de troca que deixa as nove telas e os testes do front intactos:
 * elas continuam chamando `api.get('/professores/alunos')`, e os interceptors de
 * token e de 401 continuam valendo — inclusive a expulsão de sessão por troca de
 * senha ou de CPF, que é comportamento de servidor que o app mantém.
 */
export async function adaptadorLocal(config) {
  const caminho = montarCaminho(config)

  const { status, corpo } = await despachar({
    metodo: (config.method ?? 'get').toUpperCase(),
    caminho,
    corpo: desserializar(config.data),
    cabecalhos: cabecalhosDe(config),
  })

  const resposta = {
    data: corpo,
    status,
    statusText: String(status),
    headers: {},
    config,
    request: { caminho },
  }

  // O axios decidiria isto pelo validateStatus depois do adapter; aqui a decisão
  // é explícita porque o erro precisa nascer com `response` preenchido — é onde
  // o interceptor de 401 e o mensagemDeErro() vão procurar.
  const aceitar = config.validateStatus ?? ((s) => s >= 200 && s < 300)
  if (aceitar(status)) return resposta

  throw new AxiosError(
    corpo?.message ?? `Requisição falhou com status ${status}`,
    status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
    config,
    resposta.request,
    resposta,
  )
}

/**
 * Junta baseURL, url e params no caminho que o roteador entende.
 *
 * Só o **pathname** interessa, e é preciso extraí-lo de propósito: no APK o
 * `api.ts` monta a baseURL como `https://localhost:8080`, e concatenar isso daria
 * `https://localhost:8080/login` ao roteador — que responderia 404 "Rota não
 * encontrada", porque a tabela tem `/login`. Foi assim que o app falhou no
 * emulador na primeira tentativa de login.
 */
function montarCaminho(config) {
  const base = (config.baseURL ?? '').replace(/\/$/, '')
  const url = config.url ?? '/'

  // A base falsa serve para caminhos relativos sem baseURL: o construtor de URL
  // exige uma origem, e ela é descartada logo em seguida.
  const caminho = new URL(`${base}${url}`, 'http://app.local').pathname

  const busca = new URLSearchParams(
    Object.entries(config.params ?? {}).filter(
      ([, valor]) => valor !== undefined && valor !== null,
    ),
  ).toString()

  return busca ? `${caminho}?${busca}` : caminho
}

/**
 * O axios já serializou o corpo em JSON quando chega aqui (o transformRequest
 * roda antes do adapter), então é preciso desfazer — senão o controller receberia
 * texto onde espera objeto.
 */
function desserializar(dados) {
  if (dados === undefined || dados === null) return undefined
  if (typeof dados !== 'string') return dados

  try {
    return JSON.parse(dados)
  } catch {
    return undefined
  }
}

function cabecalhosDe(config) {
  const cabecalhos = config.headers ?? {}
  // AxiosHeaders tem toJSON; um objeto simples, não.
  return typeof cabecalhos.toJSON === 'function' ? cabecalhos.toJSON() : { ...cabecalhos }
}
