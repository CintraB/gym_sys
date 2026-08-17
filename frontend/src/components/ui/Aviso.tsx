import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '../../lib/cn'

export function Aviso({ tipo, children }: { tipo: 'erro' | 'sucesso'; children: string }) {
  const Icone = tipo === 'erro' ? AlertCircle : CheckCircle2

  return (
    <div
      role={tipo === 'erro' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm',
        tipo === 'erro'
          ? 'border-perigo/30 bg-perigo/10 text-perigo'
          : 'border-acento/30 bg-acento/10 text-acento',
      )}
    >
      <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="text-texto">{children}</span>
    </div>
  )
}
