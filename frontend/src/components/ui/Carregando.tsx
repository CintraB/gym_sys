import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

export function Carregando({ tela = false, texto }: { tela?: boolean; texto?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-texto-suave',
        tela ? 'min-h-dvh' : 'py-12',
      )}
    >
      <Loader2 className="size-6 animate-spin text-acento" aria-hidden />
      <span className="text-sm">{texto ?? 'Carregando...'}</span>
    </div>
  )
}

/** Placeholder com a forma do conteúdo, evita o "pulo" de layout. */
export function Esqueleto({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-superficie-2', className)} />
}
