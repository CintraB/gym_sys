import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ALUNO, renderizar } from '../../test/utils'
import type { SessaoSerie } from '../../types'

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  mensagemDeErro: (_erro: unknown, padrao = 'Algo deu errado. Tente de novo.') => padrao,
  registrarExpiracaoDeSessao: vi.fn(),
  tokenArmazenado: { ler: () => null, gravar: vi.fn(), limpar: vi.fn() },
}))

const anunciarTreino = vi.fn()
const limparTreino = vi.fn()
vi.mock('../../lib/notificacoes', () => ({
  anunciarTreino: (...a: unknown[]) => anunciarTreino(...a),
  limparTreino: (...a: unknown[]) => limparTreino(...a),
  sincronizarTreino: vi.fn(),
}))

import { api } from '../../lib/api'
import MeuTreino from './MeuTreino'

const get = vi.mocked(api.get)
const post = vi.mocked(api.post)
const del = vi.mocked(api.delete)

const TREINO_UM_BLOCO = {
  treino: { id_treino: 1, criado_em: '2026-08-19T12:00:00Z', nome_professor: 'Cristhian Cintra' },
  blocos: [
    {
      id_bloco: 1,
      letra: 'A',
      nome: 'Peito e Tríceps',
      ordem: 1,
      exercicios: [
        {
          id: 1,
          id_exercicio: 1,
          numero_serie: 4,
          carga: 30,
          repeticoes: '10 a 15',
          observacao_ex_usuario: null,
          nome_exercicio: 'SUPINO SENTADO',
          tipo: 'PEITO',
        },
      ],
    },
  ],
  bloco_sugerido: 1,
}

const TREINO_DOIS_BLOCOS = {
  treino: { id_treino: 1, criado_em: '2026-08-19T12:00:00Z', nome_professor: 'Cristhian Cintra' },
  blocos: [
    ...TREINO_UM_BLOCO.blocos,
    {
      id_bloco: 2,
      letra: 'B',
      nome: 'Costas e Bíceps',
      ordem: 2,
      exercicios: [
        {
          id: 2,
          id_exercicio: 2,
          numero_serie: 3,
          carga: 20,
          repeticoes: '12',
          observacao_ex_usuario: null,
          nome_exercicio: 'PUXADOR FRENTE',
          tipo: 'COSTAS',
        },
      ],
    },
  ],
  bloco_sugerido: 1,
}

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
      series: [] as SessaoSerie[],
    },
  ],
}

const RESPOSTAS: Record<string, unknown> = {
  '/alunos/meutreino': TREINO_UM_BLOCO,
  '/alunos/treino/sessao': null,
  '/alunos/pedidotreino': null,
}

function responder(sobrepor: Record<string, unknown> = {}) {
  const respostas = { ...RESPOSTAS, ...sobrepor }
  get.mockImplementation((url: string) =>
    Promise.resolve({ data: url in respostas ? respostas[url] : [] } as never),
  )
}

describe('MeuTreino — confirmar antes de iniciar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    responder()
    post.mockResolvedValue({ data: SESSAO_ATIVA } as never)
  })

  it('pede confirmação antes de iniciar o treino', async () => {
    const usuario = userEvent.setup()
    renderizar(<MeuTreino />, { usuario: ALUNO })

    await screen.findByRole('button', { name: /iniciar treino/i }).then((botao) => usuario.click(botao))

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('só inicia o treino depois de confirmar', async () => {
    const usuario = userEvent.setup()
    renderizar(<MeuTreino />, { usuario: ALUNO })

    await screen.findByRole('button', { name: /iniciar treino/i }).then((botao) => usuario.click(botao))
    await usuario.click(await screen.findByRole('button', { name: /^iniciar$/i }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/alunos/treino/sessao', {})
    })
  })

  it('cancelar a confirmação não inicia o treino', async () => {
    const usuario = userEvent.setup()
    renderizar(<MeuTreino />, { usuario: ALUNO })

    await screen.findByRole('button', { name: /iniciar treino/i }).then((botao) => usuario.click(botao))
    const dialogo = await screen.findByRole('alertdialog')
    await usuario.click(within(dialogo).getByRole('button', { name: /^cancelar$/i }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('escolher um bloco fecha o painel de escolha antes de confirmar', async () => {
    const usuario = userEvent.setup()
    responder({ '/alunos/meutreino': TREINO_DOIS_BLOCOS })
    renderizar(<MeuTreino />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: /iniciar treino/i }))
    const painelDeBlocos = await screen.findByRole('dialog', { name: /qual treino hoje/i })
    await usuario.click(within(painelDeBlocos).getByText(/costas e bíceps/i))

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /qual treino hoje/i })).not.toBeInTheDocument()
  })
})

