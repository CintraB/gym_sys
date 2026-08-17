import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/**
 * Bottom sheet no celular, diálogo centralizado no desktop.
 * O padrão de folha deslizante é o que torna formulários usáveis com o polegar.
 */
export function Painel({
  aberto,
  aoFechar,
  titulo,
  children,
  rodape,
}: {
  aberto: boolean
  aoFechar: () => void
  titulo: string
  children: ReactNode
  rodape?: ReactNode
}) {
  useEffect(() => {
    if (!aberto) return

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', aoTeclar)

    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflowAnterior
    }
  }, [aberto, aoFechar])

  if (!aberto) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Fechar"
        onClick={aoFechar}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-borda bg-superficie sm:max-w-lg sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-borda px-5 py-4">
          <h2 className="text-base font-semibold">{titulo}</h2>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {rodape && (
          <div className="area-segura-inferior border-t border-borda px-5 py-4">{rodape}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}
