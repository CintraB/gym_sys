import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { api, mensagemDeErro, tokenArmazenado } from '../../lib/api'
import { mascararCpf, mascararTitulo } from '../../lib/formato'
import { useAuth } from '../../auth/useAuth'
import { Botao } from '../../components/ui/Botao'
import { Campo } from '../../components/ui/Campo'
import { Aviso } from '../../components/ui/Aviso'
import type { UsuarioAdmin } from '../../types'

const PERFIS = [
  { chave: 'aluno', rotulo: 'Aluno' },
  { chave: 'professor', rotulo: 'Professor' },
  { chave: 'admin', rotulo: 'Admin' },
] as const

type ChavePerfil = (typeof PERFIS)[number]['chave']

/**
 * Edita dados e perfis de um usuário.
 *
 * São duas rotas no servidor — dados e perfis — porque as travas de perfil não
 * têm por que atrapalhar quem só quer corrigir um nome. Aqui elas viram um
 * formulário só, e o salvar dispara apenas as que mudaram.
 */
export function EditarUsuario({
  usuario,
  aoFechar,
  aoSalvar,
}: {
  usuario: UsuarioAdmin
  aoFechar: () => void
  aoSalvar: (nome: string) => void
}) {
  const { usuario: eu, atualizarUsuario } = useAuth()
  const [nome, setNome] = useState(usuario.nome)
  const [cpf, setCpf] = useState(mascararCpf(usuario.cpf))
  const [email, setEmail] = useState(usuario.email ?? '')
  const [titulo, setTitulo] = useState(mascararTitulo(usuario.titulo ?? ''))
  const [perfis, setPerfis] = useState<Record<ChavePerfil, boolean>>({
    aluno: usuario.aluno,
    professor: usuario.professor,
    admin: usuario.admin,
  })
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const primeiroCampo = useRef<HTMLInputElement>(null)

  const ehMinhaConta = usuario.id === eu?.id

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

  const dadosMudaram =
    nome !== usuario.nome ||
    cpf.replace(/\D/g, '') !== usuario.cpf ||
    email !== (usuario.email ?? '') ||
    titulo.replace(/\D/g, '') !== (usuario.titulo ?? '')

  const perfisMudaram =
    perfis.aluno !== usuario.aluno ||
    perfis.professor !== usuario.professor ||
    perfis.admin !== usuario.admin

  const semPerfil = !perfis.aluno && !perfis.professor && !perfis.admin

  async function salvar() {
    setErro(null)
    setEnviando(true)

    let dadosSalvos = false
    try {
      if (dadosMudaram) {
        const { data } = await api.put<{ token?: string }>(
          `/admin/usuarios/${usuario.id}`,
          { nome, cpf, email, titulo },
        )

        // Trocar o CPF é trocar o login, e isso derruba todos os tokens
        // anteriores — inclusive o meu, se a conta for a minha. O servidor
        // devolve um token novo só nesse caso.
        //
        // Gravar aqui, e não no fim: a chamada de perfis abaixo já iria com um
        // token invalidado, e o interceptor de 401 encerraria a sessão no meio
        // do salvamento.
        if (data.token) tokenArmazenado.gravar(data.token)
        if (ehMinhaConta) {
          atualizarUsuario({
            nome,
            email,
            cpf: cpf.replace(/\D/g, ''),
            titulo: titulo.replace(/\D/g, ''),
          })
        }
        dadosSalvos = true
      }
      if (perfisMudaram) {
        await api.put(`/admin/usuarios/${usuario.id}/perfis`, perfis)
      }
      aoSalvar(nome)
    } catch (e) {
      // Se os dados passaram e os perfis falharam, dizer isso evita o admin
      // tentar de novo sem entender por que o nome já está certo.
      const motivo = mensagemDeErro(e, 'Não foi possível salvar.')
      setErro(dadosSalvos ? `Os dados foram salvos, mas os perfis não: ${motivo}` : motivo)
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
        aria-labelledby="editar-usuario-titulo"
        onSubmit={(e) => {
          e.preventDefault()
          void salvar()
        }}
        className="relative my-auto w-full max-w-sm space-y-4 rounded-2xl border border-borda bg-superficie p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="editar-usuario-titulo" className="font-semibold">
            Editar usuário
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

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-texto-suave">Perfis</legend>
          {PERFIS.map(({ chave, rotulo }) => {
            // A trava está no servidor; aqui é só para não oferecer um botão
            // que sempre falha.
            const travado = chave === 'admin' && ehMinhaConta

            return (
              <label
                key={chave}
                className={
                  travado
                    ? 'flex cursor-not-allowed items-center gap-2 text-sm text-texto-suave/60'
                    : 'flex w-fit cursor-pointer items-center gap-2 text-sm'
                }
              >
                <input
                  type="checkbox"
                  checked={perfis[chave]}
                  disabled={travado}
                  onChange={(e) => setPerfis((atuais) => ({ ...atuais, [chave]: e.target.checked }))}
                  className="size-4 accent-[var(--color-acento)]"
                />
                {rotulo}
                {travado && (
                  <span className="text-xs">— você não pode retirar o seu próprio</span>
                )}
              </label>
            )
          })}
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
          <Botao
            type="submit"
            className="flex-1"
            carregando={enviando}
            disabled={semPerfil || !nome.trim() || (!dadosMudaram && !perfisMudaram)}
          >
            Salvar
          </Botao>
        </div>
      </form>
    </div>,
    document.body,
  )
}
