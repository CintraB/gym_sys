// @vitest-environment node
//
// Mesmo motivo do roteador.test.js: o nucleo local e codigo de servidor, e no
// jsdom o jose recusa a chave que o TextEncoder produz.
import { describe, it, expect } from 'vitest'
import axios from 'axios'
import { adaptadorLocal } from './adaptadorAxios.js'
import { configurarPool } from './banco.js'

/** Instância igual à do app, mas com o adapter local no lugar da rede. */
function apiLocal() {
  return axios.create({ baseURL: '', adapter: adaptadorLocal })
}

describe('adapter do axios', () => {
  it('responde 200 com o corpo desserializado', async () => {
    const resposta = await apiLocal().get('/health')

    expect(resposta.status).toBe(200)
    expect(resposta.data).toEqual({ status: 'ok' })
  })

  // O interceptor de 401 do api.ts le erro.response.status. Se o adapter
  // rejeitar com um erro sem `response`, a sessao nunca cai — e a tela fica
  // presa mostrando erro em vez de voltar para o login.
  it('erro traz response.status, do jeito que o interceptor espera', async () => {
    await expect(apiLocal().get('/me')).rejects.toMatchObject({
      response: { status: 401 },
    })
  })

  it('404 tambem rejeita com response', async () => {
    await expect(apiLocal().get('/nao/existe')).rejects.toMatchObject({
      response: { status: 404, data: { message: expect.stringMatching(/não encontrada/i) } },
    })
  })

  // O axios serializa o corpo antes de chamar o adapter, entao chega string.
  //
  // O 401 e o que prova que o corpo atravessou desserializado: sem cpf e senha,
  // o controller responde 400 "Informe CPF e senha", e nunca chega a procurar
  // ninguem no banco. O driver aqui nao acha usuario, o que leva ao 401.
  it('manda o corpo do POST como objeto para o roteador', async () => {
    configurarPool({ query: async () => ({ rows: [] }) })

    try {
      await apiLocal().post('/login', { cpf: '00000000000', senha: 'x' })
      expect.unreachable('deveria ter rejeitado')
    } catch (erro) {
      expect(erro.response.status).toBe(401)
      expect(erro.response.data.message).toMatch(/CPF ou senha/i)
    }
  })

  it('a query string chega ao roteador', async () => {
    const resposta = await apiLocal().get('/health', { params: { qualquer: 'coisa' } })

    expect(resposta.status).toBe(200)
  })

  // mensagemDeErro() usa isAxiosError para achar a mensagem que a API mandou.
  it('o erro e reconhecido como erro do axios', async () => {
    try {
      await apiLocal().get('/me')
      expect.unreachable('deveria ter rejeitado')
    } catch (erro) {
      expect(axios.isAxiosError(erro)).toBe(true)
      expect(erro.response.data.message).toBeTruthy()
    }
  })

  // O cabecalho Authorization e posto pelo interceptor de request, que roda
  // antes do adapter. Se o adapter nao repassar, toda rota protegida da 401.
  it('repassa o cabecalho Authorization ao roteador', async () => {
    const api = apiLocal()
    api.interceptors.request.use((config) => {
      config.headers.Authorization = 'Bearer token-invalido'
      return config
    })

    // Token invalido chega ao autenticar e vira 401 "Falha ao autenticar" — o
    // que prova que o cabecalho atravessou. Sem repassar, a mensagem seria
    // "Token nao informado".
    try {
      await api.get('/me')
      expect.unreachable('deveria ter rejeitado')
    } catch (erro) {
      expect(erro.response.status).toBe(401)
      expect(erro.response.data.message).toMatch(/autenticar/i)
    }
  })
})
