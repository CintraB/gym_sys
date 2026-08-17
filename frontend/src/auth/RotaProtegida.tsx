import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './useAuth'
import { Carregando } from '../components/ui/Carregando'
import type { Cargo } from '../types'

/**
 * Antes qualquer pessoa abria /professor direto e via a tela montada,
 * só as chamadas à API falhavam. Aqui a rota só renderiza com o cargo certo.
 */
export function RotaProtegida({ cargo, children }: { cargo: Cargo; children: ReactNode }) {
  const { usuario, carregando } = useAuth()
  const localizacao = useLocation()

  if (carregando) {
    return <Carregando tela />
  }

  if (!usuario) {
    return <Navigate to="/entrar" state={{ de: localizacao.pathname }} replace />
  }

  if (usuario.cargo !== cargo) {
    return <Navigate to={usuario.cargo === 'professor' ? '/professor' : '/aluno'} replace />
  }

  return <>{children}</>
}
