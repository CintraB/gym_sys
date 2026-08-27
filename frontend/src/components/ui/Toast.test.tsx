import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Toast } from './Toast'

describe('Toast', () => {
  it('não renderiza nada sem mensagem', () => {
    const { container } = render(<Toast mensagem={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('mostra a mensagem quando ela existe', () => {
    render(<Toast mensagem="Toque voltar de novo para sair" />)
    expect(screen.getByText('Toque voltar de novo para sair')).toBeInTheDocument()
  })
})
