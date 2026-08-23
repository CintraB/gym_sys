import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Os dois formulários de senha, pelo lado de quem preenche.
 *
 * O que se procura aqui é o erro de digitação: repetição que não confere, campo
 * incompleto, senha atual errada, envio duplo. São os casos que chegam ao
 * aparelho — e o do 401 na senha atual chegou mesmo.
 */
vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  mensagemDeErro: (erro: unknown, padrao = 'Algo deu errado. Tente de novo.') => {
    const mensagem = (erro as { response?: { data?: { message?: string } } })?.response?.data
      ?.message
    return mensagem ?? padrao
  },
  registrarExpiracaoDeSessao: vi.fn(),
  tokenArmazenado: { ler: () => null, gravar: vi.fn(), limpar: vi.fn() },
}))

import { api, tokenArmazenado } from '../lib/api'
import { TrocarSenha } from './TrocarSenha'
import { RedefinirSenha } from '../pages/admin/RedefinirSenha'

const put = vi.mocked(api.put)
const gravarToken = vi.mocked(tokenArmazenado.gravar)

/** Erro no formato que o axios entrega às telas. */
const erroDaApi = (status: number, message: string) => ({
  isAxiosError: true,
  response: { status, data: { message } },
})

const USUARIO = {
  id: 7,
  nome: 'Ana Souza',
  cpf: '22222222222',
  email: 'ana@teste.com',
  titulo: '222222222222',
  aluno: true,
  professor: false,
  admin: false,
  ativo: true,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Trocar minha senha', () => {
  const preencher = async (
    usuario: ReturnType<typeof userEvent.setup>,
    { atual = 'senha123', nova = 'outraSenha456', repetida = 'outraSenha456' } = {},
  ) => {
    if (atual) await usuario.type(screen.getByLabelText('Senha atual'), atual)
    if (nova) await usuario.type(screen.getByLabelText('Senha nova'), nova)
    if (repetida) await usuario.type(screen.getByLabelText('Repita a senha nova'), repetida)
  }

  it('mantém o botão desligado enquanto o formulário está incompleto', async () => {
    const usuario = userEvent.setup()
    render(<TrocarSenha aoFechar={() => {}} />)

    const trocar = screen.getByRole('button', { name: 'Trocar' })
    expect(trocar).toBeDisabled()

    await preencher(usuario, { nova: '12345', repetida: '12345' })
    expect(trocar, 'senha de cinco caracteres não podia liberar o envio').toBeDisabled()

    await usuario.type(screen.getByLabelText('Senha nova'), '6')
    await usuario.type(screen.getByLabelText('Repita a senha nova'), '6')
    expect(trocar).toBeEnabled()
  })

  // Gastar uma ida ao servidor para descobrir um erro que o próprio formulário
  // enxerga é ruim no celular, onde a rede é o gargalo.
  it('repetição divergente para antes de chamar a API', async () => {
    const usuario = userEvent.setup()
    render(<TrocarSenha aoFechar={() => {}} />)

    await preencher(usuario, { repetida: 'outraSenha457' })
    await usuario.click(screen.getByRole('button', { name: 'Trocar' }))

    expect(await screen.findByText(/repetição não confere/i)).toBeInTheDocument()
    expect(put).not.toHaveBeenCalled()
  })

  it('manda senha atual e senha nova nos campos que a API espera', async () => {
    const usuario = userEvent.setup()
    put.mockResolvedValue({ data: { token: 'token-novo' } })
    render(<TrocarSenha aoFechar={() => {}} />)

    await preencher(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Trocar' }))

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/me/senha', {
        senha_atual: 'senha123',
        senha_nova: 'outraSenha456',
      }),
    )
  })

  it('guarda o token novo para não cair no login logo depois de trocar', async () => {
    const usuario = userEvent.setup()
    put.mockResolvedValue({ data: { token: 'token-novo' } })
    render(<TrocarSenha aoFechar={() => {}} />)

    await preencher(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Trocar' }))

    expect(await screen.findByText(/senha alterada/i)).toBeInTheDocument()
    expect(gravarToken).toHaveBeenCalledWith('token-novo')
  })

  // O 401 aqui é "a senha atual está errada", e não "sua sessão morreu": o modal
  // continua aberto, com o erro à vista, para a pessoa tentar de novo.
  it('senha atual errada mostra o erro sem fechar o formulário', async () => {
    const usuario = userEvent.setup()
    put.mockRejectedValue(erroDaApi(401, 'CPF ou senha incorretos'))
    render(<TrocarSenha aoFechar={() => {}} />)

    await preencher(usuario, { atual: 'chuteErrado' })
    await usuario.click(screen.getByRole('button', { name: 'Trocar' }))

    expect(await screen.findByText('CPF ou senha incorretos')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha atual')).toBeInTheDocument()
    expect(screen.queryByText(/senha alterada/i)).not.toBeInTheDocument()
  })

  it('erro sem mensagem cai no texto genérico da tela', async () => {
    const usuario = userEvent.setup()
    put.mockRejectedValue(new Error('Network Error'))
    render(<TrocarSenha aoFechar={() => {}} />)

    await preencher(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Trocar' }))

    expect(await screen.findByText('Não foi possível trocar a senha.')).toBeInTheDocument()
  })

  // A segunda chamada iria com a senha atual já trocada e voltaria 401 — erro
  // em cima de uma troca que deu certo.
  it('clicar duas vezes envia uma requisição só', async () => {
    const usuario = userEvent.setup()
    let concluir: (valor: unknown) => void = () => {}
    put.mockReturnValue(new Promise((resolver) => (concluir = resolver)))
    render(<TrocarSenha aoFechar={() => {}} />)

    await preencher(usuario)
    const trocar = screen.getByRole('button', { name: 'Trocar' })
    await usuario.click(trocar)
    await usuario.click(trocar)

    expect(put).toHaveBeenCalledOnce()
    concluir({ data: { token: 'token-novo' } })
  })

  it('o erro some quando a pessoa corrige e envia de novo', async () => {
    const usuario = userEvent.setup()
    render(<TrocarSenha aoFechar={() => {}} />)

    await preencher(usuario, { repetida: 'outraSenha457' })
    await usuario.click(screen.getByRole('button', { name: 'Trocar' }))
    expect(await screen.findByText(/repetição não confere/i)).toBeInTheDocument()

    put.mockResolvedValue({ data: { token: 'token-novo' } })
    await usuario.clear(screen.getByLabelText('Repita a senha nova'))
    await usuario.type(screen.getByLabelText('Repita a senha nova'), 'outraSenha456')
    await usuario.click(screen.getByRole('button', { name: 'Trocar' }))

    expect(await screen.findByText(/senha alterada/i)).toBeInTheDocument()
    expect(screen.queryByText(/repetição não confere/i)).not.toBeInTheDocument()
  })
})

describe('Redefinir senha de outra pessoa', () => {
  const preencher = async (
    usuario: ReturnType<typeof userEvent.setup>,
    { nova = 'temporaria1', repetida = 'temporaria1' } = {},
  ) => {
    if (nova) await usuario.type(screen.getByLabelText('Senha temporária'), nova)
    if (repetida) await usuario.type(screen.getByLabelText('Repita a senha'), repetida)
  }

  it('avisa de quem é a conta antes de confirmar', () => {
    render(<RedefinirSenha usuario={USUARIO} aoFechar={() => {}} aoRedefinir={() => {}} />)

    expect(screen.getAllByText(/Ana Souza/).length).toBeGreaterThan(0)
    expect(screen.getByText(/vai precisar entrar de novo/i)).toBeInTheDocument()
  })

  it('mantém o botão desligado com senha curta ou repetição vazia', async () => {
    const usuario = userEvent.setup()
    render(<RedefinirSenha usuario={USUARIO} aoFechar={() => {}} aoRedefinir={() => {}} />)

    const redefinir = screen.getByRole('button', { name: 'Redefinir' })
    expect(redefinir).toBeDisabled()

    await preencher(usuario, { nova: '12345', repetida: '' })
    expect(redefinir).toBeDisabled()
  })

  it('repetição divergente para antes de chamar a API', async () => {
    const usuario = userEvent.setup()
    render(<RedefinirSenha usuario={USUARIO} aoFechar={() => {}} aoRedefinir={() => {}} />)

    await preencher(usuario, { repetida: 'temporaria2' })
    await usuario.click(screen.getByRole('button', { name: 'Redefinir' }))

    expect(await screen.findByText(/repetição não confere/i)).toBeInTheDocument()
    expect(put).not.toHaveBeenCalled()
  })

  it('redefine na conta do usuário escolhido, e não em outra', async () => {
    const usuario = userEvent.setup()
    const aoRedefinir = vi.fn()
    put.mockResolvedValue({ data: { message: 'ok' } })
    render(<RedefinirSenha usuario={USUARIO} aoFechar={() => {}} aoRedefinir={aoRedefinir} />)

    await preencher(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Redefinir' }))

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/admin/usuarios/7/senha', { senha_nova: 'temporaria1' }),
    )
    expect(aoRedefinir).toHaveBeenCalledWith('Ana Souza')
  })

  // Acontece de verdade: o admin acha a própria linha na lista e clica na chave.
  // O servidor recusa com 403, e a tela precisa dizer o porquê.
  it('mostra a recusa do servidor na própria conta do admin', async () => {
    const usuario = userEvent.setup()
    const aoRedefinir = vi.fn()
    put.mockRejectedValue(erroDaApi(403, 'Use a troca de senha comum para a sua própria conta'))
    render(<RedefinirSenha usuario={USUARIO} aoFechar={() => {}} aoRedefinir={aoRedefinir} />)

    await preencher(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Redefinir' }))

    expect(
      await screen.findByText('Use a troca de senha comum para a sua própria conta'),
    ).toBeInTheDocument()
    expect(aoRedefinir).not.toHaveBeenCalled()
  })

  it('clicar duas vezes envia uma requisição só', async () => {
    const usuario = userEvent.setup()
    let concluir: (valor: unknown) => void = () => {}
    put.mockReturnValue(new Promise((resolver) => (concluir = resolver)))
    render(<RedefinirSenha usuario={USUARIO} aoFechar={() => {}} aoRedefinir={() => {}} />)

    await preencher(usuario)
    const redefinir = screen.getByRole('button', { name: 'Redefinir' })
    await usuario.click(redefinir)
    await usuario.click(redefinir)

    expect(put).toHaveBeenCalledOnce()
    concluir({ data: { message: 'ok' } })
  })
})
