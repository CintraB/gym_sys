import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Dumbbell, Plus, Trash2, X } from 'lucide-react'
import { api, mensagemDeErro } from '../../lib/api'
import { useRequisicao } from '../../lib/useRequisicao'
import { contar, descreverSerieCurta, formatarData, rotularBloco } from '../../lib/formato'
import { Botao } from '../../components/ui/Botao'
import { Campo, Selecao } from '../../components/ui/Campo'
import { Cartao, TituloSecao } from '../../components/ui/Cartao'
import { Aviso } from '../../components/ui/Aviso'
import { Esqueleto } from '../../components/ui/Carregando'
import { Selo } from '../../components/ui/Selo'
import { Abas } from '../../components/ui/Abas'
import { useConfirmacao } from '../../components/ui/Confirmacao'
import { cn } from '../../lib/cn'
import type { Aluno, Exercicio, LinhaBloco, LinhaExercicio, TreinoCompleto } from '../../types'

const LETRAS = 'ABCDEFGH'
const MAXIMO_BLOCOS = 8

const LINHA_VAZIA: LinhaExercicio = {
  id_exercicio: '',
  numero_serie: '3',
  repeticoes: '10 a 12',
  carga: '',
  observacao_ex_usuario: '',
}

const blocoVazio = (): LinhaBloco => ({ nome: '', exercicios: [{ ...LINHA_VAZIA }] })

