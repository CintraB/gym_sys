import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

/** Página inicial de cada área — onde "voltar" deixa de navegar e passa a avisar. */
const RAIZES = ['/entrar', '/professor', '/aluno', '/admin']

const JANELA_SAIDA_MS = 2000

/**
 * Botão físico de voltar do Android: navega as telas internas do app antes de
 * minimizar, e exige um segundo toque na tela inicial para sair — como a
 * maioria dos apps. Só se liga dentro do APK; no navegador é o comportamento
 * nativo do histórico que manda.
 */
export function useBotaoVoltarAndroid() {
  const navigate = useNavigate()
  const location = useLocation()
  const [avisoSaida, setAvisoSaida] = useState(false)

  const pathnameRef = useRef(location.pathname)
  pathnameRef.current = location.pathname

  const prontoParaSairRef = useRef(false)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let cancelado = false
    let temporizador: ReturnType<typeof setTimeout> | undefined

    const promessa = App.addListener('backButton', () => {
      const naRaiz = RAIZES.includes(pathnameRef.current)

      if (!naRaiz) {
        navigate(-1)
        return
      }

      if (prontoParaSairRef.current) {
        App.exitApp()
        return
      }

      prontoParaSairRef.current = true
      setAvisoSaida(true)
      temporizador = setTimeout(() => {
        prontoParaSairRef.current = false
        setAvisoSaida(false)
      }, JANELA_SAIDA_MS)
    })

    return () => {
      cancelado = true
      clearTimeout(temporizador)
      // Promise.resolve() por segurança: no aparelho, testado via CDP, o retorno do
      // addListener não bate com o `.then` direto do tipo declarado.
      Promise.resolve(promessa).then((handle) => {
        if (cancelado) handle.remove()
      })
    }
  }, [navigate])

  return { avisoSaida }
}
