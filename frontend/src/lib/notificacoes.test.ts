import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { isNativePlatform } = vi.hoisted(() => ({ isNativePlatform: vi.fn(() => true) }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform },
}))

const cancel = vi.fn()
const schedule = vi.fn()
const createChannel = vi.fn()
const checkPermissions = vi.fn(async () => ({ display: 'granted' }))
const requestPermissions = vi.fn(async () => ({ display: 'granted' }))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    cancel: (...args: unknown[]) => cancel(...args),
    schedule: (...args: unknown[]) => schedule(...args),
    createChannel: (...args: unknown[]) => createChannel(...args),
    checkPermissions: () => checkPermissions(),
    requestPermissions: () => requestPermissions(),
  },
}))

import {
  HORAS_ATE_LEMBRETE,
  ID_EM_ANDAMENTO,
  ID_LEMBRETE,
  anunciarTreino,
  garantirPermissao,
  limparTreino,
} from './notificacoes'

describe('limparTreino', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isNativePlatform.mockReturnValue(true)
  })

  it('cancela a notificação fixa e o lembrete, os dois de uma vez', async () => {
    await limparTreino()

    expect(cancel).toHaveBeenCalledWith({
      notifications: [{ id: ID_EM_ANDAMENTO }, { id: ID_LEMBRETE }],
    })
  })

  // O módulo é importado pela versão web também: no navegador ele tem de
  // carregar e não fazer nada, em vez de estourar sem o plugin nativo.
  it('não toca no plugin fora do aparelho', async () => {
    isNativePlatform.mockReturnValue(false)

    await limparTreino()

    expect(cancel).not.toHaveBeenCalled()
  })
})

describe('garantirPermissao', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isNativePlatform.mockReturnValue(true)
  })

  it('não reabre o diálogo de quem já concedeu', async () => {
    checkPermissions.mockResolvedValue({ display: 'granted' })

    const pode = await garantirPermissao()

    expect(pode).toBe(true)
    expect(requestPermissions).not.toHaveBeenCalled()
  })

  it('pede quando ainda não foi decidido', async () => {
    checkPermissions.mockResolvedValue({ display: 'prompt' })
    requestPermissions.mockResolvedValue({ display: 'granted' })

    const pode = await garantirPermissao()

    expect(pode).toBe(true)
    expect(requestPermissions).toHaveBeenCalled()
  })

  // O Android só deixa pedir duas vezes; depois disso o pedido é negado sem
  // mostrar diálogo. Insistir não traria nada e gastaria a chance.
  it('não insiste com quem já negou', async () => {
    checkPermissions.mockResolvedValue({ display: 'denied' })

    const pode = await garantirPermissao()

    expect(pode).toBe(false)
    expect(requestPermissions).not.toHaveBeenCalled()
  })

  it('devolve falso, sem estourar, se o plugin falhar', async () => {
    checkPermissions.mockRejectedValue(new Error('sem plugin'))

    await expect(garantirPermissao()).resolves.toBe(false)
  })
})

function sessaoFalsa(iniciadoEm: string, letra: string | null = 'A', nome: string | null = 'Peito e Tríceps') {
  return {
    sessao: {
      id_sessao: 1,
      id_treino: 1,
      id_bloco: 1,
      id_aluno: 2,
      iniciado_em: iniciadoEm,
      finalizado_em: null,
      duracao_segundos: null,
      nome_professor: 'Cristhian Cintra',
      bloco_letra: letra,
      bloco_nome: nome,
      observacao: null,
      calorias: null,
    },
    exercicios: [],
  }
}

/** Acha uma das notificações agendadas pelo id, no que foi passado ao schedule. */
function agendada(id: number) {
  const chamada = schedule.mock.calls.at(-1)?.[0] as
    | { notifications: Array<Record<string, unknown>> }
    | undefined
  return chamada?.notifications.find((n) => n.id === id)
}

