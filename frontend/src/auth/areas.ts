import type { Cargo, Usuario } from '../types'

/**
 * Para onde cada cargo abre, e como cada área se chama.
 *
 * Fonte única de propósito: o mapeamento estava repetido em quatro lugares como
 * `cargo === 'professor' ? '/professor' : '/aluno'`, e quando o admin entrou
 * todos mandaram o admin para a área do aluno — o "senão" do ternário engolia o
 * perfil novo em silêncio.
 *
 * A ordem é a de precedência do cargo principal: admin, professor, aluno.
 */
export const AREAS: { cargo: Cargo; rota: string; rotulo: string }[] = [
  { cargo: 'admin', rota: '/admin', rotulo: 'Administração' },
  { cargo: 'professor', rota: '/professor', rotulo: 'Área do professor' },
  { cargo: 'aluno', rota: '/aluno', rotulo: 'Meu treino' },
]

/** A rota inicial de quem acabou de entrar. */
export function rotaDoCargo(cargo: Cargo) {
  return AREAS.find((area) => area.cargo === cargo)?.rota ?? '/aluno'
}

const CHAVE_ULTIMA_ROTA = 'gymsys.ultima_rota'

/**
 * Grava a rota atual, para reabrir nela depois.
 *
 * Existe porque o Android mata o app em segundo plano sob pressão de memória —
 * comportamento normal do sistema, não um bug dele — e o WebView volta do
 * zero: sem isso, a pessoa sempre cai na área do cargo principal, mesmo tendo
 * saído de uma tela de outra área ou mais funda.
 */
export function salvarUltimaRota(pathname: string) {
  localStorage.setItem(CHAVE_ULTIMA_ROTA, pathname)
}

/**
 * Para onde levar quem já está autenticado: a última rota, se os perfis atuais
 * ainda alcançarem essa área; senão a área do cargo principal.
 */
export function rotaParaRetomar(usuario: Usuario) {
  const salva = localStorage.getItem(CHAVE_ULTIMA_ROTA)
  if (salva) {
    const area = AREAS.find((a) => salva === a.rota || salva.startsWith(`${a.rota}/`))
    if (area && usuario.perfis[area.cargo]) return salva
  }
  return rotaDoCargo(usuario.cargo)
}

/** "Admin, professor e aluno" — descreve a conta, não a pessoa. */
export function descreverPerfis(usuario: Usuario) {
  const nomes = AREAS.filter((area) => usuario.perfis[area.cargo]).map((area) =>
    area.cargo === 'admin' ? 'admin' : area.cargo,
  )

  if (nomes.length === 0) return 'Conta sem perfil'
  if (nomes.length === 1) return `Conta de ${nomes[0]}`

  const ultimo = nomes.at(-1)
  return `Conta de ${nomes.slice(0, -1).join(', ')} e ${ultimo}`
}
