import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Dumbbell, Plus, Trash2 } from 'lucide-react'
import { api, mensagemDeErro } from '../../lib/api'
import { useRequisicao } from '../../lib/useRequisicao'
import { descreverSerieCurta, formatarData } from '../../lib/formato'
import { Botao } from '../../components/ui/Botao'
import { Campo, Selecao } from '../../components/ui/Campo'
import { Cartao, TituloSecao } from '../../components/ui/Cartao'
import { Aviso } from '../../components/ui/Aviso'
import { Esqueleto } from '../../components/ui/Carregando'
import { Selo } from '../../components/ui/Selo'
import type { Aluno, Exercicio, LinhaExercicio, TreinoCompleto } from '../../types'

const LINHA_VAZIA: LinhaExercicio = {
  id_exercicio: '',
  numero_serie: '3',
  repeticoes: '10 a 12',
  carga: '',
  observacao_ex_usuario: '',
}

export default function MontarTreino() {
  const [params, setParams] = useSearchParams()
  const idAluno = params.get('aluno') ?? ''

  const [linhas, setLinhas] = useState<LinhaExercicio[]>([{ ...LINHA_VAZIA }])
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

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

  // O <optgroup> por grupo muscular torna uma lista de 20+ exercícios navegável.
  const porGrupo = useMemo(() => {
    const mapa = new Map<string, Exercicio[]>()
    for (const exercicio of exercicios.dados ?? []) {
      const grupo = exercicio.tipo ?? 'Outros'
      mapa.set(grupo, [...(mapa.get(grupo) ?? []), exercicio])
    }
    return [...mapa.entries()]
  }, [exercicios.dados])

  const alunoSelecionado = alunos.dados?.find((a) => String(a.id) === idAluno)
  // Só o exercício é obrigatório: cardio entra sem séries, repetições nem carga.
  const podeEnviar =
    Boolean(idAluno) && linhas.length > 0 && linhas.every((l) => l.id_exercicio)

  function atualizarLinha(indice: number, campo: keyof LinhaExercicio, valor: string) {
    setLinhas((atuais) =>
      atuais.map((linha, i) => (i === indice ? { ...linha, [campo]: valor } : linha)),
    )
  }

  async function salvar() {
    setErro(null)
    setSucesso(null)
    setEnviando(true)
    try {
      // A API espera id_aluno + exercicios; o professor vem do token.
      await api.post('/professores/treino', {
        id_aluno: Number(idAluno),
        exercicios: linhas.map((linha) => ({
          id_exercicio: Number(linha.id_exercicio),
          numero_serie: Number(linha.numero_serie),
          repeticoes: linha.repeticoes,
          carga: linha.carga === '' ? null : Number(linha.carga),
          observacao_ex_usuario: linha.observacao_ex_usuario,
        })),
      })
      setSucesso(`Treino salvo para ${alunoSelecionado?.nome ?? 'o aluno'}.`)
      setLinhas([{ ...LINHA_VAZIA }])
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
          O treino novo substitui o atual e encerra o pedido em aberto do aluno.
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
        <section>
          <TituloSecao
            acao={
              <Botao
                variante="secundario"
                tamanho="sm"
                onClick={() => setLinhas((atuais) => [...atuais, { ...LINHA_VAZIA }])}
              >
                <Plus className="size-4" aria-hidden />
                Exercício
              </Botao>
            }
          >
            Novo treino
          </TituloSecao>

          <div className="space-y-3">
            {linhas.map((linha, indice) => (
              <Cartao key={indice} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-texto-suave">
                    Exercício {indice + 1}
                  </span>
                  {linhas.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remover exercício ${indice + 1}`}
                      onClick={() => setLinhas((atuais) => atuais.filter((_, i) => i !== indice))}
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

          {erro && (
            <div className="mt-4">
              <Aviso tipo="erro">{erro}</Aviso>
            </div>
          )}
          {sucesso && (
            <div className="mt-4">
              <Aviso tipo="sucesso">{sucesso}</Aviso>
            </div>
          )}

          <Botao
            onClick={salvar}
            disabled={!podeEnviar}
            carregando={enviando}
            className="mt-4 w-full"
          >
            Salvar treino
          </Botao>
        </section>
      )}
    </div>
  )
}

function TreinoVigente({ estado }: { estado: ReturnType<typeof useRequisicao<TreinoCompleto | null>> }) {
  if (estado.carregando) {
    return <Esqueleto className="h-24" />
  }

  const treino = estado.dados?.treino
  if (!treino) {
    return (
      <Cartao className="flex items-center gap-3 text-sm text-texto-suave">
        <Dumbbell className="size-4 shrink-0" aria-hidden />
        Este aluno ainda não tem treino ativo.
      </Cartao>
    )
  }

  return (
    <Cartao>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Treino atual</span>
        <Selo>
          {formatarData(treino.criado_em)} · {treino.nome_professor}
        </Selo>
      </div>
      <ul className="space-y-1.5 text-sm text-texto-suave">
        {estado.dados?.exercicios.map((exercicio) => (
          <li key={exercicio.id} className="flex justify-between gap-3">
            <span className="truncate">{exercicio.nome_exercicio}</span>
            <span className="shrink-0 tabular-nums">
              {descreverSerieCurta(exercicio.numero_serie, exercicio.repeticoes, exercicio.carga)}
            </span>
          </li>
        ))}
      </ul>
    </Cartao>
  )
}
