import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ErroSincronizacao } from './cliente.js'
import { esquecerToken, guardarToken, tokenGuardado } from './identidade.js'
import { criarSincronizacao } from './index.js'

const DAQUI_A_UM_MES = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30

/**
 * Banco falso, e não SQLite de verdade: aqui se testa o MOTOR — quando roda, o
 * que faz com cada tipo de falha —, e não o SQL, que é de `subida.test.js` e
 * `recomeco.test.js`, contra banco real.
 *
 * Precisa responder às três consultas do caminho: a fila, a sessão e as linhas
 * filhas. Um mock que só responde à fila faz `montarPacote` estourar com
 * "sessão não existe", e o teste passa a medir outra coisa.
 */
function bancoFalso(pendentes = 0) {
  const fila = Array.from({ length: pendentes }, (_, i) => ({ id_sessao: i + 1 }))
  return {
    query: vi.fn(async (sql, valores) => {
      if (/LEFT JOIN sincronizacao_envio/i.test(sql)) return { rows: fila }
      if (/FROM sessao_treino WHERE id_sessao/i.test(sql)) {
        return {
          rows: [
            {
              id_sessao: valores[0],
              id_treino: 1,
              id_bloco: 1,
              id_aluno: 1,
              iniciado_em: '2026-09-13T10:00:00.000Z',
              finalizado_em: '2026-09-13T11:00:00.000Z',
              duracao_segundos: 3600,
              observacao: null,
              calorias: null,
              uuid: `uuid-da-sessao-${valores[0]}`,
            },
          ],
        }
      }
      return { rows: [] }
    }),
  }
}

describe('motor de sincronizacao', () => {
  beforeEach(() => esquecerToken())

  it('sem token, nao tenta rede nenhuma', async () => {
    const cliente = { rpc: vi.fn(), rest: vi.fn() }
    const sinc = criarSincronizacao({ bd: bancoFalso(), cliente })

    const resultado = await sinc.sincronizar()

    expect(resultado.ligada).toBe(false)
    expect(cliente.rpc).not.toHaveBeenCalled()
  })

  it('sem pendencia, nao chama o servidor a toa', async () => {
    guardarToken('tok', DAQUI_A_UM_MES)
    const cliente = { rpc: vi.fn(), rest: vi.fn() }
    const sinc = criarSincronizacao({ bd: bancoFalso(0), cliente })

    await sinc.sincronizar()
    expect(cliente.rpc).not.toHaveBeenCalled()
  })

  it('falha de rede marca offline, sem estourar', async () => {
    guardarToken('tok', DAQUI_A_UM_MES)
    const cliente = {
      rpc: vi.fn().mockRejectedValue(new ErroSincronizacao('rede', 'Sem conexão')),
      rest: vi.fn(),
    }
    const sinc = criarSincronizacao({ bd: bancoFalso(1), cliente })

    await expect(sinc.sincronizar()).resolves.toMatchObject({ online: false })
    expect(sinc.estado().online).toBe(false)
  })

  it('sucesso marca online', async () => {
    guardarToken('tok', DAQUI_A_UM_MES)
    const cliente = { rpc: vi.fn().mockResolvedValue({ criada: true }), rest: vi.fn() }
    const sinc = criarSincronizacao({ bd: bancoFalso(1), cliente })

    await sinc.sincronizar()
    expect(sinc.estado().online).toBe(true)
  })

  it('401 nao derruba a sessao do app — so desliga a sincronizacao', async () => {
    guardarToken('tok', DAQUI_A_UM_MES)
    const cliente = {
      rpc: vi.fn().mockRejectedValue(new ErroSincronizacao('credencial', 'token velho')),
      rest: vi.fn(),
    }
    const sinc = criarSincronizacao({ bd: bancoFalso(1), cliente })

    const resultado = await sinc.sincronizar()

    expect(resultado.precisaEntrarDeNovo).toBe(true)
    // O token da sincronização some; o do aplicativo, que é outra chave e outra
    // identidade, não é tocado por ninguém aqui.
    expect(tokenGuardado()).toBeNull()
    expect(sinc.estado().ligada).toBe(false)
  })

  it('nao roda duas vezes ao mesmo tempo', async () => {
    guardarToken('tok', DAQUI_A_UM_MES)
    let resolver
    const cliente = {
      rpc: vi.fn(
        () =>
          new Promise((r) => {
            resolver = () => r({ criada: true })
          }),
      ),
      rest: vi.fn(),
    }
    const sinc = criarSincronizacao({ bd: bancoFalso(1), cliente })

    const primeira = sinc.sincronizar()
    // Espera a primeira chegar à rede: a trava é ligada antes de qualquer
    // `await`, então já vale aqui — mas `resolver` só existe depois que o `rpc`
    // foi chamado.
    await vi.waitFor(() => expect(cliente.rpc).toHaveBeenCalled())

    const segunda = await sinc.sincronizar()
    expect(segunda.ocupada).toBe(true)
    expect(cliente.rpc).toHaveBeenCalledTimes(1)

    resolver()
    await primeira
  })

  it('avisa quem assinou quando o estado muda', async () => {
    guardarToken('tok', DAQUI_A_UM_MES)
    const ouvinte = vi.fn()
    const cliente = { rpc: vi.fn().mockResolvedValue({ criada: true }), rest: vi.fn() }
    const sinc = criarSincronizacao({ bd: bancoFalso(1), cliente })

    sinc.assinar(ouvinte)
    await sinc.sincronizar()

    expect(ouvinte).toHaveBeenCalled()
  })

  it('deixar de assinar para de receber aviso', async () => {
    guardarToken('tok', DAQUI_A_UM_MES)
    const ouvinte = vi.fn()
    const cliente = { rpc: vi.fn().mockResolvedValue({ criada: true }), rest: vi.fn() }
    const sinc = criarSincronizacao({ bd: bancoFalso(1), cliente })

    const cancelar = sinc.assinar(ouvinte)
    cancelar()
    await sinc.sincronizar()

    expect(ouvinte).not.toHaveBeenCalled()
  })
})
