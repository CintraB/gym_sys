import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../auth/contexto'
import { ALUNO, PROFESSOR } from '../test/utils'
import type { Usuario } from '../types'

const { isNativePlatform } = vi.hoisted(() => ({ isNativePlatform: vi.fn(() => true) }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }))

const addListener = vi.fn()
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: { addListener: (...a: unknown[]) => addListener(...a) },
}))

const sincronizarTreino = vi.fn()
vi.mock('./notificacoes', () => ({ sincronizarTreino: (...a: unknown[]) => sincronizarTreino(...a) }))

vi.mock('./api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  mensagemDeErro: (_e: unknown, padrao = 'erro') => padrao,
  registrarExpiracaoDeSessao: vi.fn(),
  tokenArmazenado: { ler: () => null, gravar: vi.fn(), limpar: vi.fn() },
}))

import { api } from './api'
import { useNotificacaoDeTreino } from './useNotificacaoDeTreino'

const get = vi.mocked(api.get)

function Harness() {
  useNotificacaoDeTreino()
  return null
}

function montar(usuario: Usuario | null) {
  const valor = {
    usuario,
    carregando: false,
    entrar: async () => usuario as Usuario,
    sair: () => {},
    atualizarUsuario: () => {},
  }
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthContext.Provider value={valor}>
        <Harness />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('useNotificacaoDeTreino', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isNativePlatform.mockReturnValue(true)
    get.mockResolvedValue({ data: null } as never)
    addListener.mockResolvedValue({ remove: vi.fn() })
  })

  it('reconcilia com a sessão do servidor na abertura', async () => {
    montar(ALUNO)

    await waitFor(() => expect(get).toHaveBeenCalledWith('/alunos/treino/sessao'))
    await waitFor(() => expect(sincronizarTreino).toHaveBeenCalledWith(null))
  })

  // Quem só dá aula não tem sessão de treino: a chamada seria 403 a cada
  // abertura do app.
  it('não consulta nada para quem não é aluno', async () => {
    montar(PROFESSOR)

    await waitFor(() => expect(addListener).not.toHaveBeenCalled())
    expect(get).not.toHaveBeenCalled()
  })

  it('não faz nada no navegador', async () => {
    isNativePlatform.mockReturnValue(false)

    montar(ALUNO)

    await waitFor(() => expect(get).not.toHaveBeenCalled())
  })
})
