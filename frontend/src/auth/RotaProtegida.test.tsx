import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { RotaProtegida } from './RotaProtegida'
import { ALUNO, PROFESSOR, renderizar } from '../test/utils'

const Protegida = ({ cargo }: { cargo: 'professor' | 'aluno' }) => (
  <Routes>
    <Route
      path="/professor"
      element={
        <RotaProtegida cargo={cargo}>
          <p>área do professor</p>
        </RotaProtegida>
      }
    />
    <Route path="/aluno" element={<p>área do aluno</p>} />
    <Route path="/entrar" element={<p>tela de login</p>} />
  </Routes>
)

describe('RotaProtegida', () => {
  it('espera a sessão resolver antes de decidir', () => {
    renderizar(<Protegida cargo="professor" />, {
      rota: '/professor',
      usuario: null,
      carregando: true,
    })

    // Redirecionar durante o carregamento jogaria para o login quem só
    // ainda não teve o token revalidado contra /me.
    expect(screen.queryByText('tela de login')).not.toBeInTheDocument()
    expect(screen.queryByText('área do professor')).not.toBeInTheDocument()
  })

  it('manda para o login quem não está autenticado', () => {
    renderizar(<Protegida cargo="professor" />, { rota: '/professor', usuario: null })
    expect(screen.getByText('tela de login')).toBeInTheDocument()
  })

  it('deixa passar quem tem o perfil', () => {
    renderizar(<Protegida cargo="professor" />, { rota: '/professor', usuario: PROFESSOR })
    expect(screen.getByText('área do professor')).toBeInTheDocument()
  })

  it('desvia para a própria área quem tem o perfil errado', () => {
    renderizar(<Protegida cargo="professor" />, { rota: '/professor', usuario: ALUNO })
    expect(screen.getByText('área do aluno')).toBeInTheDocument()
  })

  // A checagem é pela capacidade, não pelo cargo principal: quem dá aula e
  // também treina precisa alcançar as duas áreas.
  it('deixa passar quem acumula os dois perfis', () => {
    const dosDois = { ...ALUNO, perfis: { aluno: true, professor: true } }
    renderizar(<Protegida cargo="professor" />, { rota: '/professor', usuario: dosDois })
    expect(screen.getByText('área do professor')).toBeInTheDocument()
  })
})
