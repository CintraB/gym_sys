import { createContext } from 'react'
import type { Usuario } from '../types'

export interface EstadoAuth {
  usuario: Usuario | null
  carregando: boolean
  entrar: (cpf: string, senha: string) => Promise<Usuario>
  sair: () => void
}

// Fica em arquivo próprio para que o AuthProvider exporte só o componente —
// exportar contexto e componente do mesmo módulo quebra o fast refresh.
export const AuthContext = createContext<EstadoAuth | null>(null)
