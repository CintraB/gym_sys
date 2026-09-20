import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, renderizar } from '../../test/utils'

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  mensagemDeErro: (_erro: unknown, padrao = 'Algo deu errado. Tente de novo.') => padrao,
  registrarExpiracaoDeSessao: vi.fn(),
  tokenArmazenado: { ler: () => null, gravar: vi.fn(), limpar: vi.fn() },
}))

import { api } from '../../lib/api'
import { NovoUsuario } from './NovoUsuario'

const post = vi.mocked(api.post)

async function preencher(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(screen.getByLabelText('Nome'), 'Pessoa Nova')
  await usuario.type(screen.getByLabelText(/cpf/i), '33333333333')
  await usuario.type(screen.getByLabelText(/t[íi]tulo/i), '333333333333')
  await usuario.type(screen.getByLabelText('Senha'), 'senha123')
}

describe('cadastro de usuário pelo admin', () => {
  beforeEach(() => vi.clearAllMocks())

  // Aluno vem marcado ao abrir: é o cadastro mais comum, e o teste que
  // depende disso é o de baixo — aqui ele é desmarcado de propósito, para o
  // envio provar a seleção e não o padrão.
  it('vem com Aluno marcado', () => {
    renderizar(<NovoUsuario aoFechar={vi.fn()} aoCriar={vi.fn()} />, { usuario: ADMIN })

    expect(screen.getByLabelText('Aluno')).toBeChecked()
    expect(screen.getByLabelText('Professor')).not.toBeChecked()
    expect(screen.getByLabelText('Admin')).not.toBeChecked()
  })

  it('manda os perfis marcados junto com os dados', async () => {
    post.mockResolvedValue({ data: { usuario: { nome: 'Pessoa Nova' } } } as never)
    const usuario = userEvent.setup()
    renderizar(<NovoUsuario aoFechar={vi.fn()} aoCriar={vi.fn()} />, { usuario: ADMIN })

    await preencher(usuario)
    await usuario.click(screen.getByLabelText('Aluno'))
    await usuario.click(screen.getByLabelText('Professor'))
    await usuario.click(screen.getByRole('button', { name: /cadastrar/i }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/admin/usuarios',
        expect.objectContaining({
          nome: 'Pessoa Nova',
          cpf: '33333333333',
          titulo: '333333333333',
          senha: 'senha123',
          aluno: false,
          professor: true,
          admin: false,
        }),
      ),
    )
  })

  // A trava real é do servidor; aqui é para não oferecer um botão que só pode
  // falhar — mesma decisão já tomada na tela de edição.
  it('não deixa cadastrar sem perfil nenhum', async () => {
    const usuario = userEvent.setup()
    renderizar(<NovoUsuario aoFechar={vi.fn()} aoCriar={vi.fn()} />, { usuario: ADMIN })

    await preencher(usuario)
    await usuario.click(screen.getByLabelText('Aluno'))

    expect(screen.getByRole('button', { name: /cadastrar/i })).toBeDisabled()
    expect(post).not.toHaveBeenCalled()
  })

  it('mostra o motivo quando o CPF já existe', async () => {
    post.mockRejectedValue({ response: { status: 409 } })
    const usuario = userEvent.setup()
    renderizar(<NovoUsuario aoFechar={vi.fn()} aoCriar={vi.fn()} />, { usuario: ADMIN })

    await preencher(usuario)
    await usuario.click(screen.getByRole('button', { name: /cadastrar/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
