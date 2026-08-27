import { createPortal } from 'react-dom'

/**
 * Aviso flutuante e não interativo, tipo "toque de novo para sair". Some
 * sozinho — quem controla a duração é quem chama, não o Toast.
 */
export function Toast({ mensagem }: { mensagem: string | null }) {
  if (!mensagem) return null

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-6">
      <div
        role="status"
        className="rounded-full border border-borda bg-superficie px-4 py-2.5 text-sm font-medium shadow-xl"
      >
        {mensagem}
      </div>
    </div>,
    document.body,
  )
}
