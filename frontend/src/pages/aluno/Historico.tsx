import { History } from 'lucide-react'
import { api } from '../../lib/api'
import { useRequisicao } from '../../lib/useRequisicao'
import { formatarData, tempoRelativo } from '../../lib/formato'
import { Cartao } from '../../components/ui/Cartao'
import { Aviso } from '../../components/ui/Aviso'
import { Esqueleto } from '../../components/ui/Carregando'
import { Vazio } from '../../components/ui/Vazio'
import { Selo } from '../../components/ui/Selo'
import type { ItemHistorico } from '../../types'

export default function Historico() {
  const historico = useRequisicao<ItemHistorico[]>(
    () => api.get<ItemHistorico[]>('/alunos/historico').then((r) => r.data),
    [],
  )

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Histórico</h1>
        <p className="mt-1 text-sm text-texto-suave">Todos os treinos que já montaram para você.</p>
      </header>

      {historico.erro && <Aviso tipo="erro">{historico.erro}</Aviso>}

      {historico.carregando ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Esqueleto key={i} className="h-20" />
          ))}
        </div>
      ) : historico.dados?.length ? (
        <ol className="space-y-2">
          {historico.dados.map((item) => (
            <li key={item.id_treino}>
              <Cartao className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{formatarData(item.criado_em)}</p>
                    {item.ativo && <Selo tom="acento">atual</Selo>}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-texto-suave">
                    {Number(item.total_exercicios)} exercícios · {item.nome_professor}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-texto-suave">
                  {tempoRelativo(item.criado_em)}
                </span>
              </Cartao>
            </li>
          ))}
        </ol>
      ) : (
        <Vazio
          icone={History}
          titulo="Sem treinos ainda"
          descricao="Assim que seu professor montar o primeiro treino, ele fica registrado aqui."
        />
      )}
    </div>
  )
}
