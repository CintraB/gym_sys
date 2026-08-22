// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { paraPosicionais } from './parametros.js'

describe('parametros numerados viram posicionais', () => {
  it('troca ?1 por ? na ordem de aparicao', () => {
    const r = paraPosicionais('SELECT * FROM t WHERE a = ?1 AND b = ?2', ['x', 'y'])

    expect(r.sql).toBe('SELECT * FROM t WHERE a = ? AND b = ?')
    expect(r.valores).toEqual(['x', 'y'])
  })

  // O caso que motiva o arquivo: o mesmo parametro duas vezes na consulta, que
  // e como a busca por cpf OU titulo e escrita.
  it('duplica o valor quando o parametro se repete', () => {
    const r = paraPosicionais("WHERE (?1 <> '' AND cpf = ?1) OR (?2 <> '' AND titulo = ?2)", [
      '111',
      '',
    ])

    expect(r.sql).toBe("WHERE (? <> '' AND cpf = ?) OR (? <> '' AND titulo = ?)")
    expect(r.valores).toEqual(['111', '111', '', ''])
  })

  // A ordem no SQL nao e necessariamente a do array: o projeto monta consultas
  // por partes, e o ?2 pode aparecer antes do ?1.
  it('segue a ordem do SQL, e nao a do array', () => {
    const r = paraPosicionais('SET b = ?2, a = ?1', ['valorA', 'valorB'])

    expect(r.sql).toBe('SET b = ?, a = ?')
    expect(r.valores).toEqual(['valorB', 'valorA'])
  })

  it('numero de dois digitos nao e confundido com um', () => {
    const valores = Array.from({ length: 12 }, (_, i) => `v${i + 1}`)
    const r = paraPosicionais('VALUES (?1, ?10, ?11, ?12, ?2)', valores)

    expect(r.sql).toBe('VALUES (?, ?, ?, ?, ?)')
    expect(r.valores).toEqual(['v1', 'v10', 'v11', 'v12', 'v2'])
  })

  it('sem parametro nenhum, passa igual', () => {
    const r = paraPosicionais('SELECT 1', [])

    expect(r.sql).toBe('SELECT 1')
    expect(r.valores).toEqual([])
  })

  it('parametro sem valor correspondente vira nulo, e nao undefined', () => {
    // undefined nao pode ser ligado a parametro do SQLite; nulo pode.
    const r = paraPosicionais('WHERE a = ?1 AND b = ?2', ['x'])

    expect(r.valores).toEqual(['x', null])
  })

  it('valor falso nao e trocado por nulo', () => {
    // 0, '' e false sao valores legitimos no schema: carga 0, repeticoes vazias
    // no cardio, e as flags de perfil.
    const r = paraPosicionais('VALUES (?1, ?2, ?3)', [0, '', false])

    expect(r.valores).toEqual([0, '', false])
  })
})
