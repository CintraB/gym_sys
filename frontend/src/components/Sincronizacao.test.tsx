import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderizar } from '../test/utils'
import { Sincronizacao } from './Sincronizacao'

const entrarNaSincronizacao = vi.fn()
const sincronizar = vi.fn()
const sair = vi.fn()
const entrarNoApp = vi.fn()
let estadoAtual = { ligada: false, online: null as boolean | null, ultima: null, ocupada: false }

vi.mock('../local/sincronizacao/doApp.js', () => ({
  sincronizacaoDoApp: () => ({
    estado: () => estadoAtual,
    assinar: () => () => {},
    entrarNaSincronizacao,
    sair,
    sincronizar,
    pendentes: async () => [{ id_sessao: 1 }, { id_sessao: 2 }],
  }),
}))

describe('tela de sincronizacao', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    estadoAtual = { ligada: false, online: null, ultima: null, ocupada: false }
  })

  it('deixa claro que da para usar o app sem ativar', () => {
    renderizar(<Sincronizacao />, { entrar: entrarNoApp })
    expect(screen.getByText(/continua funcionando normalmente/i)).toBeInTheDocument()
  })

  // O aviso não pode ser nota de rodapé depois do fato: apagar o histórico é
  // decisão dela, e precisa estar visível antes de digitar a senha.
  it('avisa que o historico local vai embora ANTES de entrar', async () => {
    renderizar(<Sincronizacao />, { entrar: entrarNoApp })
    await userEvent.click(screen.getByRole('button', { name: /ativar sincroniza/i }))

    expect(screen.getByText(/ser[áa] apagado/i)).toBeInTheDocument()
    expect(entrarNaSincronizacao).not.toHaveBeenCalled()
  })

  it('so entra depois de confirmar, com CPF e senha', async () => {
    entrarNaSincronizacao.mockResolvedValue({ exerciciosDaFicha: 12, blocos: 3 })
    renderizar(<Sincronizacao />, { entrar: entrarNoApp })

    await userEvent.click(screen.getByRole('button', { name: /ativar sincroniza/i }))
    await userEvent.type(screen.getByLabelText(/cpf/i), '11111111111')
    await userEvent.type(screen.getByLabelText('Senha'), 'senha123')
    await userEvent.click(screen.getByRole('button', { name: /confirmar e ativar/i }))

    await waitFor(() =>
      expect(entrarNaSincronizacao).toHaveBeenCalledWith({
        cpf: '11111111111',
        senha: 'senha123',
      }),
    )
  })

  // O recomeço troca a linha do usuário pela do servidor, com o id de lá, e o
  // token do app aponta para o id antigo — sem entrar de novo, a pessoa é
  // jogada para o login logo depois de ativar. Aconteceu no emulador.
  it('entra de novo no app depois de ativar, com a mesma credencial', async () => {
    entrarNaSincronizacao.mockResolvedValue({ exerciciosDaFicha: 12, blocos: 3 })
    renderizar(<Sincronizacao />, { entrar: entrarNoApp })

    await userEvent.click(screen.getByRole('button', { name: /ativar sincroniza/i }))
    await userEvent.type(screen.getByLabelText(/cpf/i), '11111111111')
    await userEvent.type(screen.getByLabelText('Senha'), 'senha123')
    await userEvent.click(screen.getByRole('button', { name: /confirmar e ativar/i }))

    await waitFor(() => expect(entrarNoApp).toHaveBeenCalledWith('11111111111', 'senha123'))
  })

  it('falha de rede ao ativar nao vira erro tecnico na tela', async () => {
    entrarNaSincronizacao.mockRejectedValue({ tipo: 'rede', message: 'Sem conexão com o servidor' })
    renderizar(<Sincronizacao />, { entrar: entrarNoApp })

    await userEvent.click(screen.getByRole('button', { name: /ativar sincroniza/i }))
    await userEvent.type(screen.getByLabelText(/cpf/i), '111')
    await userEvent.type(screen.getByLabelText('Senha'), 'x')
    await userEvent.click(screen.getByRole('button', { name: /confirmar e ativar/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/sem conex/i)
  })

  it('ligada: mostra quantos treinos faltam subir', async () => {
    estadoAtual = { ligada: true, online: true, ultima: null, ocupada: false }
    renderizar(<Sincronizacao />, { entrar: entrarNoApp })

    expect(await screen.findByText(/2 treino\(s\) aguardando/i)).toBeInTheDocument()
  })

  it('sem rede, diz que os treinos ficam guardados — e nao que deu erro', async () => {
    estadoAtual = { ligada: true, online: true, ultima: null, ocupada: false }
    sincronizar.mockResolvedValue({ online: false })
    renderizar(<Sincronizacao />, { entrar: entrarNoApp })

    await userEvent.click(screen.getByRole('button', { name: /sincronizar agora/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/guardados aqui e sobem depois/i)
  })

  it('token vencido pede para ativar de novo, sem falar em sair do app', async () => {
    estadoAtual = { ligada: true, online: true, ultima: null, ocupada: false }
    sincronizar.mockResolvedValue({ precisaEntrarDeNovo: true })
    renderizar(<Sincronizacao />, { entrar: entrarNoApp })

    await userEvent.click(screen.getByRole('button', { name: /sincronizar agora/i }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(/ative de novo/i)
    expect(alerta).not.toHaveTextContent(/sair|login/i)
  })

  it('sucesso diz quantos subiram', async () => {
    estadoAtual = { ligada: true, online: true, ultima: null, ocupada: false }
    sincronizar.mockResolvedValue({ enviadas: 3, repetidas: 0, falhas: 0, online: true })
    renderizar(<Sincronizacao />, { entrar: entrarNoApp })

    await userEvent.click(screen.getByRole('button', { name: /sincronizar agora/i }))

    expect(await screen.findByRole('status')).toHaveTextContent(/3 treino\(s\) enviado/i)
  })
})
