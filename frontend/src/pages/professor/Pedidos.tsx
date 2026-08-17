import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ClipboardList, Dumbbell } from 'lucide-react'
import { api, mensagemDeErro } from '../../lib/api'
import { useRequisicao } from '../../lib/useRequisicao'
import { formatarDataHora, mascararCpf, tempoRelativo } from '../../lib/formato'
import { Botao } from '../../components/ui/Botao'
import { Cartao } from '../../components/ui/Cartao'
import { Aviso } from '../../components/ui/Aviso'
import { Esqueleto } from '../../components/ui/Carregando'
import { Vazio } from '../../components/ui/Vazio'
import { Selo } from '../../components/ui/Selo'
import type { Pedido } from '../../types'

export default function Pedidos() {
  const [finalizando, setFinalizando] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const pedidos = useRequisicao<Pedido[]>(
    () => api.get<Pedido[]>('/professores/treino/pedidos').then((r) => r.data),
    [],
  )

  async function finalizar(pedido: Pedido) {
    setErro(null)
    setFinalizando(pedido.id_pedido)
    try {
      await api.post('/professores/treino/pedido/finalizado', { id_pedido: pedido.id_pedido })
      pedidos.recarregar()
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível finalizar o pedido.'))
    } finally {
      setFinalizando(null)
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Pedidos de treino</h1>
        <p className="mt-1 text-sm text-texto-suave">
          Montar o treino do aluno já encerra o pedido automaticamente.
        </p>
      </header>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {pedidos.erro && <Aviso tipo="erro">{pedidos.erro}</Aviso>}

      {pedidos.carregando ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Esqueleto key={i} className="h-32" />
          ))}
        </div>
      ) : pedidos.dados?.length ? (
        <ul className="space-y-3">
          {pedidos.dados.map((pedido) => (
            <li key={pedido.id_pedido}>
              <Cartao className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{pedido.nome_aluno}</p>
                    <p className="mt-0.5 text-sm tabular-nums text-texto-suave">
                      {mascararCpf(pedido.cpf)}
                    </p>
                  </div>
                  <Selo tom="alerta">{tempoRelativo(pedido.criado_em)}</Selo>
                </div>

                {pedido.observacao && (
                  <blockquote className="rounded-xl border-l-2 border-acento/40 bg-superficie-2 px-3.5 py-2.5 text-sm text-texto-suave">
                    {pedido.observacao}
                  </blockquote>
                )}

                <p className="text-xs text-texto-suave">
                  Pedido em {formatarDataHora(pedido.criado_em)}
                </p>

                <div className="flex gap-2">
                  <Link to={`/professor/treino?aluno=${pedido.id_aluno}`} className="flex-1">
                    <Botao className="w-full" tamanho="sm">
                      <Dumbbell className="size-4" aria-hidden />
                      Montar treino
                    </Botao>
                  </Link>
                  <Botao
                    variante="secundario"
                    tamanho="sm"
                    carregando={finalizando === pedido.id_pedido}
                    onClick={() => finalizar(pedido)}
                  >
                    <Check className="size-4" aria-hidden />
                    Finalizar
                  </Botao>
                </div>
              </Cartao>
            </li>
          ))}
        </ul>
      ) : (
        <Vazio
          icone={ClipboardList}
          titulo="Nenhum pedido em aberto"
          descricao="Quando um aluno pedir um treino novo, ele aparece aqui."
        />
      )}
    </div>
  )
}
