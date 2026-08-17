import { useMemo, useState, type FormEvent } from 'react'
import { Check, Dumbbell, RotateCcw, Send } from 'lucide-react'
import { api, mensagemDeErro } from '../../lib/api'
import { useRequisicao } from '../../lib/useRequisicao'
import { useConclusaoDiaria } from '../../lib/useConclusaoDiaria'
import { descreverSerie, formatarData, tempoRelativo } from '../../lib/formato'
import { Botao } from '../../components/ui/Botao'
import { AreaTexto } from '../../components/ui/Campo'
import { Cartao } from '../../components/ui/Cartao'
import { Aviso } from '../../components/ui/Aviso'
import { Esqueleto } from '../../components/ui/Carregando'
import { Vazio } from '../../components/ui/Vazio'
import { Selo } from '../../components/ui/Selo'
import { Painel } from '../../components/ui/Painel'
import { cn } from '../../lib/cn'
import type { ExercicioDoTreino, PedidoProprio, TreinoCompleto } from '../../types'

export default function MeuTreino() {
  const [painelAberto, setPainelAberto] = useState(false)

  const treino = useRequisicao<TreinoCompleto>(
    () => api.get<TreinoCompleto>('/alunos/meutreino').then((r) => r.data),
    [],
  )
  const pedido = useRequisicao<PedidoProprio | null>(
    () => api.get<PedidoProprio | null>('/alunos/pedidotreino').then((r) => r.data),
    [],
  )

  const { feitos, alternar, limpar } = useConclusaoDiaria(treino.dados?.treino?.id_treino)

  const grupos = useMemo(() => {
    const mapa = new Map<string, ExercicioDoTreino[]>()
    for (const exercicio of treino.dados?.exercicios ?? []) {
      const grupo = exercicio.tipo ?? 'Outros'
      mapa.set(grupo, [...(mapa.get(grupo) ?? []), exercicio])
    }
    return [...mapa.entries()]
  }, [treino.dados])

  const total = treino.dados?.exercicios.length ?? 0
  const concluidos = treino.dados?.exercicios.filter((e) => feitos.has(e.id)).length ?? 0
  const progresso = total > 0 ? Math.round((concluidos / total) * 100) : 0

  if (treino.carregando) {
    return (
      <div className="space-y-3">
        <Esqueleto className="h-28" />
        <Esqueleto className="h-24" />
        <Esqueleto className="h-24" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {treino.erro && <Aviso tipo="erro">{treino.erro}</Aviso>}

      {treino.dados?.treino ? (
        <>
          <Cartao className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Treino atual</h1>
                <p className="mt-1 text-sm text-texto-suave">
                  Montado por {treino.dados.treino.nome_professor} em{' '}
                  {formatarData(treino.dados.treino.criado_em)}
                </p>
              </div>
              <Selo tom="acento">{tempoRelativo(treino.dados.treino.criado_em)}</Selo>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-texto-suave">Progresso de hoje</span>
                <span className="font-medium tabular-nums">
                  {concluidos}/{total}
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-superficie-2"
                role="progressbar"
                aria-valuenow={progresso}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progresso do treino de hoje"
              >
                <div
                  className="h-full rounded-full bg-acento transition-[width] duration-300"
                  style={{ width: `${progresso}%` }}
                />
              </div>
              {concluidos > 0 && (
                <button
                  type="button"
                  onClick={limpar}
                  className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-texto-suave transition-colors hover:text-texto"
                >
                  <RotateCcw className="size-3" aria-hidden />
                  Zerar marcações
                </button>
              )}
            </div>
          </Cartao>

          {grupos.map(([grupo, exercicios]) => (
            <section key={grupo}>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-texto-suave">
                {grupo}
              </h2>
              <ul className="space-y-2">
                {exercicios.map((exercicio) => (
                  <LinhaExercicio
                    key={exercicio.id}
                    exercicio={exercicio}
                    feito={feitos.has(exercicio.id)}
                    aoAlternar={() => alternar(exercicio.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </>
      ) : (
        <Vazio
          icone={Dumbbell}
          titulo="Você ainda não tem treino"
          descricao="Peça um treino ao seu professor. Assim que ele montar, aparece aqui."
        />
      )}

      <Cartao className="space-y-3">
        <h2 className="font-medium">Pedir treino novo</h2>
        {pedido.dados ? (
          <>
            <Aviso tipo="sucesso">
              {`Seu pedido está na fila desde ${formatarData(pedido.dados.criado_em)}.`}
            </Aviso>
            {pedido.dados.observacao && (
              <p className="text-sm text-texto-suave">
                Observação enviada: “{pedido.dados.observacao}”
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-texto-suave">
              Conte ao professor se algo mudou — lesão, objetivo novo, dificuldade num exercício.
            </p>
            <Botao onClick={() => setPainelAberto(true)} className="w-full">
              <Send className="size-4" aria-hidden />
              Pedir novo treino
            </Botao>
          </>
        )}
      </Cartao>

      <PainelPedido
        aberto={painelAberto}
        aoFechar={() => setPainelAberto(false)}
        aoEnviar={() => {
          setPainelAberto(false)
          pedido.recarregar()
        }}
      />
    </div>
  )
}

function LinhaExercicio({
  exercicio,
  feito,
  aoAlternar,
}: {
  exercicio: ExercicioDoTreino
  feito: boolean
  aoAlternar: () => void
}) {
  const detalhe = descreverSerie(exercicio.numero_serie, exercicio.repeticoes, exercicio.carga)

  return (
    <li>
      <button
        type="button"
        onClick={aoAlternar}
        aria-pressed={feito}
        className={cn(
          'flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors',
          feito
            ? 'border-acento/30 bg-acento/[0.07]'
            : 'border-borda bg-superficie hover:border-borda/80',
        )}
      >
        <span
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors',
            feito ? 'border-acento bg-acento text-fundo' : 'border-borda',
          )}
          aria-hidden
        >
          {feito && <Check className="size-3.5" strokeWidth={3} />}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate font-medium',
              feito && 'text-texto-suave line-through decoration-texto-suave/50',
            )}
          >
            {exercicio.nome_exercicio}
          </span>
          {detalhe && (
            <span className="mt-0.5 block text-sm tabular-nums text-texto-suave">{detalhe}</span>
          )}
          {exercicio.observacao_ex_usuario && (
            <span className="mt-1 block text-xs text-acento/80">
              {exercicio.observacao_ex_usuario}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

function PainelPedido({
  aberto,
  aoFechar,
  aoEnviar,
}: {
  aberto: boolean
  aoFechar: () => void
  aoEnviar: () => void
}) {
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await api.post('/alunos/pedidotreino', { observacao })
      setObservacao('')
      aoEnviar()
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível enviar o pedido.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Painel
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Pedir novo treino"
      rodape={
        <div className="flex gap-3">
          <Botao variante="secundario" onClick={aoFechar} className="flex-1">
            Cancelar
          </Botao>
          <Botao type="submit" form="form-pedido" carregando={enviando} className="flex-1">
            Enviar pedido
          </Botao>
        </div>
      }
    >
      <form id="form-pedido" onSubmit={enviar} className="space-y-4">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <AreaTexto
          rotulo="Observação para o professor"
          rows={5}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Ex: dor no joelho esquerdo, quero focar em costas..."
        />
        <p className="text-xs text-texto-suave">
          Só é possível ter um pedido em aberto por vez.
        </p>
      </form>
    </Painel>
  )
}
