import { useMemo, useState, type FormEvent } from 'react'
import { Check, Dumbbell, Flag, Play, Send, Timer, Trash2 } from 'lucide-react'
import { api, mensagemDeErro } from '../../lib/api'
import { useRequisicao } from '../../lib/useRequisicao'
import { useCronometro } from '../../lib/useCronometro'
import {
  contar,
  descreverSerie,
  formatarCronometro,
  formatarData,
  formatarDuracao,
  rotularBloco,
  tempoRelativo,
} from '../../lib/formato'
import { Abas } from '../../components/ui/Abas'
import { Botao } from '../../components/ui/Botao'
import { AreaTexto } from '../../components/ui/Campo'
import { Cartao } from '../../components/ui/Cartao'
import { Aviso } from '../../components/ui/Aviso'
import { Esqueleto } from '../../components/ui/Carregando'
import { Vazio } from '../../components/ui/Vazio'
import { Selo } from '../../components/ui/Selo'
import { Painel } from '../../components/ui/Painel'
import { cn } from '../../lib/cn'
import type {
  ExercicioDoTreino,
  PedidoProprio,
  SessaoCompleta,
  SessaoExercicio,
  TreinoCompleto,
} from '../../types'

/** Agrupa por grupo muscular preservando a ordem em que os exercícios vêm. */
function agrupar<T extends { tipo: string | null }>(itens: T[]) {
  const mapa = new Map<string, T[]>()
  for (const item of itens) {
    const grupo = item.tipo ?? 'Outros'
    mapa.set(grupo, [...(mapa.get(grupo) ?? []), item])
  }
  return [...mapa.entries()]
}

export default function MeuTreino() {
  const treino = useRequisicao<TreinoCompleto>(
    () => api.get<TreinoCompleto>('/alunos/meutreino').then((r) => r.data),
    [],
  )
  const sessao = useRequisicao<SessaoCompleta | null>(
    () => api.get<SessaoCompleta | null>('/alunos/treino/sessao').then((r) => r.data),
    [],
  )

  if (treino.carregando || sessao.carregando) {
    return (
      <div className="space-y-3">
        <Esqueleto className="h-28" />
        <Esqueleto className="h-24" />
        <Esqueleto className="h-24" />
      </div>
    )
  }

  // Uma sessão aberta manda na tela: quem voltou ao app no meio do treino
  // precisa cair direto no modo de execução.
  if (sessao.dados) {
    return <ModoExecucao dados={sessao.dados} aoMudar={() => sessao.recarregar()} />
  }

  return <ModoLeitura treino={treino} aoIniciar={() => sessao.recarregar()} />
}

/* ------------------------------------------------------------- leitura */

