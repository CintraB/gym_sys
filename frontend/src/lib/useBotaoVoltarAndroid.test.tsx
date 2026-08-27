import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useBotaoVoltarAndroid } from './useBotaoVoltarAndroid'

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }))

vi.mock('react-router-dom', async (importOriginal) => {
  const real = await importOriginal<typeof import('react-router-dom')>()
  return { ...real, useNavigate: () => navigateMock }
})

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}))

const addListener = vi.fn()
const exitApp = vi.fn()
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (evento: string, callback: () => void) => addListener(evento, callback),
    exitApp: () => exitApp(),
  },
}))

function Harness() {
  const { avisoSaida } = useBotaoVoltarAndroid()
  return avisoSaida ? <p>Toque voltar de novo para sair</p> : null
}

function renderizarEm(rota: string) {
  return render(
    <MemoryRouter
      initialEntries={[rota]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/aluno" element={<Harness />} />
        <Route path="/aluno/historico" element={<Harness />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** Pega o callback que o hook registrou no evento 'backButton'. */
function callbackDoBotaoVoltar() {
  const chamada = addListener.mock.calls.find(([evento]) => evento === 'backButton')
  if (!chamada) throw new Error('backButton não foi registrado')
  return chamada[1] as () => void
}

describe('useBotaoVoltarAndroid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    addListener.mockResolvedValue({ remove: vi.fn() })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fora da raiz, volta uma tela em vez de avisar', () => {
    renderizarEm('/aluno/historico')

    act(() => callbackDoBotaoVoltar()())

    expect(navigateMock).toHaveBeenCalledWith(-1)
    expect(exitApp).not.toHaveBeenCalled()
    expect(screen.queryByText(/toque voltar de novo/i)).not.toBeInTheDocument()
  })

  it('na raiz, primeiro toque só avisa', () => {
    renderizarEm('/aluno')

    act(() => callbackDoBotaoVoltar()())

    expect(screen.getByText(/toque voltar de novo/i)).toBeInTheDocument()
    expect(exitApp).not.toHaveBeenCalled()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('na raiz, segundo toque logo em seguida fecha o app', () => {
    renderizarEm('/aluno')

    const backButton = callbackDoBotaoVoltar()
    act(() => backButton())
    act(() => backButton())

    expect(exitApp).toHaveBeenCalledOnce()
  })
})
