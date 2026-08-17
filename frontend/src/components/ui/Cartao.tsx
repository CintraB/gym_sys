import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export function Cartao({ className, ...resto }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-2xl border border-borda bg-superficie p-4 sm:p-5', className)}
      {...resto}
    />
  )
}

export function TituloSecao({
  children,
  acao,
}: {
  children: ReactNode
  acao?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {acao}
    </div>
  )
}
