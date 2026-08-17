import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function Vazio({
  icone: Icone,
  titulo,
  descricao,
  acao,
}: {
  icone: LucideIcon
  titulo: string
  descricao?: string
  acao?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-borda px-6 py-12 text-center">
      <div className="mb-4 rounded-2xl bg-superficie-2 p-3">
        <Icone className="size-6 text-texto-suave" aria-hidden />
      </div>
      <p className="font-medium">{titulo}</p>
      {descricao && <p className="mt-1 max-w-sm text-sm text-texto-suave">{descricao}</p>}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  )
}
