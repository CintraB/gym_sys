import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './useAuth'
import { rotaDoCargo } from './areas'
import { Carregando } from '../components/ui/Carregando'
import type { Cargo } from '../types'

/**
 * Antes qualquer pessoa abria /professor direto e via a tela montada,
 * só as chamadas à API falhavam. Aqui a rota só renderiza com o perfil certo.
 *
 * A checagem é pela capacidade (`perfis`), não pelo cargo principal: quem é
 * professor e também aluno alcança as duas áreas.
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

  if (!usuario.perfis[cargo]) {
    return <Navigate to={rotaDoCargo(usuario.cargo)} replace />
  }

  return <>{children}</>
}
