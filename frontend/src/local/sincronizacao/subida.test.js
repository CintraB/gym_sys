// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { abrirBancoDeTeste } from '../bancoDeTeste.js'
import { semear, SEMENTE_PUBLICA } from '../semear.js'
import { ErroSincronizacao } from './cliente.js'
import { montarPacote, sessoesPendentes, subir } from './subida.js'

/** Uma sessão finalizada, com um exercício e duas séries. */
async function sessaoFinalizada(bd, { finalizada = true } = {}) {
  const { rows: fichas } = await bd.query(
    'SELECT id, id_treino, id_bloco, id_user FROM ex_usuario LIMIT 1',
  )
  const ficha = fichas[0]

  const { rows } = await bd.query(
    `INSERT INTO sessao_treino (id_treino, id_bloco, id_aluno, iniciado_em, finalizado_em,
                                duracao_segundos, observacao, calorias)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id_sessao`,
    [
      ficha.id_treino,
      ficha.id_bloco,
      ficha.id_user,
      '2026-09-13T10:00:00.000Z',
      finalizada ? '2026-09-13T11:00:00.000Z' : null,
      finalizada ? 3600 : null,
      'pesado',
      300,
    ],
  )
  const idSessao = rows[0].id_sessao

  const { rows: exercicios } = await bd.query(
    `INSERT INTO sessao_exercicio (id_sessao, id_ex_usuario, concluido, concluido_em)
     VALUES ($1, $2, TRUE, $3) RETURNING id`,
    [idSessao, ficha.id, '2026-09-13T10:30:00.000Z'],
  )
  for (const carga of [20, 25]) {
    await bd.query(
      'INSERT INTO sessao_serie (id_sessao_exercicio, carga, repeticoes) VALUES ($1, $2, $3)',
      [exercicios[0].id, carga, '10'],
    )
  }
  return idSessao
}

async function bancoComSessao(opcoes) {
  const bd = await abrirBancoDeTeste()
  await semear(bd, SEMENTE_PUBLICA)
  const idSessao = await sessaoFinalizada(bd, opcoes)
  return { bd, idSessao }
}

describe('subida', () => {
  it('so sessao finalizada entra na fila', async () => {
    const { bd } = await bancoComSessao({ finalizada: false })
    expect(await sessoesPendentes(bd)).toHaveLength(0)
  })

  it('o pacote leva a sessao inteira, com as series', async () => {
    const { bd, idSessao } = await bancoComSessao()
    const pacote = await montarPacote(bd, idSessao)

    expect(pacote.duracao_segundos).toBe(3600)
    expect(pacote.observacao).toBe('pesado')
    expect(pacote.exercicios).toHaveLength(1)
    expect(pacote.exercicios[0].series).toHaveLength(2)
    expect(pacote.exercicios[0].series.map((s) => s.carga)).toEqual([20, 25])
  })

  it('cada linha do pacote leva um uuid, e ele e gravado no aparelho', async () => {
    const { bd, idSessao } = await bancoComSessao()
    const pacote = await montarPacote(bd, idSessao)

    expect(pacote.uuid).toMatch(/^[0-9a-f-]{36}$/i)

    const { rows } = await bd.query('SELECT uuid FROM sessao_treino WHERE id_sessao = $1', [
      idSessao,
    ])
    expect(rows[0].uuid).toBe(pacote.uuid)
  })

  it('montar duas vezes devolve o MESMO uuid', async () => {
    const { bd, idSessao } = await bancoComSessao()
    const primeiro = await montarPacote(bd, idSessao)
    const segundo = await montarPacote(bd, idSessao)

    // Se o uuid mudasse a cada tentativa, a idempotência do servidor não valeria
    // nada: cada retentativa criaria uma sessão nova.
    expect(segundo.uuid).toBe(primeiro.uuid)
    expect(segundo.exercicios[0].uuid).toBe(primeiro.exercicios[0].uuid)
  })

  it('subiu: marca e nao tenta de novo', async () => {
    const { bd } = await bancoComSessao()
    const cliente = { rpc: vi.fn().mockResolvedValue({ id_sessao: 999, criada: true }) }

    const resultado = await subir(bd, cliente, { token: 'tok' })
    expect(resultado).toEqual({ enviadas: 1, repetidas: 0, falhas: 0, falhasDeRede: 0 })

    const segunda = await subir(bd, cliente, { token: 'tok' })
    expect(segunda.enviadas).toBe(0)
    expect(cliente.rpc).toHaveBeenCalledTimes(1)
  })

  it('o servidor dizer "ja existia" tambem marca — e o conserto da marca perdida', async () => {
    const { bd } = await bancoComSessao()
    const cliente = { rpc: vi.fn().mockResolvedValue({ id_sessao: 999, criada: false }) }

    const resultado = await subir(bd, cliente, { token: 'tok' })
    expect(resultado).toEqual({ enviadas: 0, repetidas: 1, falhas: 0, falhasDeRede: 0 })
    expect(await sessoesPendentes(bd)).toHaveLength(0)
  })

  it('falha de rede nao marca, e a sessao continua pendente', async () => {
    const { bd } = await bancoComSessao()
    const cliente = { rpc: vi.fn().mockRejectedValue(new ErroSincronizacao('rede', 'caiu')) }

    const resultado = await subir(bd, cliente, { token: 'tok' })
    expect(resultado.falhas).toBe(1)
    // Contada como falha de REDE: e o que diz ao motor que o aparelho esta
    // offline, e nao que aquela sessao tem problema.
    expect(resultado.falhasDeRede).toBe(1)
    expect(await sessoesPendentes(bd)).toHaveLength(1)
  })

  it('token vencido para tudo, em vez de repetir o 401 por sessao', async () => {
    const { bd } = await bancoComSessao()
    await sessaoFinalizada(bd)

    const cliente = {
      rpc: vi.fn().mockRejectedValue(new ErroSincronizacao('credencial', 'token velho')),
    }

    await expect(subir(bd, cliente, { token: 'velho' })).rejects.toMatchObject({
      tipo: 'credencial',
    })
    // Uma chamada só: o token vale para todas, insistir seria gastar rede à toa.
    expect(cliente.rpc).toHaveBeenCalledTimes(1)
  })

  it('uma sessao que falha nao impede as outras de subirem', async () => {
    const { bd } = await bancoComSessao()
    await sessaoFinalizada(bd)

    let chamada = 0
    const cliente = {
      rpc: vi.fn(async () => {
        chamada += 1
        if (chamada === 1) throw new ErroSincronizacao('servidor', 'caiu')
        return { id_sessao: 999, criada: true }
      }),
    }

    const resultado = await subir(bd, cliente, { token: 'tok' })
    expect(resultado).toEqual({ enviadas: 1, repetidas: 0, falhas: 1, falhasDeRede: 0 })
  })
})
