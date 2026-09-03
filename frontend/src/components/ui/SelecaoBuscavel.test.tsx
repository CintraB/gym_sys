import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SelecaoBuscavel, type OpcaoBuscavel } from './SelecaoBuscavel'

const EXERCICIOS: OpcaoBuscavel[] = [
  { valor: 1, texto: 'SUPINO RETO', grupo: 'PEITO' },
  { valor: 2, texto: 'SUPINO INCLINADO', grupo: 'PEITO' },
  { valor: 3, texto: 'ROSCA DIRETA', grupo: 'BÍCEPS' },
  { valor: 4, texto: 'TRÍCEPS TESTA', grupo: 'TRÍCEPS' },
]

function montar(props: Partial<Parameters<typeof SelecaoBuscavel>[0]> = {}) {
  const aoEscolher = vi.fn()
  render(
    <SelecaoBuscavel
      rotulo="Exercício"
      valor=""
      aoEscolher={aoEscolher}
      opcoes={EXERCICIOS}
      placeholder="Selecione o exercício"
      substantivo="exercício"
      {...props}
    />,
  )
  return { aoEscolher, usuario: userEvent.setup() }
}

describe('SelecaoBuscavel', () => {
  it('mostra o texto da opção escolhida, não o valor', () => {
    montar({ valor: 3 })
    expect(screen.getByRole('combobox', { name: 'Exercício' })).toHaveValue('ROSCA DIRETA')
  })

  it('só abre a lista depois do primeiro toque', async () => {
    const { usuario } = montar()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('combobox', { name: 'Exercício' }))

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(4)
  })

  it('agrupa as opções pelo grupo informado', async () => {
    const { usuario } = montar()
    await usuario.click(screen.getByRole('combobox', { name: 'Exercício' }))

    expect(screen.getByRole('group', { name: 'PEITO' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'BÍCEPS' })).toBeInTheDocument()
  })

  it('filtra pelo trecho digitado', async () => {
    const { usuario } = montar()
    await usuario.type(screen.getByRole('combobox', { name: 'Exercício' }), 'supi')

    const opcoes = screen.getAllByRole('option')
    expect(opcoes).toHaveLength(2)
    expect(opcoes[0]).toHaveTextContent('SUPINO RETO')
  })

  it('acha o nome acentuado mesmo digitado sem acento', async () => {
    const { usuario } = montar()
    await usuario.type(screen.getByRole('combobox', { name: 'Exercício' }), 'triceps')

    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option')).toHaveTextContent('TRÍCEPS TESTA')
  })

  it('conta quantas sobraram do total enquanto filtra', async () => {
    const { usuario } = montar()
    await usuario.type(screen.getByRole('combobox', { name: 'Exercício' }), 'supi')

    expect(screen.getByText('2 de 4')).toBeInTheDocument()
  })

  it('avisa quando nada casa com o que foi digitado', async () => {
    const { usuario } = montar()
    await usuario.type(screen.getByRole('combobox', { name: 'Exercício' }), 'agachamento')

    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(screen.getByText('Nenhum exercício encontrado')).toBeInTheDocument()
  })

  it('devolve o valor da opção clicada', async () => {
    const { usuario, aoEscolher } = montar()
    await usuario.click(screen.getByRole('combobox', { name: 'Exercício' }))
    await usuario.click(screen.getByRole('option', { name: 'ROSCA DIRETA' }))

    expect(aoEscolher).toHaveBeenCalledWith(3)
  })

  it('fecha a lista depois de escolher', async () => {
    const { usuario } = montar()
    await usuario.click(screen.getByRole('combobox', { name: 'Exercício' }))
    await usuario.click(screen.getByRole('option', { name: 'ROSCA DIRETA' }))

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('Enter escolhe o primeiro filtrado, sem precisar de seta', async () => {
    const { usuario, aoEscolher } = montar()
    await usuario.type(screen.getByRole('combobox', { name: 'Exercício' }), 'rosca')
    await usuario.keyboard('{Enter}')

    expect(aoEscolher).toHaveBeenCalledWith(3)
  })

  it('as setas andam a partir do primeiro item, que já abre ativo', async () => {
    const { usuario, aoEscolher } = montar()
    const campo = screen.getByRole('combobox', { name: 'Exercício' })
    await usuario.click(campo)
    await usuario.keyboard('{ArrowDown}{Enter}')

    expect(aoEscolher).toHaveBeenCalledWith(2)
  })

  it('a seta para cima dá a volta pelo fim da lista', async () => {
    const { usuario, aoEscolher } = montar()
    await usuario.click(screen.getByRole('combobox', { name: 'Exercício' }))
    await usuario.keyboard('{ArrowUp}{Enter}')

    expect(aoEscolher).toHaveBeenCalledWith(4)
  })

  it('Esc fecha e devolve o texto que estava lá antes', async () => {
    const { usuario, aoEscolher } = montar({ valor: 1 })
    const campo = screen.getByRole('combobox', { name: 'Exercício' })
    await usuario.type(campo, 'rosca')
    await usuario.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(campo).toHaveValue('SUPINO RETO')
    expect(aoEscolher).not.toHaveBeenCalled()
  })

  it('o botão de limpar desfaz a escolha', async () => {
    const { usuario, aoEscolher } = montar({ valor: 1 })
    await usuario.click(screen.getByRole('button', { name: 'Limpar' }))

    expect(aoEscolher).toHaveBeenCalledWith('')
  })

  it('não oferece limpar quando não há nada escolhido', () => {
    montar()
    expect(screen.queryByRole('button', { name: 'Limpar' })).not.toBeInTheDocument()
  })
})
