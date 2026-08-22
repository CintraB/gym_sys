import { describe, it, expect, beforeEach } from 'vitest'
import { db, configurarPool } from './banco.js'

describe('borda de banco do app', () => {
  beforeEach(() => configurarPool(null))

  it('delega query ao driver injetado', async () => {
    const chamadas = []
    configurarPool({
      query: async (sql, valores) => {
        chamadas.push([sql, valores])
        return { rows: [{ id: 1 }] }
      },
    })

    const resultado = await db.query('SELECT 1', [7])

    expect(resultado.rows).toEqual([{ id: 1 }])
    expect(chamadas).toEqual([['SELECT 1', [7]]])
  })

  it('delega connect, para as transacoes', async () => {
    const cliente = { query: async () => ({ rows: [] }), release: () => {} }
    configurarPool({ connect: async () => cliente })

    expect(await db.connect()).toBe(cliente)
  })

  // Sem driver, a mensagem precisa dizer o que fazer. O sintoma natural seria
  // "cannot read properties of null", que nao ajuda ninguem.
  //
  // Lanca de forma sincrona, e nao como promessa rejeitada, igual ao original
  // do backend — onde obterPool() tambem estoura na hora quando falta
  // configuracao. Dentro de um controller async isso vira rejeicao do mesmo
  // jeito, e o asyncHandler encaminha.
  it('sem driver, diz o que falta', () => {
    expect(() => db.query('SELECT 1')).toThrow(/configurarPool/)
    expect(() => db.connect()).toThrow(/configurarPool/)
  })

  // end() sem driver nao pode estourar: e chamado ao fechar o app, e nesse
  // ponto pode nao ter havido banco nenhum.
  it('end sem driver nao quebra', async () => {
    await expect(db.end()).resolves.toBeUndefined()
  })
})