describe('MeuTreino — lançar séries na execução', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    post.mockResolvedValue({ data: {} } as never)
    del.mockResolvedValue({ data: {} } as never)
  })

  it('a seta abre o formulário de lançar série', async () => {
    const usuario = userEvent.setup()
    responder({ '/alunos/treino/sessao': SESSAO_ATIVA })
    renderizar(<MeuTreino />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: /lançar peso e repetição/i }))

    expect(screen.getByLabelText(/carga/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^adicionar$/i })).toBeInTheDocument()
  })

  it('lança uma série e mostra na lista depois de salvar', async () => {
    const usuario = userEvent.setup()
    // `responder()` congela o mapa de respostas na hora em que é chamada — para o
    // GET seguinte devolver algo diferente, o mock precisa ler de uma variável que
    // o teste ainda pode reatribuir, não do objeto que foi passado a `responder()`.
    let sessaoAtual: typeof SESSAO_ATIVA = SESSAO_ATIVA
    get.mockImplementation((url: string) => {
      if (url === '/alunos/treino/sessao') return Promise.resolve({ data: sessaoAtual } as never)
      if (url === '/alunos/meutreino') return Promise.resolve({ data: TREINO_UM_BLOCO } as never)
      if (url === '/alunos/pedidotreino') return Promise.resolve({ data: null } as never)
      return Promise.resolve({ data: [] } as never)
    })
    post.mockResolvedValue({
      data: { id: 1, carga: 20, repeticoes: '10', criado_em: '2026-08-27T10:00:00Z' },
    } as never)

    renderizar(<MeuTreino />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: /lançar peso e repetição/i }))
    await usuario.type(screen.getByLabelText(/carga/i), '20')
    await usuario.type(screen.getByLabelText(/repetições/i), '10')

    // depois de salvar, o próximo GET devolve a sessão já com a série lançada
    sessaoAtual = {
      ...SESSAO_ATIVA,
      exercicios: [
        {
          ...SESSAO_ATIVA.exercicios[0],
          series: [{ id: 1, carga: 20, repeticoes: '10', criado_em: '2026-08-27T10:00:00Z' }],
        },
      ],
    }

    await usuario.click(screen.getByRole('button', { name: /^adicionar$/i }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/alunos/treino/sessao/exercicio/1/serie', {
        carga: 20,
        repeticoes: '10',
      })
    })
    expect(await screen.findByText('20kg×10')).toBeInTheDocument()
  })

  it('não deixa adicionar sem preencher repetições', async () => {
    const usuario = userEvent.setup()
    responder({ '/alunos/treino/sessao': SESSAO_ATIVA })
    renderizar(<MeuTreino />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: /lançar peso e repetição/i }))

    expect(screen.getByRole('button', { name: /^adicionar$/i })).toBeDisabled()
  })

  it('remove um lançamento já feito', async () => {
    const usuario = userEvent.setup()
    let sessaoAtual: typeof SESSAO_ATIVA = {
      ...SESSAO_ATIVA,
      exercicios: [
        {
          ...SESSAO_ATIVA.exercicios[0],
          series: [{ id: 9, carga: 20, repeticoes: '10', criado_em: '2026-08-27T10:00:00Z' }],
        },
      ],
    }
    get.mockImplementation((url: string) => {
      if (url === '/alunos/treino/sessao') return Promise.resolve({ data: sessaoAtual } as never)
      if (url === '/alunos/meutreino') return Promise.resolve({ data: TREINO_UM_BLOCO } as never)
      if (url === '/alunos/pedidotreino') return Promise.resolve({ data: null } as never)
      return Promise.resolve({ data: [] } as never)
    })

    renderizar(<MeuTreino />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: /lançar peso e repetição/i }))
    expect(await screen.findByText('20kg×10')).toBeInTheDocument()

    sessaoAtual = SESSAO_ATIVA
    await usuario.click(screen.getByRole('button', { name: /remover este lançamento/i }))

    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('/alunos/treino/sessao/exercicio/1/serie/9')
    })
  })
})

