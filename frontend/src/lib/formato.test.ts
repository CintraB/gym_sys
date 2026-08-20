import { describe, expect, it } from 'vitest'
import { mascararCpf } from './formato'

describe('mascararCpf', () => {
  it('formata onze dígitos', () => {
    expect(mascararCpf('12345678901')).toBe('123.456.789-01')
  })
})
