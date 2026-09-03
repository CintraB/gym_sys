import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dumbbell } from 'lucide-react'
import { ALUNO, PROFESSOR, renderizar } from '../test/utils'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  mensagemDeErro: (_erro: unknown, padrao = 'Algo deu errado. Tente de novo.') => padrao,
  registrarExpiracaoDeSessao: vi.fn(),
  tokenArmazenado: { ler: () => null, gravar: vi.fn(), limpar: vi.fn() },
}))

const anunciarTreino = vi.fn()
const limparTreino = vi.fn()
vi.mock('../lib/notificacoes', () => ({
  anunciarTreino: (...a: unknown[]) => anunciarTreino(...a),
  limparTreino: (...a: unknown[]) => limparTreino(...a),
  sincronizarTreino: vi.fn(),
}))

// A partir daqui o AppShell monta useNotificacaoDeTreino, que importa o
// Capacitor no topo do módulo — mockar só '../lib/notificacoes' não basta,
// senão o hook real vai atrás do plugin de verdade.
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: { addListener: vi.fn(async () => ({ remove: vi.fn() })) },
}))

import { api } from '../lib/api'
import { AppShell, type ItemNav } from './AppShell'

const get = vi.mocked(api.get)
const post = vi.mocked(api.post)
const del = vi.mocked(api.delete)

const ITENS: ItemNav[] = [{ para: '/aluno', rotulo: 'Meu treino', icone: Dumbbell }]

const SESSAO_ATIVA = {
  sessao: {
    id_sessao: 1,
    id_treino: 1,
    id_bloco: 1,
    id_aluno: 2,
    iniciado_em: new Date().toISOString(),
    finalizado_em: null,
    duracao_segundos: null,
    nome_professor: 'Cristhian Cintra',
    bloco_letra: 'A',
    bloco_nome: 'Peito e Tríceps',
  },
  exercicios: [
    {
      id: 1,
      concluido: false,
      concluido_em: null,
      id_ex_usuario: 1,
      numero_serie: 4,
      repeticoes: '10 a 15',
      carga: 30,
      observacao_ex_usuario: null,
      nome_exercicio: 'SUPINO SENTADO',
      tipo: 'PEITO',
    },
  ],
}

async function clicarSair(usuario: ReturnType<typeof userEvent.setup>) {
  const [botao] = screen.getAllByRole('button', { name: /sair/i })
  await usuario.click(botao)
}

describe('AppShell — guarda a rota atual para retomar depois', () => {
  it('grava a rota em que está montado', () => {
    renderizar(
      <AppShell itens={ITENS}>
        <div>conteúdo</div>
      </AppShell>,
      { usuario: ALUNO, rota: '/aluno/historico' },
    )

    expect(localStorage.getItem('gymsys.ultima_rota')).toBe('/aluno/historico')
  })
})

