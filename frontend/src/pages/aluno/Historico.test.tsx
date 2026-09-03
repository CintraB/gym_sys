import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ALUNO, renderizar } from '../../test/utils'

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  mensagemDeErro: (_erro: unknown, padrao = 'Algo deu errado. Tente de novo.') => padrao,
  registrarExpiracaoDeSessao: vi.fn(),
  tokenArmazenado: { ler: () => null, gravar: vi.fn(), limpar: vi.fn() },
}))

import { api } from '../../lib/api'
import Historico from './Historico'

const get = vi.mocked(api.get)

const LISTA = [
  {
    id_sessao: 1,
    iniciado_em: '2026-08-27T10:00:00Z',
    finalizado_em: '2026-08-27T10:30:00Z',
    duracao_segundos: 1800,
    nome_professor: 'Cristhian Cintra',
    bloco_letra: 'A',
    bloco_nome: 'Peito e Tríceps',
    total_exercicios: 2,
    concluidos: 2,
  },
]

const DETALHE = {
  sessao: {
    id_sessao: 1,
    id_treino: 1,
    id_bloco: 1,
    id_aluno: 2,
    iniciado_em: '2026-08-27T10:00:00Z',
    finalizado_em: '2026-08-27T10:30:00Z',
    duracao_segundos: 1800,
    nome_professor: 'Cristhian Cintra',
    bloco_letra: 'A',
    bloco_nome: 'Peito e Tríceps',
    observacao: 'hoje rendeu pouco',
    calorias: 350,
  },
  exercicios: [
    {
      id: 1,
      concluido: true,
      concluido_em: '2026-08-27T10:05:00Z',
      id_ex_usuario: 1,
      numero_serie: 4,
      repeticoes: '10',
      carga: 20,
      observacao_ex_usuario: null,
      nome_exercicio: 'SUPINO SENTADO',
      tipo: 'PEITO',
      series: [{ id: 1, carga: 20, repeticoes: '10', criado_em: '2026-08-27T10:05:00Z' }],
    },
    {
      id: 2,
      concluido: true,
      concluido_em: '2026-08-27T10:15:00Z',
      id_ex_usuario: 2,
      numero_serie: 3,
      repeticoes: '12',
      carga: 12,
      observacao_ex_usuario: null,
      nome_exercicio: 'CROSS OVER (CRUCIFIXO)',
      tipo: 'PEITO',
      series: [],
    },
  ],
}

function responder() {
  get.mockImplementation((url: string) => {
    if (url === '/alunos/sessoes') return Promise.resolve({ data: LISTA } as never)
    if (url === '/alunos/sessoes/1') return Promise.resolve({ data: DETALHE } as never)
    return Promise.resolve({ data: [] } as never)
  })
}

describe('Historico — detalhe da sessão', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    responder()
  })

  it('mostra observação e calorias da sessão', async () => {
    const usuario = userEvent.setup()
    renderizar(<Historico />, { usuario: ALUNO })

    await usuario.click(await screen.findByText(/27 de ago/i))

    expect(await screen.findByText('“hoje rendeu pouco”')).toBeInTheDocument()
    expect(screen.getByText(/350 kcal/i)).toBeInTheDocument()
  })

  it('mostra as séries lançadas por exercício', async () => {
    const usuario = userEvent.setup()
    renderizar(<Historico />, { usuario: ALUNO })

    await usuario.click(await screen.findByText(/27 de ago/i))

    expect(await screen.findByText('20kg×10')).toBeInTheDocument()
  })

  it('mostra a ordem real de execução e o tempo desde o exercício anterior', async () => {
    const usuario = userEvent.setup()
    renderizar(<Historico />, { usuario: ALUNO })

    await usuario.click(await screen.findByText(/27 de ago/i))

    // 1º exercício: 5 min depois do início; 2º: 10 min depois do 1º
    expect(await screen.findByText('1º')).toBeInTheDocument()
    expect(screen.getByText('5 min')).toBeInTheDocument()
    expect(screen.getByText('2º')).toBeInTheDocument()
    expect(screen.getByText('10 min')).toBeInTheDocument()
  })
})

/**
 * O histórico cresce para sempre — sem recorte, quem treina há um ano rola
 * meses para chegar no mês passado.
 */
describe('Historico — filtro de período', () => {
  const HOJE = new Date('2026-09-02T12:00:00Z')

  const TRES_SESSOES = [
    { ...LISTA[0], id_sessao: 1, iniciado_em: '2026-09-01T10:00:00Z', duracao_segundos: 1800 },
    // 44 dias atrás: fora de 30, dentro de 90
    { ...LISTA[0], id_sessao: 2, iniciado_em: '2026-07-20T10:00:00Z', duracao_segundos: 3600 },
    // muito antes: só aparece em "Tudo"
    { ...LISTA[0], id_sessao: 3, iniciado_em: '2026-01-10T10:00:00Z', duracao_segundos: 900 },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(HOJE)
    get.mockImplementation((url: string) => {
      if (url === '/alunos/sessoes') return Promise.resolve({ data: TRES_SESSOES } as never)
      return Promise.resolve({ data: [] } as never)
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('abre em "Tudo", sem esconder treino nenhum', async () => {
    renderizar(<Historico />, { usuario: ALUNO })

    expect(await screen.findByText(/1 de set/i)).toBeInTheDocument()
    expect(screen.getByText(/20 de jul/i)).toBeInTheDocument()
    expect(screen.getByText(/10 de jan/i)).toBeInTheDocument()
  })

  it('30 dias deixa só o que está dentro da janela', async () => {
    const usuario = userEvent.setup()
    renderizar(<Historico />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: '30 dias' }))

    expect(screen.getByText(/1 de set/i)).toBeInTheDocument()
    expect(screen.queryByText(/20 de jul/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/10 de jan/i)).not.toBeInTheDocument()
  })

  it('90 dias alcança o que 30 dias deixou de fora', async () => {
    const usuario = userEvent.setup()
    renderizar(<Historico />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: '90 dias' }))

    expect(screen.getByText(/20 de jul/i)).toBeInTheDocument()
    expect(screen.queryByText(/10 de jan/i)).not.toBeInTheDocument()
  })

  // Os cartões são lidos pelo rótulo, e não por getByText do número: "30 min"
  // também aparece na linha da sessão, e a busca solta pega os dois.
  const cartao = (rotulo: string) =>
    screen.getByText(rotulo).previousElementSibling?.textContent

  it('os totais contam o período escolhido, não o histórico inteiro', async () => {
    const usuario = userEvent.setup()
    renderizar(<Historico />, { usuario: ALUNO })

    // Tudo: 3 treinos, 1800+3600+900 = 6300s = 1h45
    await screen.findByText(/1 de set/i)
    expect(cartao('Treinos feitos')).toBe('3')
    expect(cartao('Tempo total')).toBe('1h45')

    await usuario.click(screen.getByRole('button', { name: '30 dias' }))

    expect(cartao('Treinos feitos')).toBe('1')
    expect(cartao('Tempo total')).toBe('30 min')
  })

  it('avisa quando o período escolhido não tem treino, sem sumir com os botões', async () => {
    const usuario = userEvent.setup()
    get.mockImplementation((url: string) => {
      if (url === '/alunos/sessoes') return Promise.resolve({ data: [TRES_SESSOES[2]] } as never)
      return Promise.resolve({ data: [] } as never)
    })
    renderizar(<Historico />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: '30 dias' }))

    expect(screen.getByText('Nenhum treino nesse período')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tudo' })).toBeInTheDocument()
  })
})
