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
