import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

const BASE_CONTROLE = cn(
  'w-full rounded-xl border border-borda bg-superficie px-4 text-texto',
  'placeholder:text-texto-suave/60',
  'focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/25',
  'disabled:opacity-50',
)

interface CampoProps extends InputHTMLAttributes<HTMLInputElement> {
  rotulo: string
  erro?: string
  dica?: ReactNode
}

export function Campo({ rotulo, erro, dica, className, id, ...resto }: CampoProps) {
  const gerado = useId()
  const idCampo = id ?? gerado

  return (
    <div className="space-y-1.5">
      <label htmlFor={idCampo} className="block text-sm font-medium text-texto-suave">
        {rotulo}
      </label>
      <input
        id={idCampo}
        aria-invalid={Boolean(erro)}
        aria-describedby={erro ? `${idCampo}-erro` : undefined}
        className={cn(BASE_CONTROLE, 'h-12', erro && 'border-perigo focus:border-perigo', className)}
        {...resto}
      />
      {erro && (
        <p id={`${idCampo}-erro`} className="text-sm text-perigo">
          {erro}
        </p>
      )}
      {!erro && dica && <p className="text-xs text-texto-suave">{dica}</p>}
    </div>
  )
}

interface AreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  rotulo: string
}

export function AreaTexto({ rotulo, className, id, ...resto }: AreaProps) {
  const gerado = useId()
  const idCampo = id ?? gerado

  return (
    <div className="space-y-1.5">
      <label htmlFor={idCampo} className="block text-sm font-medium text-texto-suave">
        {rotulo}
      </label>
      <textarea id={idCampo} className={cn(BASE_CONTROLE, 'py-3', className)} {...resto} />
    </div>
  )
}

interface SelecaoProps extends InputHTMLAttributes<HTMLSelectElement> {
  rotulo?: string
  children: ReactNode
}

export function Selecao({ rotulo, className, id, children, ...resto }: SelecaoProps) {
  const gerado = useId()
  const idCampo = id ?? gerado

  return (
    <div className="space-y-1.5">
      {rotulo && (
        <label htmlFor={idCampo} className="block text-sm font-medium text-texto-suave">
          {rotulo}
        </label>
      )}
      <select
        id={idCampo}
        className={cn(BASE_CONTROLE, 'h-12 appearance-none pr-10', className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%2393a09b' stroke-width='2'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 0.875rem center',
        }}
        {...resto}
      >
        {children}
      </select>
    </div>
  )
}
