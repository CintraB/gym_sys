import { LogOut } from 'lucide-react'
import { useAuth } from '../../auth/useAuth'
import { iniciais, mascararCpf } from '../../lib/formato'
import { Botao } from '../../components/ui/Botao'
import { Cartao } from '../../components/ui/Cartao'
import { SeletorTema } from '../../components/ui/SeletorTema'

export default function Perfil() {
  const { usuario, sair } = useAuth()

  const dados = [
    { rotulo: 'CPF', valor: usuario ? mascararCpf(usuario.cpf) : '—' },
    { rotulo: 'E-mail', valor: usuario?.email || '—' },
    { rotulo: 'Perfil', valor: usuario?.cargo === 'professor' ? 'Professor' : 'Aluno' },
  ]

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Perfil</h1>
      </header>

      <Cartao className="flex items-center gap-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-acento/15 text-lg font-bold text-acento-texto">
          {iniciais(usuario?.nome ?? '')}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-medium">{usuario?.nome}</p>
          <p className="text-sm text-texto-suave">Aluno da academia</p>
        </div>
      </Cartao>

      <Cartao className="divide-y divide-borda p-0">
        {dados.map((item) => (
          <div key={item.rotulo} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <span className="text-sm text-texto-suave">{item.rotulo}</span>
            <span className="truncate text-sm font-medium">{item.valor}</span>
          </div>
        ))}
      </Cartao>

      <div className="space-y-2">
        <h2 className="px-1 text-sm font-medium text-texto-suave">Aparência</h2>
        <SeletorTema />
      </div>

      <p className="px-1 text-sm text-texto-suave">
        Para alterar seus dados ou sua senha, fale com seu professor.
      </p>

      <Botao variante="perigo" onClick={sair} className="w-full">
        <LogOut className="size-4" aria-hidden />
        Sair da conta
      </Botao>
    </div>
  )
}