describe('anunciarTreino', () => {
  const AGORA = new Date('2026-09-02T20:00:00Z')

  beforeEach(() => {
    vi.clearAllMocks()
    isNativePlatform.mockReturnValue(true)
    checkPermissions.mockResolvedValue({ display: 'granted' })
    vi.useFakeTimers()
    vi.setSystemTime(AGORA)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('posta a notificação fixa e agenda o lembrete de uma vez só', async () => {
    await anunciarTreino(sessaoFalsa(AGORA.toISOString()))

    expect(schedule).toHaveBeenCalledTimes(1)
    expect(agendada(ID_EM_ANDAMENTO)).toBeDefined()
    expect(agendada(ID_LEMBRETE)).toBeDefined()
  })

  // Sem ongoing a pessoa desliza o indicador para fora sem querer, e ele some
  // até o app reabrir.
  it('a fixa não desliza para fora e não faz som', async () => {
    await anunciarTreino(sessaoFalsa(AGORA.toISOString()))

    expect(agendada(ID_EM_ANDAMENTO)).toMatchObject({
      ongoing: true,
      autoCancel: false,
      channelId: 'treino-em-andamento',
    })
  })

  it('nomeia o bloco no título e leva a hora de início no corpo', async () => {
    await anunciarTreino(sessaoFalsa('2026-09-02T19:32:00Z'))

    const fixa = agendada(ID_EM_ANDAMENTO)
    expect(fixa?.title).toBe('Treino A em andamento')
    expect(fixa?.body).toContain('Peito e Tríceps')
    // A hora sai formatada no fuso local; basta provar que o horário está lá.
    expect(fixa?.body).toMatch(/\d{2}:\d{2}/)
  })

  it('funciona com bloco sem nome', async () => {
    await anunciarTreino(sessaoFalsa(AGORA.toISOString(), 'B', null))

    expect(agendada(ID_EM_ANDAMENTO)?.title).toBe('Treino B em andamento')
  })

  // O at sai de iniciado_em, não de Date.now(): reabrir o app não pode empurrar
  // o lembrete duas horas para frente toda vez.
  it('agenda o lembrete a partir do início da sessão, não de agora', async () => {
    const inicio = new Date('2026-09-02T19:00:00Z')
    vi.setSystemTime(new Date('2026-09-02T20:00:00Z'))

    await anunciarTreino(sessaoFalsa(inicio.toISOString()))

    const esperado = new Date(inicio.getTime() + HORAS_ATE_LEMBRETE * 60 * 60 * 1000)
    expect(agendada(ID_LEMBRETE)).toMatchObject({
      schedule: { at: esperado },
      channelId: 'lembretes',
    })
  })

  // Quem abre o app já está olhando para o treino em andamento: tocar o alarme
  // no mesmo segundo só assusta.
  it('descarta o lembrete já vencido, mas repõe a notificação fixa', async () => {
    vi.setSystemTime(new Date('2026-09-02T23:00:00Z'))

    await anunciarTreino(sessaoFalsa('2026-09-02T19:00:00Z'))

    expect(agendada(ID_LEMBRETE)).toBeUndefined()
    expect(agendada(ID_EM_ANDAMENTO)).toBeDefined()
  })

  it('o texto do lembrete acompanha a constante, em vez de repeti-la à mão', async () => {
    await anunciarTreino(sessaoFalsa(AGORA.toISOString()))

    expect(agendada(ID_LEMBRETE)?.body).toContain(String(HORAS_ATE_LEMBRETE))
  })

  it('cria os dois canais, com o indicador em importância mínima', async () => {
    await anunciarTreino(sessaoFalsa(AGORA.toISOString()))

    expect(createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'treino-em-andamento', importance: 1 }),
    )
    expect(createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'lembretes', importance: 3 }),
    )
  })

  it('sem permissão, não agenda nada — e não estoura', async () => {
    checkPermissions.mockResolvedValue({ display: 'denied' })

    await expect(anunciarTreino(sessaoFalsa(AGORA.toISOString()))).resolves.toBeUndefined()
    expect(schedule).not.toHaveBeenCalled()
  })

  it('não toca no plugin fora do aparelho', async () => {
    isNativePlatform.mockReturnValue(false)

    await anunciarTreino(sessaoFalsa(AGORA.toISOString()))

    expect(schedule).not.toHaveBeenCalled()
  })
})
