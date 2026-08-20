import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCronometro } from './useCronometro'

describe('useCronometro', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-19T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('já começa no tempo decorrido desde o início', () => {
    const { result } = renderHook(() => useCronometro('2026-08-19T11:59:30Z'))
    expect(result.current).toBe(30)
  })

  it('zera quando não há início', () => {
    const { result } = renderHook(() => useCronometro(null))
    expect(result.current).toBe(0)
  })

  // O tempo é sempre derivado do timestamp do servidor. Um contador local
  // atrasaria com a aba em segundo plano, quando o navegador estrangula os
  // timers — e o aluno veria menos tempo do que treinou.
  it('acompanha o relógio, não a quantidade de ticks', () => {
    const { result } = renderHook(() => useCronometro('2026-08-19T12:00:00Z'))
    expect(result.current).toBe(0)

    act(() => {
      // Um único tick de intervalo, mas dez minutos de relógio: é o que
      // acontece quando a aba fica em segundo plano e o navegador estrangula
      // os timers. O salto é de 9min59 porque advanceTimersByTime também move
      // o relógio falso, e o segundo que falta vem dele.
      vi.setSystemTime(new Date('2026-08-19T12:09:59Z'))
      vi.advanceTimersByTime(1000)
    })

    expect(result.current).toBe(600)
  })
})
