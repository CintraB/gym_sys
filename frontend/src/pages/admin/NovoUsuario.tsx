import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { api, mensagemDeErro } from '../../lib/api'
import { mascararCpf, mascararTitulo } from '../../lib/formato'
import { Botao } from '../../components/ui/Botao'
import { Campo, CampoSenha } from '../../components/ui/Campo'
import { Aviso } from '../../components/ui/Aviso'

const PERFIS = [
  { chave: 'aluno', rotulo: 'Aluno' },
  { chave: 'professor', rotulo: 'Professor' },
  { chave: 'admin', rotulo: 'Admin' },
] as const

type ChavePerfil = (typeof PERFIS)[number]['chave']

/**
 * Cadastra um usuário já com os perfis definidos.
 *
 * A porta do professor (`POST /professores/alunos`) continua existindo e
 * continua excludente — cria aluno ou professor. Esta é a do admin, onde os
 * três são livres e podem se acumular, porque quem está aqui já podia
 * promover a pessoa logo depois pela tela de edição.
 */
export function NovoUsuario({
  aoFechar,
  aoCriar,
}: {
  aoFechar: () => void
  aoCriar: (nome: string) => void
}) {
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [email, setEmail] = useState('')
  const [titulo, setTitulo] = useState('')
  const [senha, setSenha] = useState('')
  // Aluno já vem marcado: é o cadastro mais comum de longe, e desmarcar custa
  // um toque a menos do que marcar.
  const [perfis, setPerfis] = useState<Record<ChavePerfil, boolean>>({
    aluno: true,
    professor: false,
    admin: false,
  })
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const primeiroCampo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', aoTeclar)

    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    primeiroCampo.current?.focus()

    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflowAnterior
    }
  }, [aoFechar])

  const semPerfil = !perfis.aluno && !perfis.professor && !perfis.admin
  const faltaDado = !nome.trim() || !cpf.trim() || !titulo.trim() || !senha

  async function cadastrar() {
    setErro(null)
    setEnviando(true)
    try {
      // Os dígitos vão sem máscara: o servidor normaliza, mas mandar limpo
      // evita depender disso em duas pontas.
      await api.post('/admin/usuarios', {
        nome,
        cpf: cpf.replace(/\D/g, ''),
        email,
        titulo: titulo.replace(/\D/g, ''),
        senha,
        ...perfis,
      })
      aoCriar(nome)
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível cadastrar.'))
    } finally {
      setEnviando(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-5">
      <button
        type="button"
        aria-label="Fechar"
        onClick={aoFechar}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="novo-usuario-titulo"
        onSubmit={(e) => {
          e.preventDefault()
          void cadastrar()
        }}
        className="relative my-auto w-full max-w-sm space-y-4 rounded-2xl border border-borda bg-superficie p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="novo-usuario-titulo" className="font-semibold">
            Novo usuário
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={aoFechar}
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-texto-suave transition-colors hover:bg-borda/40 hover:text-texto"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <Campo
          ref={primeiroCampo}
          rotulo="Nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <Campo
          rotulo="CPF"
          value={cpf}
          onChange={(e) => setCpf(mascararCpf(e.target.value))}
          inputMode="numeric"
        />
        <Campo
          rotulo="E-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Campo
          rotulo="Título"
          value={titulo}
          onChange={(e) => setTitulo(mascararTitulo(e.target.value))}
          inputMode="numeric"
        />
        {/* CampoSenha pelo mesmo motivo da tela de sincronização: quem digita
            uma senha para outra pessoa precisa poder conferir o que digitou —
            ela vai ser ditada em seguida. */}
        <CampoSenha
          rotulo="Senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="new-password"
          dica="De 8 a 15 caracteres. A pessoa pode trocar depois, no Perfil."
        />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-texto-suave">Perfis</legend>
          {PERFIS.map(({ chave, rotulo }) => (
            <label key={chave} className="flex w-fit cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={perfis[chave]}
                onChange={(e) => setPerfis((atuais) => ({ ...atuais, [chave]: e.target.checked }))}
                className="size-4 accent-[var(--color-acento)]"
              />
              {rotulo}
            </label>
          ))}
          {semPerfil && (
            <p className="text-sm text-perigo">
              O usuário precisa ter ao menos um perfil, senão entra e não alcança tela nenhuma.
            </p>
          )}
        </fieldset>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div className="flex gap-3">
          <Botao type="button" variante="secundario" onClick={aoFechar} className="flex-1">
            Cancelar
          </Botao>
          <Botao type="submit" className="flex-1" carregando={enviando} disabled={semPerfil || faltaDado}>
            Cadastrar
          </Botao>
        </div>
      </form>
    </div>,
    document.body,
  )
}
