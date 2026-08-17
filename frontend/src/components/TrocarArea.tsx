import { Link, useLocation } from 'react-router-dom'
import { Dumbbell, GraduationCap } from 'lucide-react'
import { useAuth } from '../auth/useAuth'

/**
 * Alterna entre a área do professor e a do aluno.
 *
 * Só aparece para quem tem os dois perfis — o caso de quem dá aula e também
 * treina na academia. Para todo mundo, não existe.
 */
export function TrocarArea({ compacto = false }: { compacto?: boolean }) {
  const { usuario } = useAuth()
  const { pathname } = useLocation()

  if (!usuario?.perfis.aluno || !usuario.perfis.professor) {
    return null
  }

  const naAreaDoAluno = pathname.startsWith('/aluno')
  const destino = naAreaDoAluno ? '/professor' : '/aluno'
  const rotulo = naAreaDoAluno ? 'Área do professor' : 'Meu treino'
  const Icone = naAreaDoAluno ? GraduationCap : Dumbbell

  if (compacto) {
    return (
      <Link
        to={destino}
        aria-label={rotulo}
        title={rotulo}
        className="rounded-xl p-2 text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
      >
        <Icone className="size-5" aria-hidden />
      </Link>
    )
  }

  return (
    <Link
      to={destino}
      className="flex items-center gap-2 rounded-xl border border-borda px-3 py-2.5 text-sm text-texto-suave transition-colors hover:border-acento/40 hover:text-texto"
    >
      <Icone className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{rotulo}</span>
    </Link>
  )
}
