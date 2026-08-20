import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { ALUNO, PROFESSOR, renderizar } from '../test/utils'

// Único ponto de saída HTTP do app — é regra do projeto que nenhuma tela monte
// URL por conta própria, e é o que torna este mock suficiente.
vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  mensagemDeErro: (_erro: unknown, padrao = 'Algo deu errado. Tente de novo.') => padrao,
  registrarExpiracaoDeSessao: vi.fn(),
  tokenArmazenado: { ler: () => null, gravar: vi.fn(), limpar: vi.fn() },
}))

import { api } from '../lib/api'
import Login from './Login'
import Dashboard from './professor/Dashboard'
import Alunos from './professor/Alunos'
import Frequencia from './professor/Frequencia'
import MontarTreino from './professor/MontarTreino'
import Pedidos from './professor/Pedidos'
import MeuTreino from './aluno/MeuTreino'
import Historico from './aluno/Historico'
import Perfil from './aluno/Perfil'

const get = vi.mocked(api.get)

const TREINO = {
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

/**
 * Resposta por rota, com dado de verdade em vez de lista vazia.
 *
 * O caminho que quebra é o que renderiza conteúdo: uma tela que só mostra o
 * estado vazio não exercita quase nada do JSX, e foi justamente numa tela cheia
 * que a tela preta apareceu.
 */
const RESPOSTAS: Record<string, unknown> = {
  '/professores/resumo': {
    alunos_ativos: 3,
    alunos_inativos: 1,
    pedidos_abertos: 1,
    treinos_ativos: 2,
  },
  '/professores/treino/pedidos': [
    {
      id_pedido: 1,
      id_aluno: 2,
      observacao: 'Quero evitar agachamento livre.',
      criado_em: '2026-08-19T10:00:00Z',
      nome_aluno: 'Ana Souza',
      cpf: '22222222222',
    },
  ],
  '/professores/alunos': [
    {
      id: 2,
      nome: 'Ana Souza',
      cpf: '22222222222',
      email: 'ana@teste.com',
      titulo: '222222222222',
      aluno: true,
      professor: false,
      ativo: true,
      ultima_sessao: '2026-08-18T12:00:00Z',
    },
  ],
  '/professores/exercicios': [
    { id_exercicio: 1, nome_exercicio: 'SUPINO SENTADO', tipo: 'PEITO' },
  ],
  '/professores/aluno/2/sessoes': {
    aluno: { id: 2, nome: 'Ana Souza' },
    ultimos30dias: { sessoes: 4, media_duracao_segundos: 3600, ultima: '2026-08-18T12:00:00Z' },
    sessoes: [],
  },
  '/professores/aluno/2/treino': TREINO,
  '/alunos/meutreino': TREINO,
  '/alunos/treino/sessao': null,
  '/alunos/pedidotreino': null,
  '/alunos/sessoes': [
    {
      id_sessao: 1,
      iniciado_em: '2026-08-18T12:00:00Z',
      finalizado_em: '2026-08-18T13:00:00Z',
      duracao_segundos: 3600,
      nome_professor: 'Cristhian Cintra',
      bloco_letra: 'A',
      bloco_nome: 'Peito e Tríceps',
      total_exercicios: 1,
      concluidos: 1,
    },
  ],
}

function responder() {
  get.mockImplementation((url: string) =>
    Promise.resolve({ data: url in RESPOSTAS ? RESPOSTAS[url] : [] } as never),
  )
}

/**
 * Cada página declara como se reconhece na tela.
 *
 * Onde o título é uma palavra genérica, a âncora é o heading: "Perfil" e
 * "Alunos" também aparecem como rótulo de campo e como link de navegação, e um
 * getByText pegaria mais de um. Afrouxar a regex para escapar disso passaria a
 * casar com qualquer coisa e não provaria render nenhum.
 */
const PAGINAS = [
  {
    nome: 'Login',
    elemento: <Login />,
    usuario: null,
    encontrar: () => screen.findByText(/entre para ver seus treinos/i),
  },
  {
    nome: 'Dashboard',
    elemento: <Dashboard />,
    usuario: PROFESSOR,
    encontrar: () => screen.findByRole('heading', { name: /olá, cristhian/i }),
  },
  {
    nome: 'Alunos',
    elemento: <Alunos />,
    usuario: PROFESSOR,
    // Conteúdo vindo da API, não o título: prova que a lista renderizou.
    encontrar: () => screen.findByText(/ana souza/i),
  },
  {
    nome: 'MontarTreino',
    elemento: <MontarTreino />,
    usuario: PROFESSOR,
    encontrar: () => screen.findByRole('heading', { name: /montar treino/i }),
  },
  {
    nome: 'Pedidos',
    elemento: <Pedidos />,
    usuario: PROFESSOR,
    encontrar: () => screen.findByText(/quero evitar agachamento livre/i),
  },
  {
    nome: 'MeuTreino',
    elemento: <MeuTreino />,
    usuario: ALUNO,
    encontrar: () => screen.findByRole('heading', { name: /^meu treino$/i }),
  },
  {
    nome: 'Historico',
    elemento: <Historico />,
    usuario: ALUNO,
    encontrar: () => screen.findByRole('heading', { name: /^histórico$/i }),
  },
  {
    nome: 'Perfil',
    elemento: <Perfil />,
    usuario: ALUNO,
    encontrar: () => screen.findByRole('heading', { name: /^perfil$/i }),
  },
]

describe('smoke render das páginas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    responder()
  })

  // O bug que motivou esta suíte: trocar de área deixava a tela preta, e o
  // build passava. Nada renderizava componente para acusar.
  it.each(PAGINAS)('$nome monta sem quebrar', async ({ elemento, usuario, encontrar }) => {
    renderizar(elemento, { usuario })
    expect(await encontrar()).toBeInTheDocument()
  })

  // Frequencia lê o id da URL, então precisa do padrão de rota casando.
  it('Frequencia monta sem quebrar', async () => {
    renderizar(<Frequencia />, {
      usuario: PROFESSOR,
      rota: '/professor/alunos/2/frequencia',
      caminho: '/professor/alunos/:id/frequencia',
    })
    expect(await screen.findByText(/frequência nos últimos 30 dias/i)).toBeInTheDocument()
  })
})

describe('falha de requisição', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Antes do useRequisicao, a falha ia para o console e a tela ficava em
  // branco. Esta é a asserção que garante que isso não volta.
  it.each([
    { nome: 'Alunos', elemento: <Alunos />, usuario: PROFESSOR },
    { nome: 'Pedidos', elemento: <Pedidos />, usuario: PROFESSOR },
    { nome: 'Historico', elemento: <Historico />, usuario: ALUNO },
  ])('$nome mostra o erro em vez de tela em branco', async ({ elemento, usuario }) => {
    get.mockRejectedValue(new Error('rede caiu'))

    const { container } = renderizar(elemento, { usuario })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(container.textContent?.trim()).not.toBe('')
  })
})