function ModoLeitura({
  treino,
  aoIniciar,
}: {
  treino: ReturnType<typeof useRequisicao<TreinoCompleto>>
  aoIniciar: () => void
}) {
  const [erro, setErro] = useState<string | null>(null)
  const [iniciando, setIniciando] = useState(false)
  const [painelPedido, setPainelPedido] = useState(false)
  const [painelBloco, setPainelBloco] = useState(false)
  const [blocoVisto, setBlocoVisto] = useState<number | null>(null)

  const pedido = useRequisicao<PedidoProprio | null>(
    () => api.get<PedidoProprio | null>('/alunos/pedidotreino').then((r) => r.data),
    [],
  )

  const blocos = treino.dados?.blocos ?? []
  const sugerido = treino.dados?.bloco_sugerido ?? blocos[0]?.id_bloco ?? null

  // A aba abre no bloco sugerido, mas o aluno pode navegar para conferir os
  // outros dias sem que isso mude o que vai iniciar.
  const blocoAtivo = blocos.find((b) => b.id_bloco === (blocoVisto ?? sugerido)) ?? blocos[0]
  const grupos = useMemo(() => agrupar(blocoAtivo?.exercicios ?? []), [blocoAtivo])

  async function iniciar(idBloco: number | null) {
    setErro(null)
    setPainelBloco(false)
    setIniciando(true)
    try {
      await api.post('/alunos/treino/sessao', idBloco ? { id_bloco: idBloco } : {})
      aoIniciar()
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível iniciar o treino.'))
      setIniciando(false)
    }
  }

  return (
    <div className="space-y-5">
      {treino.erro && <Aviso tipo="erro">{treino.erro}</Aviso>}

      {treino.dados?.treino ? (
        <>
          <Cartao className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Meu treino</h1>
                <p className="mt-1 text-sm text-texto-suave">
                  Montado por {treino.dados.treino.nome_professor} em{' '}
                  {formatarData(treino.dados.treino.criado_em)}
                </p>
              </div>
              <Selo tom="acento">{tempoRelativo(treino.dados.treino.criado_em)}</Selo>
            </div>

            {erro && <Aviso tipo="erro">{erro}</Aviso>}

            <Botao
              onClick={() => (blocos.length > 1 ? setPainelBloco(true) : iniciar(null))}
              carregando={iniciando}
              className="w-full"
            >
              <Play className="size-4" aria-hidden />
              Iniciar treino
            </Botao>
            <p className="text-center text-xs text-texto-suave">
              O tempo começa a contar agora e é registrado ao finalizar.
            </p>
          </Cartao>

          {blocos.length > 1 && (
            <Abas
              abas={blocos.map((bloco) => ({
                id: bloco.id_bloco,
                rotulo: rotularBloco(bloco.letra, bloco.nome),
                detalhe: contar(bloco.exercicios.length, 'exercício'),
              }))}
              ativa={blocoAtivo?.id_bloco ?? 0}
              aoTrocar={(id) => setBlocoVisto(Number(id))}
            />
          )}

          {grupos.map(([grupo, exercicios]) => (
            <section key={grupo}>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-texto-suave">
                {grupo}
              </h2>
              <ul className="space-y-2">
                {exercicios.map((exercicio) => (
                  <li key={exercicio.id}>
                    <Cartao>
                      <LinhaLeitura exercicio={exercicio} />
                    </Cartao>
                  </li>
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
            <Botao variante="secundario" onClick={() => setPainelPedido(true)} className="w-full">
              <Send className="size-4" aria-hidden />
              Pedir novo treino
            </Botao>
          </>
        )}
      </Cartao>

      <PainelPedido
        aberto={painelPedido}
        aoFechar={() => setPainelPedido(false)}
        aoEnviar={() => {
          setPainelPedido(false)
          pedido.recarregar()
        }}
      />

      <Painel
        aberto={painelBloco}
        aoFechar={() => setPainelBloco(false)}
        titulo="Qual treino hoje?"
      >
        <ul className="space-y-2">
          {blocos.map((bloco) => (
            <li key={bloco.id_bloco}>
              <button
                type="button"
                onClick={() => iniciar(bloco.id_bloco)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-colors',
                  bloco.id_bloco === sugerido
                    ? 'border-acento/40 bg-acento/[0.08]'
                    : 'border-borda hover:border-borda/80',
                )}
              >
                <span className="min-w-0">
                  <span className="block font-medium">
                    {rotularBloco(bloco.letra, bloco.nome)}
                  </span>
                  <span className="mt-0.5 block text-sm text-texto-suave">
                    {contar(bloco.exercicios.length, 'exercício')}
                  </span>
                </span>
                {bloco.id_bloco === sugerido && <Selo tom="acento">sugerido</Selo>}
              </button>
            </li>
          ))}
        </ul>
      </Painel>
    </div>
  )
}

function LinhaLeitura({ exercicio }: { exercicio: ExercicioDoTreino }) {
  const detalhe = descreverSerie(exercicio.numero_serie, exercicio.repeticoes, exercicio.carga)

  return (
    <>
      <p className="font-medium">{exercicio.nome_exercicio}</p>
      {detalhe && <p className="mt-0.5 text-sm tabular-nums text-texto-suave">{detalhe}</p>}
      {exercicio.observacao_ex_usuario && (
        <p className="mt-1 text-xs text-acento-texto">{exercicio.observacao_ex_usuario}</p>
      )}
    </>
  )
}

/* ------------------------------------------------------------ execução */

function ModoExecucao({ dados, aoMudar }: { dados: SessaoCompleta; aoMudar: () => void }) {
  const [erro, setErro] = useState<string | null>(null)
  const [finalizando, setFinalizando] = useState(false)
  const [confirmarFim, setConfirmarFim] = useState(false)
  const [resumo, setResumo] = useState<SessaoCompleta | null>(null)

  // Marcações otimistas: a caixa responde na hora e a requisição segue atrás.
  // Numa academia a rede oscila, e esperar o servidor a cada toque trava a mão.
  const [otimistas, setOtimistas] = useState<Record<number, boolean>>({})

  const segundos = useCronometro(dados.sessao.iniciado_em)
  const exercicios = dados.exercicios.map((e) => ({
    ...e,
    concluido: otimistas[e.id] ?? e.concluido,
  }))
  const grupos = useMemo(() => agrupar(exercicios), [exercicios])

  const total = exercicios.length
  const feitos = exercicios.filter((e) => e.concluido).length
  const progresso = total > 0 ? Math.round((feitos / total) * 100) : 0

  async function alternar(item: SessaoExercicio, valor: boolean) {
    setOtimistas((atuais) => ({ ...atuais, [item.id]: valor }))
    setErro(null)
    try {
      await api.put(`/alunos/treino/sessao/exercicio/${item.id}`, { concluido: valor })
    } catch (e) {
      // Desfaz a marcação se o servidor recusou.
      setOtimistas((atuais) => ({ ...atuais, [item.id]: !valor }))
      setErro(mensagemDeErro(e, 'Não foi possível salvar a marcação.'))
    }
  }

  async function finalizar() {
    setConfirmarFim(false)
    setFinalizando(true)
    try {
      const { data } = await api.post<SessaoCompleta>('/alunos/treino/sessao/finalizar')
      setResumo(data)
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível finalizar.'))
      setFinalizando(false)
    }
  }

  async function descartar() {
    setConfirmarFim(false)
    try {
      await api.delete('/alunos/treino/sessao')
      aoMudar()
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível descartar.'))
    }
  }

  if (resumo) {
    return <ResumoFinal dados={resumo} aoFechar={aoMudar} />
  }

  return (
    <div className="space-y-5 pb-4">
      {/* Cronômetro grudado no topo: fica visível durante toda a rolagem. */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-borda bg-fundo/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Timer className="size-5 text-acento-texto" aria-hidden />
            <span className="text-2xl font-semibold tabular-nums leading-none">
              {formatarCronometro(segundos)}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            {dados.sessao.bloco_letra && (
              <Selo tom="acento">
                {rotularBloco(dados.sessao.bloco_letra, dados.sessao.bloco_nome)}
              </Selo>
            )}
            <span className="text-sm tabular-nums text-texto-suave">
              {feitos}/{total}
            </span>
          </div>
        </div>

        <div
          className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-superficie-2"
          role="progressbar"
          aria-valuenow={progresso}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progresso do treino"
        >
          <div
            className="h-full rounded-full bg-acento transition-[width] duration-300"
            style={{ width: `${progresso}%` }}
          />
        </div>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {grupos.map(([grupo, itens]) => (
        <section key={grupo}>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-texto-suave">
            {grupo}
          </h2>
          <ul className="space-y-2">
            {itens.map((item) => (
              <LinhaExecucao
                key={item.id}
                item={item}
                aoAlternar={() => alternar(item, !item.concluido)}
              />
            ))}
          </ul>
        </section>
      ))}

      <Botao onClick={() => setConfirmarFim(true)} carregando={finalizando} className="w-full">
        <Flag className="size-4" aria-hidden />
        Finalizar treino
      </Botao>

      <Painel
        aberto={confirmarFim}
        aoFechar={() => setConfirmarFim(false)}
        titulo="Finalizar treino"
        rodape={
          <div className="space-y-2">
            <Botao onClick={finalizar} className="w-full">
              Finalizar e salvar
            </Botao>
            <Botao variante="perigo" onClick={descartar} className="w-full">
              <Trash2 className="size-4" aria-hidden />
              Descartar treino
            </Botao>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <p>
            Tempo: <strong className="tabular-nums">{formatarCronometro(segundos)}</strong>
          </p>
          <p>
            Exercícios feitos:{' '}
            <strong>
              {feitos} de {total}
            </strong>
          </p>
          {feitos < total && (
            <p className="text-texto-suave">
              Você ainda não marcou tudo. Pode finalizar assim mesmo — fica registrado o que fez.
            </p>
          )}
          <p className="text-texto-suave">
            Descartar apaga esta sessão e não registra nada no histórico.
          </p>
        </div>
      </Painel>
    </div>
  )
}

function LinhaExecucao({
  item,
  aoAlternar,
}: {
  item: SessaoExercicio
  aoAlternar: () => void
}) {
  const detalhe = descreverSerie(item.numero_serie, item.repeticoes, item.carga)

  return (
    <li>
      <button
        type="button"
        onClick={aoAlternar}
        aria-pressed={item.concluido}
        className={cn(
          'flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors',
          item.concluido
            ? 'border-acento/40 bg-acento/[0.08]'
            : 'border-borda bg-superficie hover:border-borda/80',
        )}
      >
        <span
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors',
            item.concluido ? 'border-acento bg-acento text-sobre-acento' : 'border-borda',
          )}
          aria-hidden
        >
          {item.concluido && <Check className="size-3.5" strokeWidth={3} />}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate font-medium',
              item.concluido && 'text-texto-suave line-through decoration-texto-suave/50',
            )}
          >
            {item.nome_exercicio}
          </span>
          {detalhe && (
            <span className="mt-0.5 block text-sm tabular-nums text-texto-suave">{detalhe}</span>
          )}
          {item.observacao_ex_usuario && (
            <span className="mt-1 block text-xs text-acento-texto">
              {item.observacao_ex_usuario}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

function ResumoFinal({ dados, aoFechar }: { dados: SessaoCompleta; aoFechar: () => void }) {
  const feitos = dados.exercicios.filter((e) => e.concluido).length

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center space-y-6 text-center">
      <div className="grid size-16 place-items-center rounded-2xl bg-acento/15">
        <Check className="size-8 text-acento-texto" strokeWidth={2.5} aria-hidden />
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Treino concluído</h1>
        <p className="mt-1 text-sm text-texto-suave">Ficou registrado no seu histórico.</p>
      </div>

      <div className="grid w-full max-w-xs grid-cols-2 gap-3">
        <Cartao>
          <p className="text-2xl font-semibold tabular-nums leading-none">
            {formatarDuracao(dados.sessao.duracao_segundos)}
          </p>
          <p className="mt-1.5 text-xs text-texto-suave">Tempo</p>
        </Cartao>
        <Cartao>
          <p className="text-2xl font-semibold tabular-nums leading-none">
            {feitos}/{dados.exercicios.length}
          </p>
          <p className="mt-1.5 text-xs text-texto-suave">Exercícios</p>
        </Cartao>
      </div>

      <Botao onClick={aoFechar} className="w-full max-w-xs">
        Voltar ao treino
      </Botao>
    </div>
  )
}

/* -------------------------------------------------------------- pedido */

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
        <p className="text-xs text-texto-suave">Só é possível ter um pedido em aberto por vez.</p>
      </form>
    </Painel>
  )
}