describe('AppShell — sair com treino em andamento', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    post.mockResolvedValue({ data: {} } as never)
    del.mockResolvedValue({ data: {} } as never)
  })

  it('professor sai direto, sem checar sessão de treino', async () => {
    const usuario = userEvent.setup()
    const sair = vi.fn()
    renderizar(
      <AppShell itens={ITENS}>
        <div>conteúdo</div>
      </AppShell>,
      { usuario: PROFESSOR, sair },
    )

    await clicarSair(usuario)

    expect(get).not.toHaveBeenCalled()
    expect(sair).toHaveBeenCalledOnce()
  })

  it('aluno sem sessão ativa sai direto', async () => {
    get.mockResolvedValue({ data: null } as never)
    const usuario = userEvent.setup()
    const sair = vi.fn()
    renderizar(
      <AppShell itens={ITENS}>
        <div>conteúdo</div>
      </AppShell>,
      { usuario: ALUNO, sair },
    )

    await clicarSair(usuario)

    await waitFor(() => expect(sair).toHaveBeenCalledOnce())
  })

  it('aluno com sessão ativa vê painel de decisão antes de sair', async () => {
    get.mockResolvedValue({ data: SESSAO_ATIVA } as never)
    const usuario = userEvent.setup()
    const sair = vi.fn()
    renderizar(
      <AppShell itens={ITENS}>
        <div>conteúdo</div>
      </AppShell>,
      { usuario: ALUNO, sair },
    )

    await clicarSair(usuario)

    expect(await screen.findByRole('dialog', { name: /treino em andamento/i })).toBeInTheDocument()
    expect(sair).not.toHaveBeenCalled()
  })

  it('finalizar e sair encerra a sessão e desloga', async () => {
    get.mockResolvedValue({ data: SESSAO_ATIVA } as never)
    const usuario = userEvent.setup()
    const sair = vi.fn()
    renderizar(
      <AppShell itens={ITENS}>
        <div>conteúdo</div>
      </AppShell>,
      { usuario: ALUNO, sair },
    )

    await clicarSair(usuario)
    const painel = await screen.findByRole('dialog', { name: /treino em andamento/i })
    await usuario.click(within(painel).getByRole('button', { name: /finalizar e sair/i }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/alunos/treino/sessao/finalizar')
      expect(sair).toHaveBeenCalledOnce()
    })
  })

  it('descartar e sair apaga a sessão e desloga', async () => {
    get.mockResolvedValue({ data: SESSAO_ATIVA } as never)
    const usuario = userEvent.setup()
    const sair = vi.fn()
    renderizar(
      <AppShell itens={ITENS}>
        <div>conteúdo</div>
      </AppShell>,
      { usuario: ALUNO, sair },
    )

    await clicarSair(usuario)
    const painel = await screen.findByRole('dialog', { name: /treino em andamento/i })
    await usuario.click(within(painel).getByRole('button', { name: /descartar e sair/i }))

    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('/alunos/treino/sessao')
      expect(sair).toHaveBeenCalledOnce()
    })
  })

  it('fechar o painel cancela o logout', async () => {
    get.mockResolvedValue({ data: SESSAO_ATIVA } as never)
    const usuario = userEvent.setup()
    const sair = vi.fn()
    renderizar(
      <AppShell itens={ITENS}>
        <div>conteúdo</div>
      </AppShell>,
      { usuario: ALUNO, sair },
    )

    await clicarSair(usuario)
    const painel = await screen.findByRole('dialog', { name: /treino em andamento/i })
    await usuario.click(within(painel).getByRole('button', { name: /fechar/i }))

    expect(screen.queryByRole('dialog', { name: /treino em andamento/i })).not.toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
    expect(sair).not.toHaveBeenCalled()
  })

  it('limpa a notificação ao finalizar e sair', async () => {
    get.mockResolvedValue({ data: SESSAO_ATIVA } as never)
    const usuario = userEvent.setup()
    renderizar(
      <AppShell itens={ITENS}>
        <div>conteúdo</div>
      </AppShell>,
      { usuario: ALUNO, sair: vi.fn() },
    )

    await clicarSair(usuario)
    const painel = await screen.findByRole('dialog', { name: /treino em andamento/i })
    await usuario.click(within(painel).getByRole('button', { name: /finalizar e sair/i }))

    await waitFor(() => expect(limparTreino).toHaveBeenCalled())
  })

  it('limpa a notificação ao descartar e sair', async () => {
    get.mockResolvedValue({ data: SESSAO_ATIVA } as never)
    const usuario = userEvent.setup()
    renderizar(
      <AppShell itens={ITENS}>
        <div>conteúdo</div>
      </AppShell>,
      { usuario: ALUNO, sair: vi.fn() },
    )

    await clicarSair(usuario)
    const painel = await screen.findByRole('dialog', { name: /treino em andamento/i })
    await usuario.click(within(painel).getByRole('button', { name: /descartar e sair/i }))

    await waitFor(() => expect(limparTreino).toHaveBeenCalled())
  })
})
