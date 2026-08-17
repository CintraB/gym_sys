export type Tema = 'sistema' | 'claro' | 'escuro'

const CHAVE = 'gymsys.tema'

export function lerTema(): Tema {
  const salvo = localStorage.getItem(CHAVE)
  return salvo === 'claro' || salvo === 'escuro' ? salvo : 'sistema'
}

/**
 * "sistema" remove o atributo em vez de escrever um valor: sem data-theme, o
 * CSS cai na media query e passa a seguir a preferência do aparelho — inclusive
 * se ela mudar com o app aberto.
 */
export function aplicarTema(tema: Tema) {
  const raiz = document.documentElement
  if (tema === 'sistema') {
    raiz.removeAttribute('data-theme')
    localStorage.removeItem(CHAVE)
  } else {
    raiz.setAttribute('data-theme', tema)
    localStorage.setItem(CHAVE, tema)
  }

  // Mantém a barra de status do celular na cor certa.
  const cor = getComputedStyle(raiz).getPropertyValue('--color-fundo').trim()
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', cor)
}
