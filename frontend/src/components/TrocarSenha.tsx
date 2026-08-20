import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { api, mensagemDeErro, tokenArmazenado } from '../lib/api'
import { Botao } from './ui/Botao'
import { CampoSenha } from './ui/Campo'
import { Aviso } from './ui/Aviso'

/**
 * Troca a senha do próprio usuário.
 *
 * O servidor devolve um token novo porque a troca derruba todas as sessões
 * anteriores — inclusive esta. Sem gravar o token da resposta, quem acabou de
 * trocar a senha cairia no login na requisição seguinte.
 */
export function TrocarSenha({ aoFechar }: { aoFechar: () => void }) {
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)
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

    // Conferir aqui evita gastar uma ida ao servidor por um erro de digitação
    // que o próprio formulário enxerga.
    if (nova !== repetida) {
      setErro('A repetição não confere com a senha nova.')
      return
    }

    setEnviando(true)
    try {
      const { data } = await api.put<{ token: string }>('/me/senha', {
        senha_atual: atual,
        senha_nova: nova,
      })
      tokenArmazenado.gravar(data.token)
      setSucesso(true)
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível trocar a senha.'))
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
        aria-labelledby="trocar-senha-titulo"
        onSubmit={(e) => {
          e.preventDefault()
          void salvar()
        }}
        className="relative w-full max-w-sm space-y-4 rounded-2xl border border-borda bg-superficie p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="trocar-senha-titulo" className="font-semibold">
            Trocar minha senha
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

        {sucesso ? (
          <>
            <Aviso tipo="sucesso">
              Senha alterada. Os outros aparelhos vão pedir login de novo.
            </Aviso>
            <Botao type="button" onClick={aoFechar} className="w-full">
              Fechar
            </Botao>
          </>
        ) : (
          <>
            <CampoSenha
              ref={primeiroCampo}
              rotulo="Senha atual"
              value={atual}
              onChange={(e) => setAtual(e.target.value)}
              autoComplete="current-password"
            />
            <CampoSenha
              rotulo="Senha nova"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              autoComplete="new-password"
              dica="Ao menos 6 caracteres."
            />
            <CampoSenha
              rotulo="Repita a senha nova"
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
              autoComplete="new-password"
            />

            {erro && <Aviso tipo="erro">{erro}</Aviso>}

            <div className="flex gap-3">
              <Botao type="button" variante="secundario" onClick={aoFechar} className="flex-1">
                Cancelar
              </Botao>
              <Botao
                type="submit"
                className="flex-1"
                carregando={enviando}
                disabled={!atual || nova.length < 6 || !repetida}
              >
                Trocar
              </Botao>
            </div>
          </>
        )}
      </form>
    </div>,
    document.body,
  )
}
