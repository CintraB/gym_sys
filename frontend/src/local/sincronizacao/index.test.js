import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ErroSincronizacao } from './cliente.js'
import { guardarToken, tokenGuardado } from './identidade.js'
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
  // `clear`, e não só `esquecerToken`: a marca do contato diário também mora no
  // localStorage, e sem limpá-la o primeiro caso gravaria a marca e os
  // seguintes veriam um contato recente demais para tentar de novo.
  beforeEach(() => localStorage.clear())

  it('sem token, nao tenta rede nenhuma', async () => {
    const cliente = { rpc: vi.fn(), rest: vi.fn() }
    const sinc = criarSincronizacao({ bd: bancoFalso(), cliente })

    const resultado = await sinc.sincronizar()

    expect(resultado.ligada).toBe(false)
    expect(cliente.rpc).not.toHaveBeenCalled()
  })

  it('sem pendencia, nao sobe nada', async () => {
    guardarToken('tok', DAQUI_A_UM_MES)
    const cliente = { rpc: vi.fn(), rest: vi.fn().mockResolvedValue([{ id: 1 }]) }
    const sinc = criarSincronizacao({ bd: bancoFalso(0), cliente })

    await sinc.sincronizar()
    expect(cliente.rpc).not.toHaveBeenCalled()
  })

  /**
   * O contato diário existe por causa da pausa automática do Supabase: o plano
   * gratuito pausa quem tem "atividade insuficiente" na semana, e o projeto
   * pausou em 19/09/2026 mesmo com quatro treinos subidos em seis dias. Sem
   * pendência o motor não tocava a rede nenhuma vez, então dia sem treino era
   * dia sem uma única requisição.
   */
  it('sem pendencia, mantem o contato diario com o servidor', async () => {
    guardarToken('tok', DAQUI_A_UM_MES)
    const cliente = { rpc: vi.fn(), rest: vi.fn().mockResolvedValue([{ id: 1 }]) }
    const sinc = criarSincronizacao({ bd: bancoFalso(0), cliente })

    const resultado = await sinc.sincronizar()

    expect(cliente.rest).toHaveBeenCalled()
    expect(resultado.online).toBe(true)
    expect(sinc.estado().online).toBe(true)
  })

  it('o contato diario nao se repete ao reabrir o app no mesmo dia', async () => {
    guardarToken('tok', DAQUI_A_UM_MES)
    const cliente = { rpc: vi.fn(), rest: vi.fn().mockResolvedValue([{ id: 1 }]) }

    await criarSincronizacao({ bd: bancoFalso(0), cliente }).sincronizar()
    // Instância nova de propósito: é o que o app faz ao ser fechado e aberto de
    // novo, e a marca do contato precisa sobreviver a isso — ela mora no
    // localStorage, não na memória do motor.
    await criarSincronizacao({ bd: bancoFalso(0), cliente }).sincronizar()

    expect(cliente.rest).toHaveBeenCalledTimes(1)
  })

  it('no dia seguinte o contato acontece de novo', async () => {
    guardarToken('tok', DAQUI_A_UM_MES)
    const cliente = { rpc: vi.fn(), rest: vi.fn().mockResolvedValue([{ id: 1 }]) }

    vi.useFakeTimers()
    try {
      // Dois dias seguidos, o app aberto no mesmo horário: é o padrão de quem
      // treina depois do trabalho, e é ele que a janela de 20 h precisa cobrir.
      vi.setSystemTime(new Date('2026-09-19T23:00:00.000Z'))
      await criarSincronizacao({ bd: bancoFalso(0), cliente }).sincronizar()

      vi.setSystemTime(new Date('2026-09-20T23:00:00.000Z'))
      await criarSincronizacao({ bd: bancoFalso(0), cliente }).sincronizar()
    } finally {
      vi.useRealTimers()
    }

    expect(cliente.rest).toHaveBeenCalledTimes(2)
  })

  /**
   * O projeto pausado responde como servidor fora do ar. Se a tentativa que
   * falhou gastasse o dia, o app só voltaria a tocar o servidor 20 h depois —
   * e ficaria offline sem saber, que foi exatamente o estado de 19/09/2026.
   */
  it('contato que falha por rede nao gasta o dia', async () => {
    guardarToken('tok', DAQUI_A_UM_MES)
    const cliente = {
      rpc: vi.fn(),
      rest: vi.fn().mockRejectedValueOnce(new ErroSincronizacao('rede', 'Sem conexão')),
    }
    const sinc = criarSincronizacao({ bd: bancoFalso(0), cliente })

    await expect(sinc.sincronizar()).resolves.toMatchObject({ online: false })
    expect(sinc.estado().online).toBe(false)

    // O servidor voltou: a próxima abertura tenta de novo, sem esperar o dia.
    cliente.rest.mockResolvedValue([{ id: 1 }])
    await sinc.sincronizar()

    expect(cliente.rest).toHaveBeenCalledTimes(2)
    expect(sinc.estado().online).toBe(true)
  })

  it('subir um treino tambem conta como o contato do dia', async () => {
    guardarToken('tok', DAQUI_A_UM_MES)
    const cliente = {
      rpc: vi.fn().mockResolvedValue({ criada: true }),
      rest: vi.fn().mockResolvedValue([{ id: 1 }]),
    }

    // Dia de treino: a sessão sobe, e isso já é atividade para o servidor.
    await criarSincronizacao({ bd: bancoFalso(1), cliente }).sincronizar()
    // Abrir o app de novo no mesmo dia não deve render uma requisição extra.
    await criarSincronizacao({ bd: bancoFalso(0), cliente }).sincronizar()

    expect(cliente.rpc).toHaveBeenCalledTimes(1)
    expect(cliente.rest).not.toHaveBeenCalled()
  })

  /**
   * Sem isto, `ultima` nasce nula a cada abertura e a tela não tem como dizer
   * quando o servidor foi tocado pela última vez — que é a única informação
   * capaz de desmentir um "conectado" que nunca foi verificado.
   */
  it('a data da ultima sincronizacao sobrevive a fechar o app', async () => {
    guardarToken('tok', DAQUI_A_UM_MES)
    const cliente = { rpc: vi.fn(), rest: vi.fn().mockResolvedValue([{ id: 1 }]) }

    await criarSincronizacao({ bd: bancoFalso(0), cliente }).sincronizar()
    const depoisDeReabrir = criarSincronizacao({ bd: bancoFalso(0), cliente })

    expect(depoisDeReabrir.estado().ultima).toBeTruthy()
  })

  it('sem nenhum contato, o estado nao afirma que esta online', () => {
    guardarToken('tok', DAQUI_A_UM_MES)
    const sinc = criarSincronizacao({ bd: bancoFalso(0), cliente: { rpc: vi.fn(), rest: vi.fn() } })

    expect(sinc.estado().online).toBeNull()
    expect(sinc.estado().ultima).toBeNull()
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
