import { Outlet } from 'react-router-dom'
import { Dumbbell, History, User } from 'lucide-react'
import { AppShell, type ItemNav } from '../../components/AppShell'

const ITENS: ItemNav[] = [
  { para: '/aluno', rotulo: 'Meu treino', icone: Dumbbell },
  { para: '/aluno/historico', rotulo: 'Histórico', icone: History },
  { para: '/aluno/perfil', rotulo: 'Perfil', icone: User },
]

export default function AlunoLayout() {
  return (
    <AppShell itens={ITENS}>
      <Outlet />
    </AppShell>
  )
}
