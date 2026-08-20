import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { ArrowBigUp, Eye, EyeOff } from 'lucide-react'
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

// forwardRef pelo mesmo motivo do Botao: um modal precisa dar foco ao primeiro
// campo ao abrir, senão o teclado do celular não sobe.
export const Campo = forwardRef<HTMLInputElement, CampoProps>(function Campo(
  { rotulo, erro, dica, className, id, ...resto },
  ref,
) {
  const gerado = useId()
  const idCampo = id ?? gerado

  return (
    <div className="space-y-1.5">
      <label htmlFor={idCampo} className="block text-sm font-medium text-texto-suave">
        {rotulo}
      </label>
      <input
        ref={ref}
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
})

interface CampoSenhaProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  rotulo: string
  erro?: string
  dica?: ReactNode
}

/**
 * Campo de senha com olho para revelar e aviso de Caps Lock.
 *
 * O aviso importa mais no celular, onde o teclado às vezes fica em maiúsculas
 * sem que se perceba, e o campo mascarado não deixa conferir. Sem ele, o
 * usuário só descobre depois de errar a senha.
 */
// forwardRef pelo mesmo motivo do Campo: o modal de troca de senha precisa dar
// foco ao primeiro campo ao abrir.
export const CampoSenha = forwardRef<HTMLInputElement, CampoSenhaProps>(function CampoSenha(
  { rotulo, erro, dica, className, id, ...resto },
  ref,
) {
  const gerado = useId()
  const idCampo = id ?? gerado
  const [visivel, setVisivel] = useState(false)
  const [capsLock, setCapsLock] = useState(false)

  // getModifierState só existe no evento, então o estado só é conhecido a
  // partir da primeira tecla — não dá para saber no foco.
  function verificarCaps(evento: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(evento.getModifierState('CapsLock'))
  }

  const descritores = [erro && `${idCampo}-erro`, capsLock && `${idCampo}-caps`]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="space-y-1.5">
      <label htmlFor={idCampo} className="block text-sm font-medium text-texto-suave">
        {rotulo}
      </label>

      <div className="relative">
        <input
          ref={ref}
          id={idCampo}
          type={visivel ? 'text' : 'password'}
          aria-invalid={Boolean(erro)}
          aria-describedby={descritores || undefined}
          onKeyDown={verificarCaps}
          onKeyUp={verificarCaps}
          onBlur={() => setCapsLock(false)}
          className={cn(
            BASE_CONTROLE,
            'h-12 pr-12',
            erro && 'border-perigo focus:border-perigo',
            className,
          )}
          {...resto}
        />
        <button
          type="button"
          onClick={() => setVisivel((atual) => !atual)}
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visivel}
          // tabIndex -1: no fluxo do teclado o Tab deve ir do campo direto
          // para o botão de entrar, não parar no olho.
          tabIndex={-1}
          className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-texto-suave transition-colors hover:text-texto"
        >
          {visivel ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
        </button>
      </div>

      {capsLock && (
        <p
          id={`${idCampo}-caps`}
          role="status"
          className="flex items-center gap-1.5 text-sm text-alerta"
        >
          <ArrowBigUp className="size-4 shrink-0" aria-hidden />
          Caps Lock está ativado
        </p>
      )}

      {erro && (
        <p id={`${idCampo}-erro`} className="text-sm text-perigo">
          {erro}
        </p>
      )}
      {!erro && dica && <p className="text-xs text-texto-suave">{dica}</p>}
    </div>
  )
})

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