export default function MontarTreino() {
  const [params, setParams] = useSearchParams()
  const idAluno = params.get('aluno') ?? ''

  const [blocos, setBlocos] = useState<LinhaBloco[]>([blocoVazio()])
  const [ativo, setAtivo] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const { confirmar, dialogo } = useConfirmacao()

  const alunos = useRequisicao<Aluno[]>(
    () => api.get<Aluno[]>('/professores/alunos').then((r) => r.data),
    [],
  )
  const exercicios = useRequisicao<Exercicio[]>(
    () => api.get<Exercicio[]>('/professores/exercicios').then((r) => r.data),
    [],
  )
  const treinoAtual = useRequisicao<TreinoCompleto | null>(
    () =>
      idAluno
        ? api.get<TreinoCompleto>(`/professores/aluno/${idAluno}/treino`).then((r) => r.data)
        : Promise.resolve(null),
    [idAluno],
  )

  // O <optgroup> por grupo muscular torna uma lista de 70+ exercícios navegável.
  const porGrupo = useMemo(() => {
    const mapa = new Map<string, Exercicio[]>()
    for (const exercicio of exercicios.dados ?? []) {
      const grupo = exercicio.tipo ?? 'Outros'
      mapa.set(grupo, [...(mapa.get(grupo) ?? []), exercicio])
    }
    return [...mapa.entries()]
  }, [exercicios.dados])

  const alunoSelecionado = alunos.dados?.find((a) => String(a.id) === idAluno)
  const blocoAtual = blocos[ativo] ?? blocos[0]

  // Só o exercício é obrigatório: cardio entra sem séries, repetições nem carga.
  const podeEnviar =
    Boolean(idAluno) &&
    blocos.length > 0 &&
    blocos.every((b) => b.exercicios.length > 0 && b.exercicios.every((l) => l.id_exercicio))

  function alterarBloco(indice: number, mudanca: Partial<LinhaBloco>) {
    setBlocos((atuais) => atuais.map((b, i) => (i === indice ? { ...b, ...mudanca } : b)))
  }

  function atualizarLinha(indice: number, campo: keyof LinhaExercicio, valor: string) {
    alterarBloco(ativo, {
      exercicios: blocoAtual.exercicios.map((linha, i) =>
        i === indice ? { ...linha, [campo]: valor } : linha,
      ),
    })
  }

  function adicionarBloco() {
    setBlocos((atuais) => [...atuais, blocoVazio()])
    setAtivo(blocos.length)
  }

  async function removerBloco(indice: number) {
    const letra = LETRAS[indice]
    const quantos = blocos[indice].exercicios.length

    const confirmado = await confirmar({
      titulo: `Remover o bloco ${letra}?`,
      mensagem:
        quantos === 1
          ? 'O exercício desse bloco será descartado, e os blocos seguintes são renomeados.'
          : `Os ${quantos} exercícios desse bloco serão descartados, e os blocos seguintes são renomeados.`,
      acao: 'Remover',
      perigo: true,
    })
    if (!confirmado) return

    setBlocos((atuais) => atuais.filter((_, i) => i !== indice))
    setAtivo((atual) => Math.max(0, atual >= indice ? atual - 1 : atual))
  }

  async function salvar() {
    setErro(null)
    setSucesso(null)
    setEnviando(true)
    try {
      // O professor vem do token; a letra sai da posição do bloco.
      await api.post('/professores/treino', {
        id_aluno: Number(idAluno),
        blocos: blocos.map((bloco) => ({
          nome: bloco.nome.trim() || null,
          exercicios: bloco.exercicios.map((linha) => ({
            id_exercicio: Number(linha.id_exercicio),
            numero_serie: Number(linha.numero_serie),
            repeticoes: linha.repeticoes,
            carga: linha.carga === '' ? null : Number(linha.carga),
            observacao_ex_usuario: linha.observacao_ex_usuario,
          })),
        })),
      })
      setSucesso(`Treino salvo para ${alunoSelecionado?.nome ?? 'o aluno'}.`)
      setBlocos([blocoVazio()])
      setAtivo(0)
      treinoAtual.recarregar()
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível salvar o treino.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Montar treino</h1>
        <p className="mt-1 text-sm text-texto-suave">
          Divida em blocos (A, B, C…) para separar os dias. O treino novo substitui o atual e
          encerra o pedido em aberto do aluno.
        </p>
      </header>

      <Selecao
        rotulo="Aluno"
        value={idAluno}
        onChange={(e) => {
          const valor = e.target.value
          setParams(valor ? { aluno: valor } : {}, { replace: true })
          setSucesso(null)
        }}
      >
        <option value="">Selecione um aluno</option>
        {alunos.dados?.map((aluno) => (
          <option key={aluno.id} value={aluno.id}>
            {aluno.nome}
          </option>
        ))}
      </Selecao>

      {idAluno && <TreinoVigente estado={treinoAtual} />}

      {idAluno && (
        <section className="space-y-3">
          <TituloSecao
            acao={
              blocos.length < MAXIMO_BLOCOS && (
                <Botao variante="secundario" tamanho="sm" onClick={adicionarBloco}>
                  <Plus className="size-4" aria-hidden />
                  Bloco {LETRAS[blocos.length]}
                </Botao>
              )
            }
          >
            Novo treino
          </TituloSecao>

          <Abas
            abas={blocos.map((bloco, i) => ({
              id: i,
              rotulo: rotularBloco(LETRAS[i], bloco.nome.trim() || null),
              detalhe: contar(bloco.exercicios.length, 'exercício'),
            }))}
            ativa={ativo}
            aoTrocar={(id) => setAtivo(Number(id))}
          />

          <Cartao className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Campo
                  rotulo={`Nome do bloco ${LETRAS[ativo]}`}
                  value={blocoAtual.nome}
                  onChange={(e) => alterarBloco(ativo, { nome: e.target.value })}
                  placeholder="Ex: Peito e Tríceps"
                  dica={`Opcional — em branco fica só “Treino ${LETRAS[ativo]}”.`}
                />
              </div>
              {blocos.length > 1 && (
                <button
                  type="button"
                  onClick={() => removerBloco(ativo)}
                  aria-label={`Remover bloco ${LETRAS[ativo]}`}
                  className="mb-7 grid size-12 shrink-0 place-items-center rounded-xl border border-perigo/30 text-perigo transition-colors hover:bg-perigo/10"
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
          </Cartao>

          <div className="space-y-3">
            {blocoAtual.exercicios.map((linha, indice) => (
              <Cartao key={indice} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-texto-suave">
                    {LETRAS[ativo]} · exercício {indice + 1}
                  </span>
                  {blocoAtual.exercicios.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remover exercício ${indice + 1}`}
                      onClick={() =>
                        alterarBloco(ativo, {
                          exercicios: blocoAtual.exercicios.filter((_, i) => i !== indice),
                        })
                      }
                      className="rounded-lg p-1.5 text-texto-suave transition-colors hover:bg-perigo/10 hover:text-perigo"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  )}
                </div>

                <Selecao
                  value={linha.id_exercicio}
                  onChange={(e) => atualizarLinha(indice, 'id_exercicio', e.target.value)}
                >
                  <option value="">Selecione o exercício</option>
                  {porGrupo.map(([grupo, lista]) => (
                    <optgroup key={grupo} label={grupo}>
                      {lista.map((exercicio) => (
                        <option key={exercicio.id_exercicio} value={exercicio.id_exercicio}>
                          {exercicio.nome_exercicio}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Selecao>

                <div className="grid grid-cols-3 gap-2">
                  <Campo
                    rotulo="Séries"
                    inputMode="numeric"
                    value={linha.numero_serie}
                    onChange={(e) => atualizarLinha(indice, 'numero_serie', e.target.value)}
                  />
                  <Campo
                    rotulo="Repetições"
                    value={linha.repeticoes}
                    onChange={(e) => atualizarLinha(indice, 'repeticoes', e.target.value)}
                    placeholder="10 a 12"
                  />
                  <Campo
                    rotulo="Carga (kg)"
                    inputMode="decimal"
                    value={linha.carga}
                    onChange={(e) => atualizarLinha(indice, 'carga', e.target.value)}
                    placeholder="20"
                  />
                </div>

                <Campo
                  rotulo="Observação"
                  value={linha.observacao_ex_usuario}
                  onChange={(e) => atualizarLinha(indice, 'observacao_ex_usuario', e.target.value)}
                  placeholder="Ex: pegada média, com isometria"
                />
              </Cartao>
            ))}
          </div>

          <Botao
            variante="secundario"
            onClick={() =>
              alterarBloco(ativo, { exercicios: [...blocoAtual.exercicios, { ...LINHA_VAZIA }] })
            }
            className="w-full"
          >
            <Plus className="size-4" aria-hidden />
            Exercício no bloco {LETRAS[ativo]}
          </Botao>

          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          {sucesso && <Aviso tipo="sucesso">{sucesso}</Aviso>}

          <Botao onClick={salvar} disabled={!podeEnviar} carregando={enviando} className="w-full">
            Salvar treino {blocos.length > 1 && `(${blocos.length} blocos)`}
          </Botao>
        </section>
      )}

      {dialogo}
    </div>
  )
}

function TreinoVigente({
  estado,
}: {
  estado: ReturnType<typeof useRequisicao<TreinoCompleto | null>>
}) {
  const [aberto, setAberto] = useState<number | null>(null)

  if (estado.carregando) {
    return <Esqueleto className="h-24" />
  }

  const treino = estado.dados?.treino
  const blocos = estado.dados?.blocos ?? []

  if (!treino) {
    return (
      <Cartao className="flex items-center gap-3 text-sm text-texto-suave">
        <Dumbbell className="size-4 shrink-0" aria-hidden />
        Este aluno ainda não tem treino ativo.
      </Cartao>
    )
  }

  return (
    <Cartao className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Treino atual</span>
        <Selo>
          {formatarData(treino.criado_em)} · {treino.nome_professor}
        </Selo>
      </div>

      {blocos.map((bloco) => (
        <div key={bloco.id_bloco}>
          <button
            type="button"
            onClick={() => setAberto(aberto === bloco.id_bloco ? null : bloco.id_bloco)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-borda px-3 py-2.5 text-left text-sm transition-colors hover:border-acento/40"
          >
            <span className="font-medium">{rotularBloco(bloco.letra, bloco.nome)}</span>
            <span className="text-texto-suave">{contar(bloco.exercicios.length, 'exercício')}</span>
          </button>

          {aberto === bloco.id_bloco && (
            <ul className="mt-1.5 space-y-1 px-3 text-sm text-texto-suave">
              {bloco.exercicios.map((exercicio) => (
                <li key={exercicio.id} className={cn('flex justify-between gap-3')}>
                  <span className="truncate">{exercicio.nome_exercicio}</span>
                  <span className="shrink-0 tabular-nums">
                    {descreverSerieCurta(
                      exercicio.numero_serie,
                      exercicio.repeticoes,
                      exercicio.carga,
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </Cartao>
  )
}
