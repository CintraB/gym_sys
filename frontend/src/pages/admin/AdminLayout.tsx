import { Outlet } from 'react-router-dom'
import { Users } from 'lucide-react'
import { AppShell, type ItemNav } from '../../components/AppShell'

const ITENS: ItemNav[] = [{ para: '/admin', rotulo: 'Usuários', icone: Users }]

export default function AdminLayout() {
  return (
    <AppShell itens={ITENS}>
      <Outlet />
    </AppShell>
  )
}
