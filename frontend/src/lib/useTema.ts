import { useCallback, useEffect, useState } from 'react'
import { aplicarTema, lerTema, type Tema } from './tema'

export function useTema() {
  const [tema, setTemaEstado] = useState<Tema>(() => lerTema())

  useEffect(() => {
    aplicarTema(tema)
  }, [tema])

  // No modo "sistema", a cor da barra de status precisa acompanhar quando o
  // aparelho troca de claro para escuro com o app aberto.
  useEffect(() => {
    if (tema !== 'sistema') return
    const consulta = window.matchMedia('(prefers-color-scheme: dark)')
    const aoMudar = () => aplicarTema('sistema')
    consulta.addEventListener('change', aoMudar)
    return () => consulta.removeEventListener('change', aoMudar)
  }, [tema])

  const trocarTema = useCallback((novo: Tema) => setTemaEstado(novo), [])

  return { tema, trocarTema }
}