describe('MeuTreino — confirmar antes de descartar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    responder({ '/alunos/treino/sessao': SESSAO_ATIVA })
    del.mockResolvedValue({ data: {} } as never)
  })

  async function abrirPainelDeDescarte() {
    const usuario = userEvent.setup()
    renderizar(<MeuTreino />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: /finalizar treino/i }))
    await usuario.click(await screen.findByRole('button', { name: /descartar treino/i }))
    return usuario
  }

  it('pede confirmação antes de descartar o treino', async () => {
    await abrirPainelDeDescarte()

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(del).not.toHaveBeenCalled()
  })

  it('só descarta o treino depois de confirmar', async () => {
    const usuario = await abrirPainelDeDescarte()
    const dialogo = await screen.findByRole('alertdialog')
    await usuario.click(within(dialogo).getByRole('button', { name: /^descartar$/i }))

    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('/alunos/treino/sessao')
    })
  })

  it('cancelar a confirmação não descarta o treino', async () => {
    const usuario = await abrirPainelDeDescarte()
    const dialogo = await screen.findByRole('alertdialog')
    await usuario.click(within(dialogo).getByRole('button', { name: /^cancelar$/i }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(del).not.toHaveBeenCalled()
  })
})

describe('MeuTreino — observação e calorias ao finalizar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    responder({ '/alunos/treino/sessao': SESSAO_ATIVA })
    post.mockResolvedValue({
      data: { sessao: SESSAO_ATIVA.sessao, exercicios: SESSAO_ATIVA.exercicios },
    } as never)
  })

  it('finaliza com observação e calorias preenchidas', async () => {
    const usuario = userEvent.setup()
    renderizar(<MeuTreino />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: /finalizar treino/i }))
    await usuario.type(await screen.findByLabelText(/observação/i), 'rendeu pouco')
    await usuario.type(screen.getByLabelText(/calorias/i), '350')
    await usuario.click(screen.getByRole('button', { name: /finalizar e salvar/i }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/alunos/treino/sessao/finalizar', {
        observacao: 'rendeu pouco',
        calorias: 350,
      })
    })
  })

  it('finaliza sem observação nem calorias manda corpo vazio', async () => {
    const usuario = userEvent.setup()
    renderizar(<MeuTreino />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: /finalizar treino/i }))
    await usuario.click(await screen.findByRole('button', { name: /finalizar e salvar/i }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/alunos/treino/sessao/finalizar', {})
    })
  })
})

describe('MeuTreino — barra de notificação', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('anuncia o treino ao iniciar', async () => {
    responder()
    // A sessão criada é o que vai para a notificação, então a resposta do POST
    // precisa parecer uma: com { data: {} } o teste passaria sem provar nada.
    post.mockResolvedValue({ data: SESSAO_ATIVA } as never)
    const usuario = userEvent.setup()
    renderizar(<MeuTreino />, { usuario: ALUNO })

    await screen
      .findByRole('button', { name: /iniciar treino/i })
      .then((botao) => usuario.click(botao))
    await usuario.click(await screen.findByRole('button', { name: /^iniciar$/i }))

    await waitFor(() => expect(anunciarTreino).toHaveBeenCalledWith(SESSAO_ATIVA))
  })

  it('limpa a notificação ao finalizar', async () => {
    responder({ '/alunos/treino/sessao': SESSAO_ATIVA })
    post.mockResolvedValue({
      data: { sessao: SESSAO_ATIVA.sessao, exercicios: SESSAO_ATIVA.exercicios },
    } as never)
    const usuario = userEvent.setup()
    renderizar(<MeuTreino />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: /finalizar treino/i }))
    await usuario.click(screen.getByRole('button', { name: /finalizar e salvar/i }))

    await waitFor(() => expect(limparTreino).toHaveBeenCalled())
  })

  it('limpa a notificação ao descartar', async () => {
    responder({ '/alunos/treino/sessao': SESSAO_ATIVA })
    del.mockResolvedValue({ data: {} } as never)
    const usuario = userEvent.setup()
    renderizar(<MeuTreino />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: /finalizar treino/i }))
    await usuario.click(await screen.findByRole('button', { name: /descartar treino/i }))
    const dialogo = await screen.findByRole('alertdialog')
    await usuario.click(within(dialogo).getByRole('button', { name: /^descartar$/i }))

    await waitFor(() => expect(limparTreino).toHaveBeenCalled())
  })
})
