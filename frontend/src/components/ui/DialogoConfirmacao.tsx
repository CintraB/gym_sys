import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import { Botao } from './Botao'

export interface PedidoConfirmacao {
  titulo: string
  mensagem?: ReactNode
  /** Texto do botão que confirma. Padrão: "Confirmar". */
  acao?: string
  /** Ação destrutiva: pinta o botão de vermelho e foca o Cancelar. */
  perigo?: boolean
}

/**
 * Confirmação centralizada, no lugar do `confirm()` do navegador — que abre
 * colado na barra de endereço, com a cara do navegador e não a do app.
 *
 * Use pelo hook `useConfirmacao`, que cuida do estado e devolve uma promessa.
 */
export function DialogoConfirmacao({
  pedido,
  aoResponder,
}: {
  pedido: PedidoConfirmacao | null
  aoResponder: (valor: boolean) => void
}) {
  const focoInicial = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!pedido) return

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoResponder(false)
    }
    document.addEventListener('keydown', aoTeclar)

    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    focoInicial.current?.focus()

    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflowAnterior
    }
  }, [pedido, aoResponder])

  if (!pedido) return null

  const { titulo, mensagem, acao = 'Confirmar', perigo = false } = pedido

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <button
        type="button"
        aria-label="Cancelar"
        onClick={() => aoResponder(false)}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmacao-titulo"
        className="relative w-full max-w-sm rounded-2xl border border-borda bg-superficie p-5 shadow-xl"
      >
        <div className="flex gap-3.5">
          {perigo && (
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-perigo/12">
              <AlertTriangle className="size-5 text-perigo" aria-hidden />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 id="confirmacao-titulo" className="font-semibold">
              {titulo}
            </h2>
            {mensagem && <div className="mt-1.5 text-sm text-texto-suave">{mensagem}</div>}
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <Botao
            // Em ação destrutiva o foco começa no Cancelar: Enter sem ler não
            // pode apagar nada.
            ref={perigo ? focoInicial : undefined}
            variante="secundario"
            onClick={() => aoResponder(false)}
            className="flex-1"
          >
            Cancelar
          </Botao>
          <Botao
            ref={perigo ? undefined : focoInicial}
            variante={perigo ? 'perigo' : 'primario'}
            onClick={() => aoResponder(true)}
            className="flex-1"
          >
            {acao}
          </Botao>
        </div>
      </div>
    </div>,
    document.body,
  )
}
