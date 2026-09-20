import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, renderizar } from '../../test/utils'

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  mensagemDeErro: (_erro: unknown, padrao = 'Algo deu errado. Tente de novo.') => padrao,
  registrarExpiracaoDeSessao: vi.fn(),
  tokenArmazenado: { ler: () => null, gravar: vi.fn(), limpar: vi.fn() },
}))

import { api } from '../../lib/api'
import Usuarios from './Usuarios'

const get = vi.mocked(api.get)

describe('tela de usuários do admin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    get.mockResolvedValue({ data: [] } as never)
  })

  it('abre o cadastro de usuário pelo botão', async () => {
    const usuario = userEvent.setup()
    renderizar(<Usuarios />, { usuario: ADMIN })

    await usuario.click(await screen.findByRole('button', { name: /novo usu[áa]rio/i }))

    expect(await screen.findByRole('dialog', { name: /novo usu[áa]rio/i })).toBeInTheDocument()
  })
})
