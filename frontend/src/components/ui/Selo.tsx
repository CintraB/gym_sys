import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Tom = 'neutro' | 'acento' | 'alerta' | 'perigo'

const TONS: Record<Tom, string> = {
  neutro: 'bg-superficie-2 text-texto-suave border-borda',
  acento: 'bg-acento/12 text-acento border-acento/25',
  alerta: 'bg-alerta/12 text-alerta border-alerta/25',
  perigo: 'bg-perigo/12 text-perigo border-perigo/25',
}

export function Selo({ tom = 'neutro', children }: { tom?: Tom; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        TONS[tom],
      )}
    >
      {children}
    </span>
  )
}
