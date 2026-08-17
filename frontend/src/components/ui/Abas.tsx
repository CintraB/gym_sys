import { cn } from '../../lib/cn'

export interface Aba {
  id: number | string
  rotulo: string
  detalhe?: string
}

/**
 * Abas roláveis. No celular, quatro blocos com nome não cabem lado a lado —
 * rolar horizontalmente é melhor que espremer ou quebrar linha.
 */
export function Abas({
  abas,
  ativa,
  aoTrocar,
}: {
  abas: Aba[]
  ativa: number | string
  aoTrocar: (id: number | string) => void
}) {
  if (abas.length <= 1) return null

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="tablist" className="flex w-max gap-2">
        {abas.map((aba) => (
          <button
            key={aba.id}
            type="button"
            role="tab"
            aria-selected={aba.id === ativa}
            onClick={() => aoTrocar(aba.id)}
            className={cn(
              'shrink-0 rounded-xl border px-4 py-2.5 text-left transition-colors',
              aba.id === ativa
                ? 'border-acento/40 bg-acento/12 text-acento-texto'
                : 'border-borda bg-superficie text-texto-suave hover:text-texto',
            )}
          >
            <span className="block text-sm font-medium">{aba.rotulo}</span>
            {aba.detalhe && <span className="block text-xs opacity-80">{aba.detalhe}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
