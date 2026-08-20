import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X } from 'lucide-react'
import { api, mensagemDeErro } from '../../lib/api'
import { Botao } from '../../components/ui/Botao'
import { CampoSenha } from '../../components/ui/Campo'
import { Aviso } from '../../components/ui/Aviso'
import type { UsuarioAdmin } from '../../types'

/**
 * Define uma senha temporária para outra pessoa.
 *
 * Não pede a senha atual — é justamente o caso de quem esqueceu. A conta do
 * próprio admin não passa por aqui: para ela o caminho é o "Trocar minha
 * senha" do Perfil, com a senha atual, e o servidor recusa esta rota com 403.
 */
export function RedefinirSenha({
  usuario,
  aoFechar,
  aoRedefinir,
}: {
  usuario: UsuarioAdmin
  aoFechar: () => void
  aoRedefinir: (nome: string) => void
}) {
  const [nova, setNova] = useState('')
  const [repetida, setRepetida] = useState('')
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

  async function salvar() {
    setErro(null)

    if (nova !== repetida) {
      setErro('A repetição não confere com a senha nova.')
      return
    }

    setEnviando(true)
    try {
      await api.put(`/admin/usuarios/${usuario.id}/senha`, { senha_nova: nova })
      aoRedefinir(usuario.nome)
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível redefinir a senha.'))
    } finally {
      setEnviando(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <button
        type="button"
        aria-label="Fechar"
        onClick={aoFechar}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="redefinir-senha-titulo"
        onSubmit={(e) => {
          e.preventDefault()
          void salvar()
        }}
        className="relative w-full max-w-sm space-y-4 rounded-2xl border border-borda bg-superficie p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="redefinir-senha-titulo" className="font-semibold">
              Redefinir senha
            </h2>
            <p className="mt-1 truncate text-sm text-texto-suave">{usuario.nome}</p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={aoFechar}
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-texto-suave transition-colors hover:bg-borda/40 hover:text-texto"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <CampoSenha
          ref={primeiroCampo}
          rotulo="Senha temporária"
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          autoComplete="new-password"
          dica="Ao menos 6 caracteres. Passe a senha à pessoa e peça que ela troque."
        />
        <CampoSenha
          rotulo="Repita a senha"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          autoComplete="new-password"
        />

        {/* Consequência que o admin precisa saber antes de confirmar: se a
            pessoa estiver com o app aberto no celular, vai cair no login.
            Não usa o Aviso, que é role="alert" — isto é informação, não
            alarme, e um alerta que aparece antes de qualquer ação vira ruído
            para quem usa leitor de tela. */}
        <p className="flex items-start gap-2.5 rounded-xl border border-alerta/30 bg-alerta/10 px-3.5 py-3 text-sm text-texto">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-alerta" aria-hidden />
          {usuario.nome} vai precisar entrar de novo em todos os aparelhos.
        </p>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div className="flex gap-3">
          <Botao type="button" variante="secundario" onClick={aoFechar} className="flex-1">
            Cancelar
          </Botao>
          <Botao
            type="submit"
            className="flex-1"
            carregando={enviando}
            disabled={nova.length < 6 || !repetida}
          >
            Redefinir
          </Botao>
        </div>
      </form>
    </div>,
    document.body,
  )
}
