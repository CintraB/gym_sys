import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { ID_EM_ANDAMENTO, ID_LEMBRETE, garantirPermissao, limparTreino } from './notificacoes'

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
