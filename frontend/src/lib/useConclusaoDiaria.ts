import { useCallback, useEffect, useState } from 'react'

const CHAVE = 'gymsys.concluidos'

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Marcação de exercícios feitos, só no aparelho e válida pelo dia.
 * É um apoio para não se perder no meio da série — não vai para a API,
 * e zera sozinho quando vira o dia.
 */
export function useConclusaoDiaria(idTreino: number | undefined) {
  const [feitos, setFeitos] = useState<Set<number>>(new Set())

  const chave = idTreino ? `${CHAVE}.${idTreino}.${hoje()}` : null

  useEffect(() => {
    if (!chave) return
    try {
      const salvo = localStorage.getItem(chave)
      setFeitos(new Set(salvo ? (JSON.parse(salvo) as number[]) : []))
    } catch {
      setFeitos(new Set())
    }
  }, [chave])

  const alternar = useCallback(
    (id: number) => {
      setFeitos((atuais) => {
        const proximos = new Set(atuais)
        if (proximos.has(id)) {
          proximos.delete(id)
        } else {
          proximos.add(id)
        }
        if (chave) {
          localStorage.setItem(chave, JSON.stringify([...proximos]))
        }
        return proximos
      })
    },
    [chave],
  )

  const limpar = useCallback(() => {
    if (chave) localStorage.removeItem(chave)
    setFeitos(new Set())
  }, [chave])

  return { feitos, alternar, limpar }
}
