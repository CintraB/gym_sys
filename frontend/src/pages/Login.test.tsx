import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import Login from './Login'
import { ADMIN, renderizar } from '../test/utils'
import { salvarUltimaRota } from '../auth/areas'

const ComRotas = () => (
  <Routes>
    <Route path="/entrar" element={<Login />} />
    <Route path="/admin" element={<p>área do admin</p>} />
    <Route path="/aluno/historico" element={<p>histórico do aluno</p>} />
  </Routes>
)

describe('Login — para onde manda quem já está autenticado', () => {
  it('sem rota salva, manda para a área do cargo principal', () => {
    renderizar(<ComRotas />, { rota: '/entrar', usuario: ADMIN })
    expect(screen.getByText('área do admin')).toBeInTheDocument()
  })

  it('com rota salva alcançável, retoma nela em vez da área do cargo principal', () => {
    salvarUltimaRota('/aluno/historico')
    renderizar(<ComRotas />, { rota: '/entrar', usuario: ADMIN })
    expect(screen.getByText('histórico do aluno')).toBeInTheDocument()
  })
})
