import { Link } from 'react-router-dom'
import { ArrowRight, ClipboardList, Dumbbell, UserPlus, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '../../lib/api'
import { useRequisicao } from '../../lib/useRequisicao'
import { useAuth } from '../../auth/useAuth'
import { primeiroNome, tempoRelativo } from '../../lib/formato'
import { Cartao, TituloSecao } from '../../components/ui/Cartao'
import { Esqueleto } from '../../components/ui/Carregando'
import { Aviso } from '../../components/ui/Aviso'
import { Vazio } from '../../components/ui/Vazio'
import { Selo } from '../../components/ui/Selo'
import type { Pedido, Resumo } from '../../types'

export default function Dashboard() {
  const { usuario } = useAuth()

  const resumo = useRequisicao<Resumo>(
    () => api.get<Resumo>('/professores/resumo').then((r) => r.data),
    [],
  )
  const pedidos = useRequisicao<Pedido[]>(
    () => api.get<Pedido[]>('/professores/treino/pedidos').then((r) => r.data),
    [],
  )

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Olá, {primeiroNome(usuario?.nome ?? '')}
        </h1>
        <p className="mt-1 text-sm text-texto-suave">Aqui está o resumo da academia hoje.</p>
      </header>

      {resumo.erro && <Aviso tipo="erro">{resumo.erro}</Aviso>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {resumo.carregando
          ? Array.from({ length: 4 }, (_, i) => <Esqueleto key={i} className="h-24" />)
          : [
              { rotulo: 'Alunos ativos', valor: resumo.dados?.alunos_ativos, icone: Users },
              { rotulo: 'Treinos ativos', valor: resumo.dados?.treinos_ativos, icone: Dumbbell },
              {
                rotulo: 'Pedidos abertos',
                valor: resumo.dados?.pedidos_abertos,
                icone: ClipboardList,
                destaque: Boolean(resumo.dados?.pedidos_abertos),
              },
              { rotulo: 'Inativos', valor: resumo.dados?.alunos_inativos, icone: UserPlus },
            ].map((item) => (
              <Indicador key={item.rotulo} {...item} valor={item.valor ?? 0} />
            ))}
      </div>

      <section>
        <TituloSecao
          acao={
            <Link
              to="/professor/pedidos"
              className="inline-flex items-center gap-1 text-sm text-acento-texto hover:underline"
            >
              Ver todos <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        >
          Pedidos de treino
        </TituloSecao>

        {pedidos.carregando ? (
          <div className="space-y-2">
            <Esqueleto className="h-20" />
            <Esqueleto className="h-20" />
          </div>
        ) : pedidos.dados?.length ? (
          <div className="space-y-2">
            {pedidos.dados.slice(0, 3).map((pedido) => (
              <Cartao key={pedido.id_pedido} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{pedido.nome_aluno}</p>
                  {pedido.observacao && (
                    <p className="mt-0.5 line-clamp-2 text-sm text-texto-suave">
                      {pedido.observacao}
                    </p>
                  )}
                </div>
                <Selo tom="alerta">{tempoRelativo(pedido.criado_em)}</Selo>
              </Cartao>
            ))}
          </div>
        ) : (
          <Vazio
            icone={ClipboardList}
            titulo="Nenhum pedido em aberto"
            descricao="Quando um aluno pedir treino novo, ele aparece aqui."
          />
        )}
      </section>

      <section>
        <TituloSecao>Atalhos</TituloSecao>
        <div className="grid gap-3 sm:grid-cols-2">
          <Atalho
            para="/professor/treino"
            icone={Dumbbell}
            titulo="Montar treino"
            descricao="Escolha o aluno e monte a série"
          />
          <Atalho
            para="/professor/alunos"
            icone={UserPlus}
            titulo="Cadastrar aluno"
            descricao="Adicione um novo aluno à academia"
          />
        </div>
      </section>
    </div>
  )
}

function Indicador({
  rotulo,
  valor,
  icone: Icone,
  destaque = false,
}: {
  rotulo: string
  valor: number
  icone: LucideIcon
  destaque?: boolean
}) {
  return (
    <Cartao className="flex flex-col justify-between gap-3">
      <Icone className={destaque ? 'size-5 text-acento-texto' : 'size-5 text-texto-suave'} aria-hidden />
      <div>
        <p className="text-2xl font-semibold tabular-nums leading-none">{valor}</p>
        <p className="mt-1.5 text-xs text-texto-suave">{rotulo}</p>
      </div>
    </Cartao>
  )
}

function Atalho({
  para,
  icone: Icone,
  titulo,
  descricao,
}: {
  para: string
  icone: LucideIcon
  titulo: string
  descricao: string
}) {
  return (
    <Link
      to={para}
      className="flex items-center gap-4 rounded-2xl border border-borda bg-superficie p-4 transition-colors hover:border-acento/40 hover:bg-superficie-2"
    >
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-acento/12">
        <Icone className="size-5 text-acento-texto" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{titulo}</p>
        <p className="truncate text-sm text-texto-suave">{descricao}</p>
      </div>
      <ArrowRight className="size-4 shrink-0 text-texto-suave" aria-hidden />
    </Link>
  )
}
