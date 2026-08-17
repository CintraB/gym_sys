import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RotaProtegida } from './auth/RotaProtegida'
import Login from './pages/Login'
import ProfessorLayout from './pages/professor/ProfessorLayout'
import Dashboard from './pages/professor/Dashboard'
import Alunos from './pages/professor/Alunos'
import MontarTreino from './pages/professor/MontarTreino'
import Pedidos from './pages/professor/Pedidos'
import AlunoLayout from './pages/aluno/AlunoLayout'
import MeuTreino from './pages/aluno/MeuTreino'
import Historico from './pages/aluno/Historico'
import Perfil from './pages/aluno/Perfil'

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
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

          {/* O Login redireciona sozinho conforme o cargo de quem já está logado. */}
          <Route path="*" element={<Navigate to="/entrar" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
