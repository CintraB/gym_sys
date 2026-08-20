import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../auth/contexto'
import type { Usuario } from '../types'

export const PROFESSOR: Usuario = {
  id: 1,
  nome: 'Cristhian Cintra',
  cpf: '11111111111',
  email: 'professor@teste.com',
  titulo: '111111111111',
  cargo: 'professor',
  perfis: { aluno: false, professor: true },
  ativo: true,
}

export const ALUNO: Usuario = {
  id: 2,
  nome: 'Ana Souza',
  cpf: '22222222222',
  email: 'ana@teste.com',
  titulo: '222222222222',
  cargo: 'aluno',
  perfis: { aluno: true, professor: false },
  ativo: true,
}

interface Opcoes {
  rota?: string
  /** Padrão de rota. Só é preciso para telas que leem useParams. */
  caminho?: string
  usuario?: Usuario | null
  carregando?: boolean
}

/**
 * Renderiza com router e sessão já resolvida.
 *
 * O contexto é injetado direto, sem o AuthProvider real, porque ele busca /me
 * na montagem — usá-lo obrigaria todo teste a esperar uma requisição que não
 * é o assunto dele.
 */
export function renderizar(
  ui: ReactElement,
  { rota = '/', caminho, usuario = PROFESSOR, carregando = false }: Opcoes = {},
) {
  const valor = {
    usuario,
    carregando,
    entrar: async () => usuario as Usuario,
    sair: () => {},
  }

  return render(
    <MemoryRouter initialEntries={[rota]}>
      <AuthContext.Provider value={valor}>
        {caminho ? (
          <Routes>
            <Route path={caminho} element={ui} />
          </Routes>
        ) : (
          ui
        )}
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}
