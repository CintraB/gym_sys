import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ErroSincronizacao } from './cliente.js'
import { entrar, esquecerToken, guardarToken, tokenGuardado, tokenValido } from './identidade.js'

const AGORA = 1_760_000_000

describe('identidade da sincronizacao', () => {
  beforeEach(() => esquecerToken())

  it('entra e devolve o token da funcao', async () => {
    const cliente = {
      funcao: vi.fn().mockResolvedValue({
        token: 'tok',
        expira_em: AGORA + 100,
        usuario: { id: 7, nome: 'Ana' },
      }),
    }

    const resultado = await entrar(cliente, { cpf: '111.111.111-11', senha: 'senha123' })

    expect(resultado.token).toBe('tok')
    expect(cliente.funcao).toHaveBeenCalledWith('identidade', {
      cpf: '111.111.111-11',
      senha: 'senha123',
    })
  })

  it('guarda e le o token', () => {
    guardarToken('tok', AGORA + 100)
    expect(tokenGuardado()).toEqual({ token: 'tok', expiraEm: AGORA + 100 })
  })

  it('sem token guardado, devolve nulo em vez de estourar', () => {
    expect(tokenGuardado()).toBeNull()
  })

  it('token vencido nao vale', () => {
    guardarToken('tok', AGORA - 1)
    expect(tokenValido(AGORA)).toBe(false)
  })

  it('token que vence em menos de um dia ja nao vale', () => {
    // Renovar com folga evita a sincronização começar e morrer no meio por
    // vencimento — o app tem 30 dias de janela, um dia de margem é barato.
    guardarToken('tok', AGORA + 60 * 60 * 12)
    expect(tokenValido(AGORA)).toBe(false)
  })

  it('token com folga vale', () => {
    guardarToken('tok', AGORA + 60 * 60 * 24 * 10)
    expect(tokenValido(AGORA)).toBe(true)
  })

  it('credencial errada chega como ErroSincronizacao de credencial', async () => {
    const cliente = {
      funcao: vi
        .fn()
        .mockRejectedValue(new ErroSincronizacao('credencial', 'CPF ou senha incorretos')),
    }

    const erro = await entrar(cliente, { cpf: '1', senha: '2' }).catch((e) => e)
    expect(erro.tipo).toBe('credencial')
    expect(tokenGuardado()).toBeNull()
  })
})
