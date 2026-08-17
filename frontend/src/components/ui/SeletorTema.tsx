import { Monitor, Moon, Sun } from 'lucide-react'
import { useTema } from '../../lib/useTema'
import type { Tema } from '../../lib/tema'
import { cn } from '../../lib/cn'

const OPCOES: Array<{ valor: Tema; rotulo: string; icone: typeof Sun }> = [
  { valor: 'claro', rotulo: 'Claro', icone: Sun },
  { valor: 'escuro', rotulo: 'Escuro', icone: Moon },
  { valor: 'sistema', rotulo: 'Sistema', icone: Monitor },
]

/** Três opções em vez de um interruptor: "sistema" é um estado de verdade. */
export function SeletorTema() {
  const { tema, trocarTema } = useTema()

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="flex gap-1 rounded-xl border border-borda bg-superficie-2 p-1"
    >
      {OPCOES.map(({ valor, rotulo, icone: Icone }) => (
        <button
          key={valor}
          type="button"
          role="radio"
          aria-checked={tema === valor}
          onClick={() => trocarTema(valor)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors',
            tema === valor
              ? 'bg-superficie font-medium text-texto shadow-sm'
              : 'text-texto-suave hover:text-texto',
          )}
        >
          <Icone className="size-4" aria-hidden />
          {rotulo}
        </button>
      ))}
    </div>
  )
}

/** Versão compacta para a barra superior: alterna claro/escuro direto. */
export function BotaoTema() {
  const { tema, trocarTema } = useTema()
  const escuroAtivo =
    tema === 'escuro' ||
    (tema === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <button
      type="button"
      onClick={() => trocarTema(escuroAtivo ? 'claro' : 'escuro')}
      aria-label={escuroAtivo ? 'Usar tema claro' : 'Usar tema escuro'}
      className="rounded-xl p-2 text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
    >
      {escuroAtivo ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </button>
  )
}
