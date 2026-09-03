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

import { ID_EM_ANDAMENTO, ID_LEMBRETE, limparTreino } from './notificacoes'

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
