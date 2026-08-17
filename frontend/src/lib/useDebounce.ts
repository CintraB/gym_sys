import { useEffect, useState } from 'react'

/** Evita disparar uma requisição por tecla digitada na busca. */
export function useDebounce<T>(valor: T, atrasoMs = 300) {
  const [adiado, setAdiado] = useState(valor)

  useEffect(() => {
    const id = setTimeout(() => setAdiado(valor), atrasoMs)
    return () => clearTimeout(id)
  }, [valor, atrasoMs])

  return adiado
}
