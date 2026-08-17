import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarCheck, Timer } from 'lucide-react'
import { api } from '../../lib/api'
import { useRequisicao } from '../../lib/useRequisicao'
import { formatarData, formatarDuracao, rotularBloco, tempoRelativo } from '../../lib/formato'
import { Cartao } from '../../components/ui/Cartao'
import { Aviso } from '../../components/ui/Aviso'
import { Esqueleto } from '../../components/ui/Carregando'
import { Vazio } from '../../components/ui/Vazio'
import type { FrequenciaAluno } from '../../types'

export default function Frequencia() {
  const { id } = useParams()

  const dados = useRequisicao<FrequenciaAluno>(
    () => api.get<FrequenciaAluno>(`/professores/aluno/${id}/sessoes`).then((r) => r.data),
    [id],
  )

  return (
    <div className="space-y-5">
      <Link
        to="/professor/alunos"
        className="inline-flex items-center gap-1.5 text-sm text-texto-suave transition-colors hover:text-texto"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Alunos
      </Link>

      {dados.erro && <Aviso tipo="erro">{dados.erro}</Aviso>}

      {dados.carregando ? (
        <div className="space-y-3">
          <Esqueleto className="h-16" />
          <Esqueleto className="h-24" />
          <Esqueleto className="h-40" />
        </div>
      ) : dados.dados ? (
        <>
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">{dados.dados.aluno.nome}</h1>
            <p className="mt-1 text-sm text-texto-suave">Frequência nos últimos 30 dias</p>
          </header>

          <div className="grid grid-cols-3 gap-3">
            <Cartao>
              <p className="text-2xl font-semibold tabular-nums leading-none">
                {dados.dados.ultimos30dias.sessoes}
              </p>
              <p className="mt-1.5 text-xs text-texto-suave">Treinos</p>
            </Cartao>
            <Cartao>
              <p className="text-2xl font-semibold tabular-nums leading-none">
                {formatarDuracao(dados.dados.ultimos30dias.media_duracao_segundos)}
              </p>
              <p className="mt-1.5 text-xs text-texto-suave">Média</p>
            </Cartao>
            <Cartao>
              <p className="text-lg font-semibold leading-none">
                {dados.dados.ultimos30dias.ultima
                  ? tempoRelativo(dados.dados.ultimos30dias.ultima)
                  : '—'}
              </p>
              <p className="mt-1.5 text-xs text-texto-suave">Último</p>
            </Cartao>
          </div>

          {dados.dados.sessoes.length > 0 ? (
            <ol className="space-y-2">
              {dados.dados.sessoes.map((sessao) => (
                <li key={sessao.id_sessao}>
                  <Cartao className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {formatarData(sessao.iniciado_em)}
                        {sessao.bloco_letra && (
                          <span className="ml-2 text-sm font-normal text-acento-texto">
                            {rotularBloco(sessao.bloco_letra, sessao.bloco_nome)}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-sm text-texto-suave">
                        {sessao.concluidos}/{sessao.total_exercicios} exercícios
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 text-sm tabular-nums text-texto-suave">
                      <Timer className="size-4" aria-hidden />
                      {formatarDuracao(sessao.duracao_segundos)}
                    </div>
                  </Cartao>
                </li>
              ))}
            </ol>
          ) : (
            <Vazio
              icone={CalendarCheck}
              titulo="Nenhum treino registrado"
              descricao="Este aluno ainda não iniciou nenhum treino pelo app."
            />
          )}
        </>
      ) : null}
    </div>
  )
}
