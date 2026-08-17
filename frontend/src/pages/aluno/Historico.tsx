import { useState } from 'react'
import { Check, History, Timer, X } from 'lucide-react'
import { api } from '../../lib/api'
import { useRequisicao } from '../../lib/useRequisicao'
import {
  descreverSerie,
  formatarData,
  formatarDataHora,
  formatarDuracao,
  tempoRelativo,
} from '../../lib/formato'
import { Cartao } from '../../components/ui/Cartao'
import { Aviso } from '../../components/ui/Aviso'
import { Carregando, Esqueleto } from '../../components/ui/Carregando'
import { Vazio } from '../../components/ui/Vazio'
import { Painel } from '../../components/ui/Painel'
import { cn } from '../../lib/cn'
import type { ItemHistoricoSessao, SessaoCompleta } from '../../types'

export default function Historico() {
  const [sessaoAberta, setSessaoAberta] = useState<number | null>(null)

  const sessoes = useRequisicao<ItemHistoricoSessao[]>(
    () => api.get<ItemHistoricoSessao[]>('/alunos/sessoes').then((r) => r.data),
    [],
  )

  const totalTempo = (sessoes.dados ?? []).reduce((soma, s) => soma + (s.duracao_segundos ?? 0), 0)

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Histórico</h1>
        <p className="mt-1 text-sm text-texto-suave">Os treinos que você já fez.</p>
      </header>

      {sessoes.erro && <Aviso tipo="erro">{sessoes.erro}</Aviso>}

      {sessoes.carregando ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Esqueleto key={i} className="h-20" />
          ))}
        </div>
      ) : sessoes.dados?.length ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Cartao>
              <p className="text-2xl font-semibold tabular-nums leading-none">
                {sessoes.dados.length}
              </p>
              <p className="mt-1.5 text-xs text-texto-suave">Treinos feitos</p>
            </Cartao>
            <Cartao>
              <p className="text-2xl font-semibold tabular-nums leading-none">
                {formatarDuracao(totalTempo)}
              </p>
              <p className="mt-1.5 text-xs text-texto-suave">Tempo total</p>
            </Cartao>
          </div>

          <ol className="space-y-2">
            {sessoes.dados.map((sessao) => (
              <li key={sessao.id_sessao}>
                <button
                  type="button"
                  onClick={() => setSessaoAberta(sessao.id_sessao)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-borda bg-superficie p-4 text-left transition-colors hover:border-acento/40"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{formatarData(sessao.iniciado_em)}</p>
                    <p className="mt-0.5 text-sm text-texto-suave">
                      {sessao.concluidos}/{sessao.total_exercicios} exercícios ·{' '}
                      {sessao.nome_professor}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-sm tabular-nums text-texto-suave">
                    <Timer className="size-4" aria-hidden />
                    {formatarDuracao(sessao.duracao_segundos)}
                  </div>
                </button>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <Vazio
          icone={History}
          titulo="Nenhum treino registrado"
          descricao="Toque em Iniciar treino na aba Meu treino. Ao finalizar, ele aparece aqui."
        />
      )}

      <DetalheSessao id={sessaoAberta} aoFechar={() => setSessaoAberta(null)} />
    </div>
  )
}

function DetalheSessao({ id, aoFechar }: { id: number | null; aoFechar: () => void }) {
  const detalhe = useRequisicao<SessaoCompleta | null>(
    () => (id ? api.get<SessaoCompleta>(`/alunos/sessoes/${id}`).then((r) => r.data) : Promise.resolve(null)),
    [id],
  )

  return (
    <Painel aberto={id !== null} aoFechar={aoFechar} titulo="Detalhe do treino">
      {detalhe.carregando ? (
        <Carregando />
      ) : detalhe.dados ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-texto-suave">
            <Timer className="size-4" aria-hidden />
            <span className="tabular-nums">
              {formatarDuracao(detalhe.dados.sessao.duracao_segundos)}
            </span>
            <span aria-hidden>·</span>
            <span>{formatarDataHora(detalhe.dados.sessao.iniciado_em)}</span>
            <span aria-hidden>·</span>
            <span>{tempoRelativo(detalhe.dados.sessao.iniciado_em)}</span>
          </div>

          <ul className="space-y-2">
            {detalhe.dados.exercicios.map((exercicio) => {
              const linha = descreverSerie(
                exercicio.numero_serie,
                exercicio.repeticoes,
                exercicio.carga,
              )
              return (
                <li
                  key={exercicio.id}
                  className="flex items-start gap-3 rounded-xl border border-borda p-3"
                >
                  <span
                    className={cn(
                      'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full',
                      exercicio.concluido
                        ? 'bg-acento text-sobre-acento'
                        : 'bg-superficie-2 text-texto-suave',
                    )}
                    aria-hidden
                  >
                    {exercicio.concluido ? (
                      <Check className="size-3" strokeWidth={3} />
                    ) : (
                      <X className="size-3" strokeWidth={3} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-sm font-medium',
                        !exercicio.concluido && 'text-texto-suave',
                      )}
                    >
                      {exercicio.nome_exercicio}
                    </span>
                    {linha && (
                      <span className="block text-xs tabular-nums text-texto-suave">{linha}</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </Painel>
  )
}
