import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo'
type Tamanho = 'md' | 'sm' | 'icone'

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-acento text-fundo hover:bg-acento-escuro active:bg-acento-escuro font-semibold',
  secundario: 'bg-superficie-2 text-texto hover:bg-borda border border-borda',
  fantasma: 'text-texto-suave hover:text-texto hover:bg-superficie-2',
  perigo: 'bg-perigo/10 text-perigo hover:bg-perigo/20 border border-perigo/30',
}

const TAMANHOS: Record<Tamanho, string> = {
  md: 'h-12 px-5 text-sm',
  sm: 'h-9 px-3 text-sm',
  icone: 'h-10 w-10',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  tamanho?: Tamanho
  carregando?: boolean
  children?: ReactNode
}

export function Botao({
  variante = 'primario',
  tamanho = 'md',
  carregando = false,
  className,
  children,
  disabled,
  ...resto
}: Props) {
  return (
    <button
      {...resto}
      disabled={disabled || carregando}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTES[variante],
        TAMANHOS[tamanho],
        className,
      )}
    >
      {carregando && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
