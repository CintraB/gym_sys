import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebounce } from './useDebounce'

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('devolve o valor inicial de imediato', () => {
    const { result } = renderHook(() => useDebounce('a', 300))
    expect(result.current).toBe('a')
  })

  // Sem isso, a busca de alunos dispararia uma requisição por tecla.
  it('deixa passar só o último valor de uma rajada', () => {
    const { result, rerender } = renderHook(({ valor }) => useDebounce(valor, 300), {
      initialProps: { valor: 'a' },
    })

    rerender({ valor: 'an' })
    rerender({ valor: 'ana' })

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('ana')
  })

  // Este é o que cobre o clearTimeout da limpeza do efeito, e o de cima não:
  // lá as três teclas caem no mesmo instante virtual, então os timeouts órfãos
  // venceriam juntos e o último ainda seria o certo. Com tempo entre as teclas
  // a diferença aparece — sem o cancelamento, o prazo da primeira vence e a
  // busca volta para "a" com o usuário já tendo digitado "ab".
  it('cancela o valor anterior quando outra tecla chega antes do prazo', () => {
    const { result, rerender } = renderHook(({ valor }) => useDebounce(valor, 300), {
      initialProps: { valor: 'inicial' },
    })

    rerender({ valor: 'a' })
    act(() => {
      vi.advanceTimersByTime(200)
    })

    rerender({ valor: 'ab' })
    act(() => {
      // t=350: o prazo da primeira tecla já teria vencido, se não fosse cancelado.
      vi.advanceTimersByTime(150)
    })
    expect(result.current).toBe('inicial')

    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(result.current).toBe('ab')
  })
})
