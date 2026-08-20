import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useRequisicao } from './useRequisicao'

describe('useRequisicao', () => {
  it('começa carregando e entrega os dados', async () => {
    const { result } = renderHook(() => useRequisicao(async () => ['a', 'b'], []))

    expect(result.current.carregando).toBe(true)
    expect(result.current.dados).toBeNull()

    await waitFor(() => expect(result.current.carregando).toBe(false))
    expect(result.current.dados).toEqual(['a', 'b'])
    expect(result.current.erro).toBeNull()
  })

  // O motivo do hook existir: antes cada tela fazia try/catch e engolia a
  // falha num console.error, deixando a tela em branco sem explicação.
  it('expõe a falha no estado, em vez de engoli-la', async () => {
    const { result } = renderHook(() =>
      useRequisicao(async () => {
        throw new Error('caiu')
      }, []),
    )

    await waitFor(() => expect(result.current.carregando).toBe(false))
    expect(result.current.erro).toBeTruthy()
    expect(result.current.dados).toBeNull()
  })

  it('recarregar refaz a busca', async () => {
    const buscar = vi.fn().mockResolvedValueOnce('primeiro').mockResolvedValueOnce('segundo')
    const { result } = renderHook(() => useRequisicao(buscar, []))

    await waitFor(() => expect(result.current.dados).toBe('primeiro'))

    await act(async () => {
      await result.current.recarregar()
    })

    expect(result.current.dados).toBe('segundo')
    expect(buscar).toHaveBeenCalledTimes(2)
  })

  it('definirDados altera sem nova requisição', async () => {
    const buscar = vi.fn().mockResolvedValue(['a'])
    const { result } = renderHook(() => useRequisicao(buscar, []))

    await waitFor(() => expect(result.current.dados).toEqual(['a']))

    act(() => {
      result.current.definirDados(['a', 'b'])
    })

    expect(result.current.dados).toEqual(['a', 'b'])
    expect(buscar).toHaveBeenCalledTimes(1)
  })
})
