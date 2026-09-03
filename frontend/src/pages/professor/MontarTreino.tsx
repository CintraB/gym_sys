import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Dumbbell, Pencil, Plus, Trash2, X } from 'lucide-react'
import { api, mensagemDeErro } from '../../lib/api'
import { useRequisicao } from '../../lib/useRequisicao'
import { contar, descreverSerieCurta, formatarData, rotularBloco } from '../../lib/formato'
import { Botao } from '../../components/ui/Botao'
import { Campo } from '../../components/ui/Campo'
import { SelecaoBuscavel, type OpcaoBuscavel } from '../../components/ui/SelecaoBuscavel'
import { Cartao, TituloSecao } from '../../components/ui/Cartao'
import { Aviso } from '../../components/ui/Aviso'
import { Esqueleto } from '../../components/ui/Carregando'
import { Selo } from '../../components/ui/Selo'
import { Abas } from '../../components/ui/Abas'
import { useConfirmacao } from '../../components/ui/Confirmacao'
import { NovoExercicio } from '../../components/NovoExercicio'
import { cn } from '../../lib/cn'
import type {
  Aluno,
  Bloco,
  Exercicio,
  LinhaBloco,
  LinhaExercicio,
  TreinoCompleto,
} from '../../types'

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

/**
 * Treino salvo → linhas do formulário, carregando os ids.
 *
 * São os ids que fazem o PUT atualizar as linhas em vez de recriá-las: sem
 * eles, o servidor leria tudo como acréscimo e o histórico das sessões
 * apontaria para exercícios desativados.
 */
const paraFormulario = (blocos: Bloco[]): LinhaBloco[] =>
  blocos.map((bloco) => ({
    id_bloco: bloco.id_bloco,
    nome: bloco.nome ?? '',
    exercicios: bloco.exercicios.map((exercicio) => ({
      id: exercicio.id,
      id_exercicio: String(exercicio.id_exercicio),
      numero_serie: String(exercicio.numero_serie),
      repeticoes: exercicio.repeticoes,
      carga: exercicio.carga === null ? '' : String(exercicio.carga),
      observacao_ex_usuario: exercicio.observacao_ex_usuario ?? '',
    })),
  }))

