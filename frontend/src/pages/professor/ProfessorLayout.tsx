import { Outlet, useLocation } from 'react-router-dom'
import { ClipboardList, Dumbbell, LayoutDashboard, Users } from 'lucide-react'
import { AppShell, type ItemNav } from '../../components/AppShell'
import { api } from '../../lib/api'
import { useRequisicao } from '../../lib/useRequisicao'
import type { Resumo } from '../../types'

export default function ProfessorLayout() {
  const { pathname } = useLocation()

  // Recarrega a cada troca de rota: mantém o contador de pedidos coerente
  // depois de finalizar um pedido ou montar um treino.
  const { dados: resumo } = useRequisicao<Resumo>(
    () => api.get<Resumo>('/professores/resumo').then((r) => r.data),
    [pathname],
  )

  const itens: ItemNav[] = [
    { para: '/professor', rotulo: 'Início', icone: LayoutDashboard },
    { para: '/professor/alunos', rotulo: 'Alunos', icone: Users },
    { para: '/professor/treino', rotulo: 'Treino', icone: Dumbbell },
    {
      para: '/professor/pedidos',
      rotulo: 'Pedidos',
      icone: ClipboardList,
      distintivo: resumo?.pedidos_abertos,
    },
  ]

  return (
    <AppShell itens={itens}>
      <Outlet />
    </AppShell>
  )
}
