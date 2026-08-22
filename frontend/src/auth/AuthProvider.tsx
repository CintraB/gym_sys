import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, registrarExpiracaoDeSessao, tokenArmazenado } from '../lib/api'
import { somenteDigitos } from '../lib/formato'
import { AuthContext } from './contexto'
import type { Usuario } from '../types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [carregando, setCarregando] = useState(true)

  const sair = useCallback(() => {
    tokenArmazenado.limpar()
    setUsuario(null)
  }, [])

  // Na carga inicial o token é revalidado contra /me em vez de confiar num
  // objeto guardado no localStorage, que pode estar velho ou adulterado.
  useEffect(() => {
    registrarExpiracaoDeSessao(sair)

    if (!tokenArmazenado.ler()) {
      setCarregando(false)
      return
    }

    let cancelado = false
    api
      .get<Usuario>('/me')
      .then(({ data }) => {
        if (!cancelado) setUsuario(data)
      })
      .catch(() => {
        if (!cancelado) sair()
      })
      .finally(() => {
        if (!cancelado) setCarregando(false)
      })

    return () => {
      cancelado = true
    }
  }, [sair])

  const entrar = useCallback(async (cpf: string, senha: string) => {
    const { data } = await api.post<{ token: string; usuario: Usuario }>('/login', {
      cpf: somenteDigitos(cpf),
      senha,
    })
    tokenArmazenado.gravar(data.token)
    setUsuario(data.usuario)
    return data.usuario
  }, [])

  const atualizarUsuario = useCallback((dados: Partial<Usuario>) => {
    setUsuario((atual) => (atual ? { ...atual, ...dados } : atual))
  }, [])

  const valor = useMemo(
    () => ({ usuario, carregando, entrar, sair, atualizarUsuario }),
    [usuario, carregando, entrar, sair, atualizarUsuario],
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}
