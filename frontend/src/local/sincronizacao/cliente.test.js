// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { criarCliente, ErroSincronizacao } from './cliente.js'

const OPCOES = { url: 'https://projeto.supabase.co', chave: 'chave-publica' }

function respostaFalsa({ status = 200, corpo = [], texto } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => texto ?? JSON.stringify(corpo),
  }
}

describe('cliente do Supabase', () => {
  it('manda a apikey e o token no lugar certo', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaFalsa({ corpo: [{ id: 1 }] }))
    const cliente = criarCliente({ ...OPCOES, buscar })

    const dados = await cliente.rest('/treino?select=*', { token: 'tok' })

    expect(dados).toEqual([{ id: 1 }])
    const [url, config] = buscar.mock.calls[0]
    expect(url).toBe('https://projeto.supabase.co/rest/v1/treino?select=*')
    expect(config.headers.apikey).toBe('chave-publica')
    expect(config.headers.Authorization).toBe('Bearer tok')
  })

  it('falha de rede vira tipo "rede", que e o caso normal', async () => {
    const buscar = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const cliente = criarCliente({ ...OPCOES, buscar })

    const erro = await cliente.rest('/treino').catch((e) => e)
    expect(erro).toBeInstanceOf(ErroSincronizacao)
    expect(erro.tipo).toBe('rede')
  })

  it('401 vira "credencial" — e nunca deve derrubar a sessao do app', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaFalsa({ status: 401, corpo: {} }))
    const cliente = criarCliente({ ...OPCOES, buscar })

    const erro = await cliente.rest('/treino', { token: 'velho' }).catch((e) => e)
    expect(erro.tipo).toBe('credencial')
  })

  it('403 vira "politica", que e bug e nao transiente', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaFalsa({ status: 403, corpo: {} }))
    const cliente = criarCliente({ ...OPCOES, buscar })

    const erro = await cliente.rest('/treino', { token: 'tok' }).catch((e) => e)
    expect(erro.tipo).toBe('politica')
  })

  it('500 vira "servidor"', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaFalsa({ status: 500, corpo: {} }))
    const cliente = criarCliente({ ...OPCOES, buscar })

    const erro = await cliente.rest('/treino').catch((e) => e)
    expect(erro.tipo).toBe('servidor')
  })

  it('resposta que nao e JSON nao estoura em cima do status', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaFalsa({ status: 502, texto: '<html>ops' }))
    const cliente = criarCliente({ ...OPCOES, buscar })

    const erro = await cliente.rest('/treino').catch((e) => e)
    expect(erro.tipo).toBe('servidor')
  })

  it('rpc chama a funcao do banco com o corpo em argumentos', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaFalsa({ corpo: { criada: true } }))
    const cliente = criarCliente({ ...OPCOES, buscar })

    await cliente.rpc('sincronizar_sessao', { pacote: { uuid: 'x' } }, { token: 'tok' })

    const [url, config] = buscar.mock.calls[0]
    expect(url).toBe('https://projeto.supabase.co/rest/v1/rpc/sincronizar_sessao')
    expect(config.method).toBe('POST')
    expect(JSON.parse(config.body)).toEqual({ pacote: { uuid: 'x' } })
  })

  it('funcao vai para /functions/v1 e NAO leva token', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaFalsa({ corpo: { token: 'novo' } }))
    const cliente = criarCliente({ ...OPCOES, buscar })

    await cliente.funcao('identidade', { cpf: '1', senha: '2' })

    const [url, config] = buscar.mock.calls[0]
    expect(url).toBe('https://projeto.supabase.co/functions/v1/identidade')
    expect(config.headers.Authorization).toBeUndefined()
  })
})
