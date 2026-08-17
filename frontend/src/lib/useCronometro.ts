import { useEffect, useState } from 'react'

/**
 * Segundos decorridos desde `inicio`.
 *
 * O tempo é sempre derivado do timestamp do servidor, nunca acumulado em um
 * contador local: fechar o app, bloquear a tela ou trocar de aparelho não
 * atrasa nem adianta o cronômetro. Quem grava a duração final é o servidor.
 */
export function useCronometro(inicio: string | null | undefined) {
  const [segundos, setSegundos] = useState(0)

  useEffect(() => {
    if (!inicio) {
      setSegundos(0)
      return
    }

    const inicioMs = new Date(inicio).getTime()
    const calcular = () => setSegundos(Math.max(0, Math.floor((Date.now() - inicioMs) / 1000)))

    calcular()
    const id = setInterval(calcular, 1000)
    return () => clearInterval(id)
  }, [inicio])

  return segundos
}
