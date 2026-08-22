import { scrypt } from 'scrypt-js'

/**
 * Senha no app standalone, com o mesmo formato e os mesmos parâmetros do
 * `backend/src/lib/senha.js` — que usa o scrypt do `node:crypto`, indisponível
 * no browser.
 *
 * Os parâmetros não são escolha: são os padrões do Node, medidos. Mudar
 * qualquer um faz o hash divergir, e aí a conta criada no servidor não entra no
 * APK — sem erro nenhum, só um "CPF ou senha incorretos" impossível de
 * diagnosticar. É o que os testes de ida e volta protegem.
 */
const N = 16384
const r = 8
const p = 1
const TAMANHO_HASH = 64
const TAMANHO_SAL = 32

const utf8 = (texto) => new TextEncoder().encode(texto)

const paraHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

const deHex = (hex) =>
  new Uint8Array(hex.match(/.{1,2}/g)?.map((par) => Number.parseInt(par, 16)) ?? [])

/**
 * O sal entra como TEXTO da string hex, e não como os bytes que ela representa.
 * É o que o `node:crypto` faz ao receber uma string, e trocar isso quebraria a
 * compatibilidade em silêncio: a hash sairia válida, só diferente.
 */
const calcular = (senha, salHex) => scrypt(utf8(senha), utf8(salHex), N, r, p, TAMANHO_HASH)

/** Formato armazenado no banco: "<sal_hex>:<hash_hex>". */
export async function criarHashComSal(senha) {
  const sal = paraHex(crypto.getRandomValues(new Uint8Array(TAMANHO_SAL)))
  const hash = await calcular(senha, sal)
  return `${sal}:${paraHex(hash)}`
}

export async function verificarSenha(hashArmazenada, senhaInformada) {
  if (typeof hashArmazenada !== 'string' || typeof senhaInformada !== 'string') {
    return false
  }

  const [sal, hashEsperada] = hashArmazenada.split(':')
  if (!sal || !hashEsperada) {
    return false
  }

  const calculada = await calcular(senhaInformada, sal)
  return iguaisEmTempoConstante(calculada, deHex(hashEsperada))
}

/**
 * Substitui o `timingSafeEqual` do Node, que não existe no browser.
 *
 * Compara tudo sempre, acumulando as diferenças com XOR: sair no primeiro byte
 * diferente deixaria o tempo de resposta contar quantos bytes acertaram, e é
 * assim que se descobre uma hash por tentativa.
 */
function iguaisEmTempoConstante(a, b) {
  if (a.length !== b.length) return false

  let diferenca = 0
  for (let i = 0; i < a.length; i += 1) {
    diferenca |= a[i] ^ b[i]
  }
  return diferenca === 0
}
