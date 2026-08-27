import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RotaProtegida } from './auth/RotaProtegida'
import { useBotaoVoltarAndroid } from './lib/useBotaoVoltarAndroid'
import { Toast } from './components/ui/Toast'
import Login from './pages/Login'
import ProfessorLayout from './pages/professor/ProfessorLayout'
import Dashboard from './pages/professor/Dashboard'
import Alunos from './pages/professor/Alunos'
import Frequencia from './pages/professor/Frequencia'
import MontarTreino from './pages/professor/MontarTreino'
import Pedidos from './pages/professor/Pedidos'
import AdminLayout from './pages/admin/AdminLayout'
import Usuarios from './pages/admin/Usuarios'
import AlunoLayout from './pages/aluno/AlunoLayout'
import MeuTreino from './pages/aluno/MeuTreino'
import Historico from './pages/aluno/Historico'
import Perfil from './pages/aluno/Perfil'

/** Fica dentro do Router só para poder usar useNavigate/useLocation. */
function BotaoVoltarAndroid() {
  const { avisoSaida } = useBotaoVoltarAndroid()
  return <Toast mensagem={avisoSaida ? 'Toque voltar de novo para sair' : null} />
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <BotaoVoltarAndroid />
        <Routes>
          <Route path="/entrar" element={<Login />} />

          <Route
            path="/professor"
            element={
              <RotaProtegida cargo="professor">
                <ProfessorLayout />
              </RotaProtegida>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="alunos" element={<Alunos />} />
            <Route path="alunos/:id/frequencia" element={<Frequencia />} />
            <Route path="treino" element={<MontarTreino />} />
            <Route path="pedidos" element={<Pedidos />} />
          </Route>

          <Route
            path="/aluno"
            element={
              <RotaProtegida cargo="aluno">
                <AlunoLayout />
              </RotaProtegida>
            }
          >
            <Route index element={<MeuTreino />} />
            <Route path="historico" element={<Historico />} />
            <Route path="perfil" element={<Perfil />} />
          </Route>

          <Route
            path="/admin"
            element={
              <RotaProtegida cargo="admin">
                <AdminLayout />
              </RotaProtegida>
            }
          >
            <Route index element={<Usuarios />} />
          </Route>

          {/* O Login redireciona sozinho conforme o cargo de quem já está logado. */}
          <Route path="*" element={<Navigate to="/entrar" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
