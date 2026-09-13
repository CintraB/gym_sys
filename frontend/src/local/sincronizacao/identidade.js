/**
 * A identidade da sincronização — separada da do aplicativo.
 *
 * O app autentica contra o SQLite do aparelho; isto aqui autentica contra o
 * servidor. São duas, e é de propósito: dá para treinar sem nunca ter entrado
 * na sincronização, e o token daqui vencer não derruba ninguém de lá.
 */
const CHAVE = 'gymsys.sync.token'
const CHAVE_EXPIRA = 'gymsys.sync.expira'

/**
 * Um dia de folga antes do vencimento.
 *
 * Sem ela, uma sincronização podia começar com o token vivo e morrer no meio —
 * com metade das sessões enviadas e um erro de credencial na tela. Com 30 dias
 * de validade, um dia de margem não custa nada.
 */
const FOLGA_SEGUNDOS = 60 * 60 * 24

export async function entrar(cliente, { cpf, senha }) {
  const resposta = await cliente.funcao('identidade', { cpf, senha })
  guardarToken(resposta.token, resposta.expira_em)
  return resposta
}

export function guardarToken(token, expiraEm) {
  localStorage.setItem(CHAVE, token)
  localStorage.setItem(CHAVE_EXPIRA, String(expiraEm))
}

export function tokenGuardado() {
  const token = localStorage.getItem(CHAVE)
  const expiraEm = Number(localStorage.getItem(CHAVE_EXPIRA))
  if (!token || !Number.isFinite(expiraEm)) return null
  return { token, expiraEm }
}

export function esquecerToken() {
  localStorage.removeItem(CHAVE)
  localStorage.removeItem(CHAVE_EXPIRA)
}

export function tokenValido(agoraEmSegundos = Math.floor(Date.now() / 1000)) {
  const guardado = tokenGuardado()
  if (!guardado) return false
  return guardado.expiraEm - FOLGA_SEGUNDOS > agoraEmSegundos
}
