import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { api, mensagemDeErro } from '../lib/api'
import { Botao } from './ui/Botao'
import { Campo, Selecao } from './ui/Campo'
import { Aviso } from './ui/Aviso'
import type { Exercicio } from '../types'

/**
 * Cadastra um exercício no catálogo sem sair da montagem do treino.
 *
 * O catálogo vinha fechado no seed: quando faltava um item — aconteceu com
 * "prancha lateral" — o jeito era escrever à mão na ficha de papel. Aqui o
 * professor resolve na hora e o exercício já entra selecionado na linha.
 *
 * O grupo muscular é escolha, não texto livre: digitado, "ABDOMEN" e "abdômen"
 * virariam duas seções no select. Criar grupo novo continua sendo caso de banco.
 */
export function NovoExercicio({
  grupos,
  aoFechar,
  aoCriar,
}: {
  grupos: string[]
  aoFechar: () => void
  aoCriar: (exercicio: Exercicio) => void
}) {
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState(grupos[0] ?? '')
  const [observacao, setObservacao] = useState('')
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
    setEnviando(true)
    try {
      const { data } = await api.post<Exercicio>('/professores/exercicios', {
        nome_exercicio: nome,
        tipo,
        observacao,
      })
      aoCriar(data)
    } catch (e) {
      // O modal continua aberto: em 409 ("já existe nesse grupo") o professor
      // só precisa trocar o grupo, e perder o que digitou seria hostil.
      setErro(mensagemDeErro(e, 'Não foi possível cadastrar o exercício.'))
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
        aria-labelledby="novo-exercicio-titulo"
        onSubmit={(e) => {
          e.preventDefault()
          void salvar()
        }}
        className="relative w-full max-w-sm space-y-4 rounded-2xl border border-borda bg-superficie p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="novo-exercicio-titulo" className="font-semibold">
              Novo exercício
            </h2>
            <p className="mt-1 text-sm text-texto-suave">
              Entra no catálogo e fica disponível para todos os treinos.
            </p>
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

        <Campo
          ref={primeiroCampo}
          rotulo="Nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={90}
          placeholder="PRANCHA LATERAL"
          autoComplete="off"
        />

        <Selecao rotulo="Grupo muscular" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {grupos.map((grupo) => (
            <option key={grupo} value={grupo}>
              {grupo}
            </option>
          ))}
        </Selecao>

        <Campo
          rotulo="Observação (opcional)"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          maxLength={255}
          placeholder="Como executar, cuidados…"
          autoComplete="off"
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
            disabled={nome.trim().length < 2 || !tipo}
          >
            Salvar
          </Botao>
        </div>
      </form>
    </div>,
    document.body,
  )
}
