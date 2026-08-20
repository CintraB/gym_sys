import { useCallback, useEffect, useState } from 'react'
import { mensagemDeErro } from './api'

/**
 * Busca de dados com os três estados que toda tela precisa tratar.
 * Antes cada componente fazia useEffect + try/catch e engolia o erro no console.
 */
export function useRequisicao<T>(buscar: () => Promise<T>, deps: unknown[] = []) {
  const [dados, setDados] = useState<T | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // A função de busca é recriada a cada render pelos chamadores; as deps
  // explícitas é que definem quando refazer a requisição.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const buscarEstavel = useCallback(buscar, deps)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      setDados(await buscarEstavel())
    } catch (e) {
      // 401 já derruba a sessão no interceptor; não vale mostrar erro aqui.
      setErro(mensagemDeErro(e, 'Não foi possível carregar os dados.'))
    } finally {
      setCarregando(false)
    }
  }, [buscarEstavel])

  useEffect(() => {
    let cancelado = false
    setCarregando(true)
    setErro(null)

    buscarEstavel()
      .then((resultado) => {
        if (!cancelado) setDados(resultado)
      })
      .catch((e) => {
        if (!cancelado) setErro(mensagemDeErro(e, 'Não foi possível carregar os dados.'))
      })
      .finally(() => {
        if (!cancelado) setCarregando(false)
      })

    return () => {
      cancelado = true
    }
  }, [buscarEstavel])

  // definirDados evita um ida-e-volta quando a própria tela acabou de criar o
  // registro e já recebeu ele na resposta — recarregar a lista inteira só para
  // enxergar o que já se tem em mãos deixa o formulário piscando.
  return { dados, carregando, erro, recarregar: carregar, definirDados: setDados }
}
