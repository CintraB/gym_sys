import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Dumbbell } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { mensagemDeErro } from '../lib/api'
import { mascararCpf, somenteDigitos } from '../lib/formato'
import { Botao } from '../components/ui/Botao'
import { Campo } from '../components/ui/Campo'
import { Aviso } from '../components/ui/Aviso'
import { Carregando } from '../components/ui/Carregando'

export default function Login() {
  const { usuario, carregando: carregandoSessao, entrar } = useAuth()
  const [cpf, setCpf] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (carregandoSessao) {
    return <Carregando tela texto="Verificando sessão..." />
  }

  if (usuario) {
    return <Navigate to={usuario.cargo === 'professor' ? '/professor' : '/aluno'} replace />
  }

  const cpfCompleto = somenteDigitos(cpf).length === 11

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await entrar(cpf, senha)
      // A navegação acontece pelo <Navigate> acima assim que o usuário existe.
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível entrar.'))
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 grid size-16 place-items-center rounded-2xl bg-acento/12">
            <Dumbbell className="size-8 text-acento-texto" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Gym Sys</h1>
          <p className="mt-1 text-sm text-texto-suave">Entre para ver seus treinos</p>
        </div>

        <form onSubmit={aoEnviar} className="space-y-4">
          <Campo
            rotulo="CPF"
            inputMode="numeric"
            autoComplete="username"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(mascararCpf(e.target.value))}
            required
          />
          <Campo
            rotulo="Senha"
            type="password"
            autoComplete="current-password"
            placeholder="Sua senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />

          {erro && <Aviso tipo="erro">{erro}</Aviso>}

          <Botao
            type="submit"
            className="w-full"
            carregando={enviando}
            disabled={!cpfCompleto || senha.length === 0}
          >
            Entrar
          </Botao>
        </form>

        <p className="mt-8 text-center text-xs text-texto-suave">
          Esqueceu a senha? Procure seu professor.
        </p>
      </div>
    </div>
  )
}