export default function MontarTreino() {
  const [params, setParams] = useSearchParams()
  const idAluno = params.get('aluno') ?? ''

  const [blocos, setBlocos] = useState<LinhaBloco[]>([blocoVazio()])
  const [ativo, setAtivo] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  // Guarda em qual linha o "+ Novo" foi acionado: o exercício recém-criado
  // volta selecionado ali, sem obrigar a procurá-lo no select de 80 itens.
  const [novoExercicioEm, setNovoExercicioEm] = useState<number | null>(null)
  // id do treino sendo editado; null quer dizer "montando um treino novo".
  const [editando, setEditando] = useState<number | null>(null)
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

  // O grupo muscular vira cabeçalho na lista; o filtro por digitação é o que
  // torna 70+ exercícios navegáveis no celular, onde rolar tudo é penoso.
  const opcoesExercicio = useMemo<OpcaoBuscavel[]>(
    () =>
      (exercicios.dados ?? []).map((exercicio) => ({
        valor: exercicio.id_exercicio,
        texto: exercicio.nome_exercicio,
        grupo: exercicio.tipo ?? 'Outros',
      })),
    [exercicios.dados],
  )

  const opcoesAluno = useMemo<OpcaoBuscavel[]>(
    () => (alunos.dados ?? []).map((aluno) => ({ valor: aluno.id, texto: aluno.nome })),
    [alunos.dados],
  )

  // Os grupos que já existem no catálogo, para o formulário de exercício novo
  // sugerir os mesmos em vez de deixar inventar um "PEITORAL" ao lado de "PEITO".
  const gruposMusculares = useMemo(
    () => [...new Set(opcoesExercicio.map((o) => o.grupo ?? 'Outros'))],
    [opcoesExercicio],
  )

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

  function editarTreinoAtual(blocosSalvos: Bloco[], idTreino: number) {
    setBlocos(paraFormulario(blocosSalvos))
    setEditando(idTreino)
    setAtivo(0)
    setErro(null)
    setSucesso(null)
  }

  function sairDaEdicao() {
    setBlocos([blocoVazio()])
    setEditando(null)
    setAtivo(0)
  }

  async function salvar() {
    setErro(null)
    setSucesso(null)
    setEnviando(true)

    // O id só vai quando existe: linha sem id é acréscimo, e o que não for
    // enviado de volta o servidor desativa.
    const corpo = {
      blocos: blocos.map((bloco) => ({
        ...(bloco.id_bloco ? { id_bloco: bloco.id_bloco } : {}),
        nome: bloco.nome.trim() || null,
        exercicios: bloco.exercicios.map((linha) => ({
          ...(linha.id ? { id: linha.id } : {}),
          id_exercicio: Number(linha.id_exercicio),
          numero_serie: Number(linha.numero_serie),
          repeticoes: linha.repeticoes,
          carga: linha.carga === '' ? null : Number(linha.carga),
          observacao_ex_usuario: linha.observacao_ex_usuario,
        })),
      })),
    }

    try {
      if (editando) {
        await api.put(`/professores/treino/${editando}`, corpo)
        setSucesso(`Treino de ${alunoSelecionado?.nome ?? 'o aluno'} atualizado.`)
      } else {
        // O professor vem do token; a letra sai da posição do bloco.
        await api.post('/professores/treino', { id_aluno: Number(idAluno), ...corpo })
        setSucesso(`Treino salvo para ${alunoSelecionado?.nome ?? 'o aluno'}.`)
      }
      sairDaEdicao()
      treinoAtual.recarregar()
    } catch (e) {
      setErro(
        mensagemDeErro(
          e,
          editando
            ? 'Não foi possível salvar as alterações.'
            : 'Não foi possível salvar o treino.',
        ),
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {editando ? 'Editar treino' : 'Montar treino'}
        </h1>
        <p className="mt-1 text-sm text-texto-suave">
          {editando
            ? 'As mudanças valem no mesmo treino, sem substituí-lo. O que já foi executado continua no histórico.'
            : 'Divida em blocos (A, B, C…) para separar os dias. O treino novo substitui o atual e encerra o pedido em aberto do aluno.'}
        </p>
      </header>

      <SelecaoBuscavel
        rotulo="Aluno"
        valor={idAluno}
        aoEscolher={(escolhido) => {
          const valor = String(escolhido)
          setParams(valor ? { aluno: valor } : {}, { replace: true })
          setSucesso(null)
        }}
        opcoes={opcoesAluno}
        placeholder="Selecione um aluno"
        substantivo="aluno"
        // Travado durante a edição: os ids no formulário são do treino deste
        // aluno, e trocar de aluno os mandaria no PUT do treino de outro.
        desabilitado={Boolean(editando)}
      />

      {idAluno && (
        <TreinoVigente
          estado={treinoAtual}
          editando={Boolean(editando)}
          aoEditar={editarTreinoAtual}
        />
      )}

      {idAluno && (
        <section className="space-y-3">
          <TituloSecao
            acao={
              <div className="flex items-center gap-2">
                {editando && (
                  <Botao variante="fantasma" tamanho="sm" onClick={sairDaEdicao}>
                    Cancelar edição
                  </Botao>
                )}
                {blocos.length < MAXIMO_BLOCOS && (
                  <Botao variante="secundario" tamanho="sm" onClick={adicionarBloco}>
                    <Plus className="size-4" aria-hidden />
                    Bloco {LETRAS[blocos.length]}
                  </Botao>
                )}
              </div>
            }
          >
            {editando ? 'Editando o treino atual' : 'Novo treino'}
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

                <div className="space-y-1.5">
                  <div className="flex items-end justify-between gap-3">
                    <span className="text-sm font-medium text-texto-suave">Exercício</span>
                    <button
                      type="button"
                      onClick={() => setNovoExercicioEm(indice)}
                      className="flex items-center gap-1 text-sm font-medium text-acento-texto transition-opacity hover:opacity-80"
                    >
                      <Plus className="size-3.5" aria-hidden />
                      Novo
                    </button>
                  </div>
                  <SelecaoBuscavel
                    valor={linha.id_exercicio}
                    aoEscolher={(escolhido) =>
                      atualizarLinha(indice, 'id_exercicio', String(escolhido))
                    }
                    opcoes={opcoesExercicio}
                    placeholder="Selecione o exercício"
                    substantivo="exercício"
                  />
                </div>

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
            {editando ? 'Salvar alterações' : 'Salvar treino'}{' '}
            {blocos.length > 1 && `(${blocos.length} blocos)`}
          </Botao>
        </section>
      )}

      {novoExercicioEm !== null && (
        <NovoExercicio
          grupos={gruposMusculares}
          aoFechar={() => setNovoExercicioEm(null)}
          aoCriar={(exercicio) => {
            exercicios.definirDados([...(exercicios.dados ?? []), exercicio])
            atualizarLinha(novoExercicioEm, 'id_exercicio', String(exercicio.id_exercicio))
            setNovoExercicioEm(null)
          }}
        />
      )}

      {dialogo}
    </div>
  )
}

function TreinoVigente({
  estado,
  editando,
  aoEditar,
}: {
  estado: ReturnType<typeof useRequisicao<TreinoCompleto | null>>
  editando: boolean
  aoEditar: (blocos: Bloco[], idTreino: number) => void
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
        <div className="flex items-center gap-2">
          <Selo>
            {formatarData(treino.criado_em)} · {treino.nome_professor}
          </Selo>
          {!editando && (
            <Botao
              variante="secundario"
              tamanho="sm"
              onClick={() => aoEditar(blocos, treino.id_treino)}
            >
              <Pencil className="size-3.5" aria-hidden />
              Editar
            </Botao>
          )}
        </div>
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
