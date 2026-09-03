import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/**
 * Repõe o localStorage que o Node 25 tira do jsdom.
 *
 * O Node 25 expõe um `localStorage` nativo no global, e como aqui `globalThis`
 * e `window` são o mesmo objeto, ele sobrescreve o do jsdom. Sem
 * `--localstorage-file` esse nativo vem inerte: existe como objeto, mas não tem
 * `getItem`. Qualquer componente que leia o tema salvo quebrava com
 * "localStorage.getItem is not a function" — o SeletorTema, dentro do Perfil.
 *
 * `sessionStorage` não sofre disso, porque o Node não define esse nome. Como o
 * localStorage do jsdom já se perdeu, o caminho é repor um equivalente em
 * memória — que é o comportamento que o teste quer de qualquer forma: cada
 * teste começa com o armazenamento limpo.
 */
function criarArmazenamento(): Storage {
  const itens = new Map<string, string>()

  return {
    get length() {
      return itens.size
    },
    key: (indice: number) => [...itens.keys()][indice] ?? null,
    getItem: (chave: string) => itens.get(chave) ?? null,
    setItem: (chave: string, valor: string) => {
      itens.set(chave, String(valor))
    },
    removeItem: (chave: string) => {
      itens.delete(chave)
    },
    clear: () => {
      itens.clear()
    },
  } as Storage
}

Object.defineProperty(globalThis, 'localStorage', {
  value: criarArmazenamento(),
  configurable: true,
  writable: true,
})

/**
 * O que segue precisa de DOM, e não todo teste roda com um.
 *
 * Os testes do núcleo local (`src/local/`) declaram ambiente `node`: aquilo é
 * código de servidor rodando dentro do cliente, e no jsdom o `jose` recusa a
 * chave que o `TextEncoder` produz — `instanceof Uint8Array` falha entre o
 * realm do jsdom e o do Node.
 */
const temDom = typeof window !== 'undefined'

/**
 * jsdom não implementa matchMedia — é lacuna conhecida dele, não do Node.
 *
 * O useTema consulta `prefers-color-scheme` no modo "sistema", então sem este
 * stub qualquer tela com o SeletorTema dentro quebra. Responde sempre "não
 * casa" (tema claro) e aceita registrar ouvinte sem fazer nada, que é o
 * bastante: o teste verifica que a tela monta, não qual cor o sistema pediu.
 */
if (temDom) {
  Object.defineProperty(window, 'matchMedia', {
    value: (consulta: string) => ({
      matches: false,
      media: consulta,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
    configurable: true,
    writable: true,
  })
}

// O jsdom não implementa scrollIntoView — não há layout para rolar. Quem usa
// (a SelecaoBuscavel, para manter o item ativo visível com o teclado do celular
// ocupando meia tela) quebraria em todo teste sem este stub.
if (temDom && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

afterEach(() => {
  // Sem isso, o DOM de um teste sobrevive para o seguinte e um getByText passa
  // a encontrar dois elementos iguais.
  if (temDom) cleanup()
  localStorage.clear()
})
