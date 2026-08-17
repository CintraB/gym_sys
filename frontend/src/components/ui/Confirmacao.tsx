import { useCallback, useRef, useState } from 'react'
import { DialogoConfirmacao, type PedidoConfirmacao } from './DialogoConfirmacao'

/**
 * Substitui o `confirm()` do navegador mantendo a ergonomia dele.
 *
 *   const { confirmar, dialogo } = useConfirmacao()
 *   if (!(await confirmar({ titulo: '...', perigo: true }))) return
 *   ...
 *   return <>{conteudo}{dialogo}</>
 *
 * A promessa fica pendurada até o usuário responder, então o call site
 * continua lendo como uma linha só, sem callback nem estado espalhado.
 */
export function useConfirmacao() {
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null)
  const resolver = useRef<((valor: boolean) => void) | null>(null)

  const confirmar = useCallback(
    (opcoes: PedidoConfirmacao) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve
        setPedido(opcoes)
      }),
    [],
  )

  const responder = useCallback((valor: boolean) => {
    resolver.current?.(valor)
    resolver.current = null
    setPedido(null)
  }, [])

  return {
    confirmar,
    dialogo: <DialogoConfirmacao pedido={pedido} aoResponder={responder} />,
  }
}
