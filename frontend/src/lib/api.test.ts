import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AxiosAdapter } from 'axios'
import {
  api,
  instalarAdaptador,
  mensagemDeErro,
  registrarExpiracaoDeSessao,
  tokenArmazenado,
} from './api'

/**
 * Os interceptors do axios não tinham cobertura: as telas mockam `api.ts`
 * inteiro, então token e 401 nunca eram exercitados. Foi nessa lacuna que o bug
 * de "errar a senha atual derruba a sessão" chegou ao aparelho.
 *
 * Aqui o `api` é o de verdade; só a rede é trocada por um adapter de mentira,
 * que é exatamente o ponto de troca que o modo standalone já usa.
 */
function responderCom(resposta: { status: number; data?: unknown }) {
  const adaptador = vi.fn<AxiosAdapter>(async (config) => {
    const resultado = {
      data: resposta.data ?? {},
      status: resposta.status,
      statusText: String(resposta.status),
      headers: {},
      config,
    }
    if (resposta.status >= 200 && resposta.status < 300) return resultado

    const { AxiosError } = await import('axios')
    throw new AxiosError(
      (resposta.data as { message?: string } | undefined)?.message ?? 'falhou',
      AxiosError.ERR_BAD_REQUEST,
      config,
      {},
      resultado,
    )
  })

  instalarAdaptador(adaptador)
  return adaptador
}

describe('interceptor de sessão expirada', () => {
  let expirou: ReturnType<typeof vi.fn>

  beforeEach(() => {
    expirou = vi.fn()
    registrarExpiracaoDeSessao(expirou)
    tokenArmazenado.gravar('token-de-teste')
  })

  it('derruba a sessão quando uma tela recebe 401', async () => {
    responderCom({ status: 401, data: { message: 'Sessão expirada. Entre de novo.' } })

    await expect(api.get('/professores/alunos')).rejects.toThrow()

    expect(expirou).toHaveBeenCalledOnce()
  })

  it('não derrubaria sessão nenhuma quando não há token guardado', async () => {
    tokenArmazenado.limpar()
    responderCom({ status: 401, data: { message: 'CPF ou senha incorretos' } })

    await expect(api.post('/login', { cpf: '1', senha: 'x' })).rejects.toThrow()

    expect(expirou).not.toHaveBeenCalled()
  })

  // O bug que apareceu no APK: a senha atual errada responde 401 — de propósito,
  // para não dizer qual campo falhou —, e o interceptor lia isso como "seu token
  // morreu" e mandava a pessoa para o login por um erro de digitação.
  it('erro de digitação na senha atual não expulsa quem está logado', async () => {
    responderCom({ status: 401, data: { message: 'CPF ou senha incorretos' } })

    await expect(
      api.put('/me/senha', { senha_atual: 'errada', senha_nova: 'outraSenha456' }),
    ).rejects.toThrow()

    expect(expirou).not.toHaveBeenCalled()
  })

  it('a tela ainda recebe a mensagem do servidor para mostrar no formulário', async () => {
    responderCom({ status: 401, data: { message: 'CPF ou senha incorretos' } })

    const erro = await api
      .put('/me/senha', { senha_atual: 'errada', senha_nova: 'outraSenha456' })
      .catch((e) => e)

    expect(mensagemDeErro(erro)).toBe('CPF ou senha incorretos')
  })

  it('manda o token guardado no cabeçalho', async () => {
    const adaptador = responderCom({ status: 200, data: { ok: true } })

    await api.get('/me')

    expect(adaptador.mock.calls[0][0].headers.Authorization).toBe('Bearer token-de-teste')
  })
})
