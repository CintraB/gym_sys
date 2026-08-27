import { useState } from 'react'
import { Check, History, Timer, X } from 'lucide-react'
import { api } from '../../lib/api'
import { useRequisicao } from '../../lib/useRequisicao'
import {
  descreverSerie,
  formatarData,
  formatarDataHora,
  formatarDuracao,
  formatarSerieRealizada,
  rotularBloco,
  tempoRelativo,
} from '../../lib/formato'
import { Selo } from '../../components/ui/Selo'
import { Cartao } from '../../components/ui/Cartao'
import { Aviso } from '../../components/ui/Aviso'
import { Carregando, Esqueleto } from '../../components/ui/Carregando'
import { Vazio } from '../../components/ui/Vazio'
import { Painel } from '../../components/ui/Painel'
import { cn } from '../../lib/cn'
import type { ItemHistoricoSessao, SessaoCompleta, SessaoExercicio } from '../../types'

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
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{formatarData(sessao.iniciado_em)}</p>
                      {sessao.bloco_letra && (
                        <Selo tom="acento">
                          {rotularBloco(sessao.bloco_letra, sessao.bloco_nome)}
                        </Selo>
                      )}
                    </div>
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

function calcularOrdemETempo(exercicios: SessaoExercicio[], iniciadoEm: string) {
  const concluidos = exercicios
    .filter((e) => e.concluido && e.concluido_em)
    .sort((a, b) => new Date(a.concluido_em!).getTime() - new Date(b.concluido_em!).getTime())
  const mapa = new Map<number, { ordem: number; segundos: number }>()
  let anterior = new Date(iniciadoEm).getTime()
  concluidos.forEach((exercicio, indice) => {
    const agora = new Date(exercicio.concluido_em!).getTime()
    mapa.set(exercicio.id, {
      ordem: indice + 1,
      segundos: Math.max(0, Math.round((agora - anterior) / 1000)),
    })
    anterior = agora
  })
  return mapa
}

function DetalheSessao({ id, aoFechar }: { id: number | null; aoFechar: () => void }) {
  const detalhe = useRequisicao<SessaoCompleta | null>(
    () => (id ? api.get<SessaoCompleta>(`/alunos/sessoes/${id}`).then((r) => r.data) : Promise.resolve(null)),
    [id],
  )

  const ordemETempo = detalhe.dados
    ? calcularOrdemETempo(detalhe.dados.exercicios, detalhe.dados.sessao.iniciado_em)
    : new Map<number, { ordem: number; segundos: number }>()

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

          {(detalhe.dados.sessao.observacao || detalhe.dados.sessao.calorias != null) && (
            <div className="space-y-1 rounded-xl border border-borda bg-superficie-2 p-3 text-sm">
              {detalhe.dados.sessao.observacao && (
                <p className="text-texto">“{detalhe.dados.sessao.observacao}”</p>
              )}
              {detalhe.dados.sessao.calorias != null && (
                <p className="text-texto-suave">{detalhe.dados.sessao.calorias} kcal</p>
              )}
            </div>
          )}

          <ul className="space-y-2">
            {detalhe.dados.exercicios.map((exercicio) => {
              const linha = descreverSerie(
                exercicio.numero_serie,
                exercicio.repeticoes,
                exercicio.carga,
              )
              const info = ordemETempo.get(exercicio.id)
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
                    <span className="flex flex-wrap items-center gap-x-2">
                      <span
                        className={cn(
                          'text-sm font-medium',
                          !exercicio.concluido && 'text-texto-suave',
                        )}
                      >
                        {exercicio.nome_exercicio}
                      </span>
                      {info && (
                        <span className="flex items-center gap-1 text-xs tabular-nums text-texto-suave">
                          <span>{info.ordem}º</span>
                          <span aria-hidden>·</span>
                          <span>{Math.round(info.segundos / 60)} min</span>
                        </span>
                      )}
                    </span>
                    {linha && (
                      <span className="block text-xs tabular-nums text-texto-suave">{linha}</span>
                    )}
                    {exercicio.series.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {exercicio.series.map((serie) => (
                          <span
                            key={serie.id}
                            className="rounded-full bg-superficie-2 px-2 py-0.5 text-xs tabular-nums text-texto-suave"
                          >
                            {formatarSerieRealizada(Number(serie.carga), serie.repeticoes)}
                          </span>
                        ))}
                      </span>
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
