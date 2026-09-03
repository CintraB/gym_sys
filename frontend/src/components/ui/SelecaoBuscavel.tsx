import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { normalizarBusca } from '../../lib/formato'

export interface OpcaoBuscavel {
  valor: string | number
  texto: string
  /** Cabeçalho sob o qual a opção aparece. Sem ele, a lista sai plana. */
  grupo?: string
}

interface Props {
  rotulo?: string
  valor: string | number
  aoEscolher: (valor: string | number) => void
  opcoes: OpcaoBuscavel[]
  placeholder?: string
  /** Complemento do "Nenhum ___ encontrado". */
  substantivo?: string
  desabilitado?: boolean
  id?: string
}

/**
 * Campo de escolha com filtro por digitação.
 *
 * Existe porque o catálogo de exercícios passa de 70 itens: no <select> nativo
 * isso vira rolagem longa no celular, e o professor escolhe exercício dezenas
 * de vezes ao montar uma ficha.
 *
 * O custo de abrir mão do <select> é que teclado, foco e leitor de tela deixam
 * de vir de graça — daí os papéis ARIA explícitos e o aria-activedescendant.
 */
export function SelecaoBuscavel({
  rotulo,
  valor,
  aoEscolher,
  opcoes,
  placeholder,
  substantivo = 'resultado',
  desabilitado,
  id,
}: Props) {
  const gerado = useId()
  const idCampo = id ?? gerado
  const idLista = `${idCampo}-lista`

  const [aberto, setAberto] = useState(false)
  const [digitado, setDigitado] = useState('')
  const [ativo, setAtivo] = useState(0)

  const raiz = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLInputElement>(null)
  const itemAtivo = useRef<HTMLLIElement>(null)

  const escolhida = opcoes.find((o) => String(o.valor) === String(valor))

  // Fechado, o campo mostra o rótulo da escolha; aberto, o que se está
  // digitando. São dois textos diferentes no mesmo input.
  const textoVisivel = aberto ? digitado : (escolhida?.texto ?? '')

  const filtradas = useMemo(() => {
    const alvo = normalizarBusca(digitado)
    if (!aberto || !alvo) return opcoes
    return opcoes.filter((o) => normalizarBusca(o.texto).includes(alvo))
  }, [aberto, digitado, opcoes])

  const grupos = useMemo(() => {
    const mapa = new Map<string, OpcaoBuscavel[]>()
    for (const opcao of filtradas) {
      const chave = opcao.grupo ?? ''
      const lista = mapa.get(chave)
      if (lista) lista.push(opcao)
      else mapa.set(chave, [opcao])
    }
    return [...mapa.entries()]
  }, [filtradas])

  function fechar() {
    setAberto(false)
    setDigitado('')
  }

  // Clique fora fecha. No celular é o gesto natural de desistir da lista.
  useEffect(() => {
    if (!aberto) return
    function aoTocarFora(evento: MouseEvent) {
      if (!raiz.current?.contains(evento.target as Node)) {
        setAberto(false)
        setDigitado('')
      }
    }
    document.addEventListener('mousedown', aoTocarFora)
    return () => document.removeEventListener('mousedown', aoTocarFora)
  }, [aberto])

  // Com o teclado do Android aberto sobra pouca tela: sem trazer o item ativo
  // para a área visível, navegar com as setas move uma seleção que não se vê.
  useEffect(() => {
    itemAtivo.current?.scrollIntoView({ block: 'nearest' })
  }, [ativo, aberto])

  function abrir() {
    if (desabilitado || aberto) return
    setDigitado('')
    // Abre com o primeiro item já ativo, e não com nada selecionado: assim
    // "supi" + Enter escolhe direto, que é como se usa quando se sabe o nome.
    setAtivo(0)
    setAberto(true)
  }

  function escolher(opcao: OpcaoBuscavel) {
    aoEscolher(opcao.valor)
    fechar()
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault()
      if (!aberto) {
        abrir()
        return
      }
      const passo = evento.key === 'ArrowDown' ? 1 : -1
      setAtivo((atual) => {
        if (filtradas.length === 0) return 0
        return (atual + passo + filtradas.length) % filtradas.length
      })
      return
    }
    if (evento.key === 'Enter') {
      if (!aberto) return
      evento.preventDefault()
      const alvo = filtradas[ativo]
      if (alvo) escolher(alvo)
      return
    }
    if (evento.key === 'Escape') {
      if (!aberto) return
      evento.preventDefault()
      fechar()
      return
    }
    if (evento.key === 'Tab' && aberto) fechar()
  }

  const posicaoDe = (opcao: OpcaoBuscavel) => filtradas.indexOf(opcao)

  return (
    <div className="space-y-1.5" ref={raiz}>
      {rotulo && (
        <label htmlFor={idCampo} className="block text-sm font-medium text-texto-suave">
          {rotulo}
        </label>
      )}

      <div className="relative">
        <input
          ref={campo}
          id={idCampo}
          role="combobox"
          type="text"
          autoComplete="off"
          disabled={desabilitado}
          aria-expanded={aberto}
          aria-controls={aberto ? idLista : undefined}
          aria-autocomplete="list"
          aria-activedescendant={aberto && filtradas[ativo] ? `${idLista}-${ativo}` : undefined}
          placeholder={placeholder}
          value={textoVisivel}
          onFocus={abrir}
          onClick={abrir}
          onChange={(e) => {
            setAberto(true)
            setDigitado(e.target.value)
            setAtivo(0)
          }}
          onKeyDown={aoTeclar}
          className={cn(
            'h-12 w-full rounded-xl border border-borda bg-superficie px-4 pr-16 text-texto',
            'placeholder:text-texto-suave/60',
            'focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/25',
            'disabled:opacity-50',
          )}
        />

        <div className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
          {escolhida && !desabilitado && (
            <button
              type="button"
              aria-label="Limpar"
              // tabIndex -1 pelo mesmo motivo do olho do CampoSenha: no fluxo
              // do teclado o Tab deve sair do campo, não parar no X.
              tabIndex={-1}
              onClick={() => {
                aoEscolher('')
                fechar()
                campo.current?.focus()
              }}
              className="pointer-events-auto grid size-8 place-items-center rounded-lg text-texto-suave transition-colors hover:text-texto"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
          <ChevronDown className="mr-3 size-4 text-texto-suave" aria-hidden />
        </div>

        {aberto && (
          <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-borda bg-superficie shadow-lg">
            {filtradas.length === 0 ? (
              <p className="px-4 py-3 text-sm text-texto-suave">
                {`Nenhum ${substantivo} encontrado`}
              </p>
            ) : (
              <ul id={idLista} role="listbox" className="max-h-64 overflow-y-auto py-1">
                {grupos.map(([grupo, lista]) => {
                  const itens = lista.map((opcao) => {
                    const indice = posicaoDe(opcao)
                    const selecionada = String(opcao.valor) === String(valor)
                    return (
                      <li
                        key={opcao.valor}
                        id={`${idLista}-${indice}`}
                        ref={indice === ativo ? itemAtivo : undefined}
                        role="option"
                        aria-selected={selecionada}
                        // mousedown com preventDefault: sem isso o blur do
                        // input fecharia a lista antes de o clique chegar ao
                        // item, e a escolha se perderia.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => escolher(opcao)}
                        onMouseEnter={() => setAtivo(indice)}
                        className={cn(
                          'cursor-pointer px-4 py-2.5 text-sm',
                          grupo && 'pl-6',
                          indice === ativo && 'bg-acento/10',
                          selecionada && 'font-medium text-acento-texto',
                        )}
                      >
                        {opcao.texto}
                      </li>
                    )
                  })

                  if (!grupo) return itens

                  return (
                    <li key={grupo} role="group" aria-label={grupo}>
                      <p className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-texto-suave">
                        {grupo}
                      </p>
                      {itens}
                    </li>
                  )
                })}
              </ul>
            )}

            {digitado && (
              <p className="border-t border-borda px-4 py-2 text-xs text-texto-suave">
                {filtradas.length} de {opcoes.length}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
