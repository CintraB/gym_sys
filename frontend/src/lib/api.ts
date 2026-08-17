import axios from 'axios'

const CHAVE_TOKEN = 'gymsys.token'

const PORTA_API_DEV = 8080

/**
 * Endereço da API quando VITE_API_URL não está definido.
 *
 * Usa o mesmo host de onde a página foi aberta, e não "localhost": abrindo
 * pelo celular em http://192.168.x.x:5173, "localhost" seria o próprio
 * celular, e a chamada morreria em "não foi possível falar com o servidor".
 *
 * Em produção o VITE_API_URL é definido (`/api` atrás do proxy reverso) e este
 * fallback não é usado.
 */
function enderecoPadraoDaApi() {
  const { protocol, hostname } = window.location
  return `${protocol}//${hostname}:${PORTA_API_DEV}`
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || enderecoPadraoDaApi(),
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(CHAVE_TOKEN)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

type AoExpirarSessao = () => void
let aoExpirarSessao: AoExpirarSessao = () => {}

export function registrarExpiracaoDeSessao(callback: AoExpirarSessao) {
  aoExpirarSessao = callback
}

api.interceptors.response.use(
  (resposta) => resposta,
  (erro) => {
    // Token expirado ou usuário desativado: derruba a sessão em vez de
    // deixar a tela quebrada com erros silenciosos no console.
    if (erro.response?.status === 401 && localStorage.getItem(CHAVE_TOKEN)) {
      aoExpirarSessao()
    }
    return Promise.reject(erro)
  },
)

export const tokenArmazenado = {
  ler: () => localStorage.getItem(CHAVE_TOKEN),
  gravar: (token: string) => localStorage.setItem(CHAVE_TOKEN, token),
  limpar: () => localStorage.removeItem(CHAVE_TOKEN),
}

/** Extrai a mensagem que a API mandou; cai para um texto genérico. */
export function mensagemDeErro(erro: unknown, padrao = 'Algo deu errado. Tente de novo.') {
  if (axios.isAxiosError(erro)) {
    if (erro.code === 'ECONNABORTED' || erro.message === 'Network Error') {
      return 'Não foi possível falar com o servidor. Verifique a conexão.'
    }
    const mensagem = (erro.response?.data as { message?: string } | undefined)?.message
    if (mensagem) return mensagem
  }
  return padrao
}
