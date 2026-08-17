import { Monitor, Moon, Sun } from 'lucide-react'
import { useTema } from '../../lib/useTema'
import type { Tema } from '../../lib/tema'
import { cn } from '../../lib/cn'

const OPCOES: Array<{ valor: Tema; rotulo: string; icone: typeof Sun }> = [
  { valor: 'claro', rotulo: 'Claro', icone: Sun },
  { valor: 'escuro', rotulo: 'Escuro', icone: Moon },
  { valor: 'sistema', rotulo: 'Sistema', icone: Monitor },
]

/**
 * Três opções em vez de um interruptor: "sistema" é um estado de verdade.
 *
 * `compacto` mostra só os ícones. A barra lateral tem 256px, e os três rótulos
 * pedem 267px — com `flex-1` os botões não encolhem abaixo do próprio conteúdo
 * (min-width: auto), então eles escapavam da borda arredondada e invadiam a
 * área de conteúdo. Onde não cabe rótulo, não se coloca rótulo.
 */
export function SeletorTema({ compacto = false }: { compacto?: boolean }) {
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
          aria-label={compacto ? rotulo : undefined}
          title={compacto ? rotulo : undefined}
          onClick={() => trocarTema(valor)}
          className={cn(
            'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm transition-colors',
            compacto ? 'px-0' : 'px-3',
            tema === valor
              ? 'bg-superficie font-medium text-texto shadow-sm'
              : 'text-texto-suave hover:text-texto',
          )}
        >
          <Icone className="size-4 shrink-0" aria-hidden />
          {!compacto && <span className="truncate">{rotulo}</span>}
        </button>
      ))}
    </div>
  )
}

/** Versão de um botão só, para a barra superior do celular. */
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
