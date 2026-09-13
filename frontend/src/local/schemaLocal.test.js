// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { abrirBancoDeTeste } from './bancoDeTeste.js'
import { semear, SEMENTE_PUBLICA } from './semear.js'

describe('schema local do aparelho', () => {
  it('cria a tabela de envios, que o servidor nao tem', async () => {
    const bd = await abrirBancoDeTeste()
    await semear(bd, SEMENTE_PUBLICA)

    const { rows } = await bd.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sincronizacao_envio'",
    )
    expect(rows).toHaveLength(1)
  })

  it('guarda o uuid enviado e nao aceita o mesmo duas vezes', async () => {
    const bd = await abrirBancoDeTeste()
    await semear(bd, SEMENTE_PUBLICA)

    const uuid = '11111111-2222-3333-4444-555555555555'
    await bd.query('INSERT INTO sincronizacao_envio (uuid, enviado_em) VALUES ($1, $2)', [
      uuid,
      new Date().toISOString(),
    ])

    await expect(
      bd.query('INSERT INTO sincronizacao_envio (uuid, enviado_em) VALUES ($1, $2)', [
        uuid,
        new Date().toISOString(),
      ]),
    ).rejects.toThrow()
  })

  it('abrir duas vezes nao quebra', async () => {
    const bd = await abrirBancoDeTeste()
    await semear(bd, SEMENTE_PUBLICA)
    await expect(semear(bd, SEMENTE_PUBLICA)).resolves.not.toThrow()
  })
})
