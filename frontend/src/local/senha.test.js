import { describe, it, expect } from 'vitest'
import * as borda from './senha.js'
import * as backend from '../../../backend/src/lib/senha.js'

const SENHA = 'senha123'

describe('borda de senha do app', () => {
  it('produz o formato sal:hash, com os tamanhos do backend', async () => {
    const hash = await borda.criarHashComSal(SENHA)
    const [sal, digest] = hash.split(':')

    expect(sal).toMatch(/^[0-9a-f]{64}$/) // 32 bytes em hex
    expect(digest).toMatch(/^[0-9a-f]{128}$/) // 64 bytes em hex
  })

  it('verifica a senha correta e recusa a errada', async () => {
    const hash = await borda.criarHashComSal(SENHA)

    expect(await borda.verificarSenha(hash, SENHA)).toBe(true)
    expect(await borda.verificarSenha(hash, 'outraSenha')).toBe(false)
  })

  // O teste central da leva: sem isto, a conta criada no servidor nao entra no
  // APK, e vice-versa. Os parametros do scrypt e o tratamento do sal precisam
  // ser identicos aos do node:crypto.
  it('aceita hash gerada pelo backend', async () => {
    const doBackend = await backend.criarHashComSal(SENHA)

    expect(await borda.verificarSenha(doBackend, SENHA)).toBe(true)
    expect(await borda.verificarSenha(doBackend, 'outraSenha')).toBe(false)
  })

  it('gera hash que o backend aceita', async () => {
    const daBorda = await borda.criarHashComSal(SENHA)

    expect(await backend.verificarSenha(daBorda, SENHA)).toBe(true)
    expect(await backend.verificarSenha(daBorda, 'outraSenha')).toBe(false)
  })

  it('usa sal aleatorio: a mesma senha gera hashes diferentes', async () => {
    const a = await borda.criarHashComSal(SENHA)
    const b = await borda.criarHashComSal(SENHA)

    expect(a).not.toBe(b)
    expect(await borda.verificarSenha(a, SENHA)).toBe(true)
    expect(await borda.verificarSenha(b, SENHA)).toBe(true)
  })

  // Hash malformada no banco nao pode virar excecao: viraria 500 no lugar de
  // "CPF ou senha incorretos".
  it('nao quebra com hash malformada', async () => {
    for (const ruim of ['', 'semdoispontos', ':', 'sal:', ':hash', null, undefined, 42]) {
      expect(await borda.verificarSenha(ruim, SENHA)).toBe(false)
    }
  })
})
