import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { LogOut } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { api } from '../lib/api'
import { iniciais, primeiroNome } from '../lib/formato'
import { cn } from '../lib/cn'
import { BotaoTema, SeletorTema } from './ui/SeletorTema'
import { TrocarArea } from './TrocarArea'
import { descreverPerfis, salvarUltimaRota } from '../auth/areas'
import { Painel } from './ui/Painel'
import { Botao } from './ui/Botao'
import { limparTreino } from '../lib/notificacoes'
import { useNotificacaoDeTreino } from '../lib/useNotificacaoDeTreino'
import type { SessaoCompleta } from '../types'

export interface ItemNav {
  para: string
  rotulo: string
  icone: LucideIcon
  distintivo?: number
}

/**
 * Barra inferior no celular, coluna lateral no desktop.
 * A navegação por abas ficava presa em estado local; agora são rotas de
 * verdade, então voltar/atualizar e link direto funcionam.
 */
export function AppShell({ itens, children }: { itens: ItemNav[]; children: React.ReactNode }) {
  const { usuario, sair } = useAuth()
  const { pathname } = useLocation()
  const tituloAtual = itens.find((item) => item.para === pathname)?.rotulo
  const [sessaoAtiva, setSessaoAtiva] = useState<SessaoCompleta | null>(null)

  useEffect(() => {
    salvarUltimaRota(pathname)
  }, [pathname])

  useNotificacaoDeTreino()

  // Sair não derruba a sessão de treino aberta — ela sobrevive por design (é o
  // que permite continuar depois de fechar e reabrir o app). Se o aluno tem
  // uma em andamento, a decisão de finalizar ou descartar é forçada aqui, em
  // vez de deixar o treino pendurado sem ele saber.
  async function aoClicarSair() {
    if (!usuario?.perfis.aluno) {
      sair()
      return
    }
    try {
      const { data } = await api.get<SessaoCompleta | null>('/alunos/treino/sessao')
      if (data) setSessaoAtiva(data)
      else sair()
    } catch {
      sair()
    }
  }

  async function finalizarEDeslogar() {
    await api.post('/alunos/treino/sessao/finalizar')
    await limparTreino()
    setSessaoAtiva(null)
    sair()
  }

  async function descartarEDeslogar() {
    await api.delete('/alunos/treino/sessao')
    await limparTreino()
    setSessaoAtiva(null)
    sair()
  }

  return (
    <div className="min-h-dvh lg:flex">
      {/* Lateral - desktop */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-borda bg-superficie px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          {/* Decorativo: o nome do sistema vem escrito ao lado. */}
          <span className="logo-simbolo size-9 shrink-0" aria-hidden />
          <span className="text-lg font-semibold tracking-tight">Gym Sys</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {itens.map((item) => (
            <LinkLateral key={item.para} item={item} />
          ))}
        </nav>

        <div className="mt-4 border-t border-borda pt-4">
          <div className="mb-3 flex items-center gap-3 px-2">
            <Avatar nome={usuario?.nome ?? ''} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{usuario?.nome}</p>
              {/* Rótulo do papel, não da pessoa: o sistema não guarda gênero,
                  então "Professora" não teria como ser resolvido aqui.
                  descreverPerfis vem de auth/areas, a mesma fonte que decide
                  para onde cada cargo abre — a cascata de ternários que estava
                  aqui não enxergava o admin. */}
              <p className="text-xs text-texto-suave">
                {usuario ? descreverPerfis(usuario).replace('Conta de ', '') : ''}
              </p>
            </div>
          </div>
          <div className="mb-2 px-1">
            <TrocarArea />
          </div>
          <div className="mb-2 px-1">
            <SeletorTema compacto />
          </div>
          <button
            type="button"
            onClick={aoClicarSair}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-texto-suave transition-colors hover:bg-superficie-2 hover:text-perigo"
          >
            <LogOut className="size-4" aria-hidden />
            Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topo - celular */}
        {/*
          `area-segura-superior` no lugar do `pt` da classe: dentro do APK a
          página vai por baixo da barra de status, e sem isso o cabeçalho fica
          embaixo do relógio do sistema. No navegador o inset é zero e o
          resultado é o mesmo de antes.
        */}
        <header className="area-segura-superior sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-borda bg-fundo/90 px-4 pb-3 backdrop-blur-md lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="logo-simbolo size-8 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">
                {tituloAtual ?? 'Gym Sys'}
              </p>
              <p className="truncate text-xs text-texto-suave">
                Olá, {primeiroNome(usuario?.nome ?? '')}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <TrocarArea compacto />
            <BotaoTema />
            <button
              type="button"
              onClick={aoClicarSair}
              aria-label="Sair"
              className="rounded-xl p-2 text-texto-suave transition-colors hover:bg-superficie-2 hover:text-perigo"
            >
              <LogOut className="size-5" aria-hidden />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-10">
          {children}
        </main>
      </div>

      {/* Barra inferior - celular */}
      <nav className="area-segura-inferior fixed inset-x-0 bottom-0 z-30 border-t border-borda bg-superficie/95 px-2 pt-1.5 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {itens.map((item) => (
            <LinkInferior key={item.para} item={item} />
          ))}
        </div>
      </nav>

      <Painel
        aberto={sessaoAtiva !== null}
        aoFechar={() => setSessaoAtiva(null)}
        titulo="Treino em andamento"
        rodape={
          <div className="space-y-2">
            <Botao onClick={finalizarEDeslogar} className="w-full">
              Finalizar e sair
            </Botao>
            <Botao variante="perigo" onClick={descartarEDeslogar} className="w-full">
              Descartar e sair
            </Botao>
          </div>
        }
      >
        <p className="text-sm text-texto-suave">
          Você tem um treino em andamento. Escolha o que fazer com ele antes de sair — ele não
          continua sozinho enquanto você estiver deslogado.
        </p>
      </Painel>
    </div>
  )
}

function Avatar({ nome }: { nome: string }) {
  return (
    <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-acento/15 text-xs font-bold text-acento-texto">
      {iniciais(nome)}
    </div>
  )
}

function Distintivo({ valor }: { valor: number }) {
  return (
    <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-acento px-1.5 py-0.5 text-[11px] font-bold leading-none text-sobre-acento">
      {valor > 99 ? '99+' : valor}
    </span>
  )
}

function LinkLateral({ item }: { item: ItemNav }) {
  const { icone: Icone, rotulo, para, distintivo } = item

  return (
    <NavLink
      to={para}
      end
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
          isActive
            ? 'bg-acento/12 font-medium text-acento-texto'
            : 'text-texto-suave hover:bg-superficie-2 hover:text-texto',
        )
      }
    >
      <Icone className="size-[18px]" aria-hidden />
      {rotulo}
      {Boolean(distintivo) && <Distintivo valor={distintivo!} />}
    </NavLink>
  )
}

function LinkInferior({ item }: { item: ItemNav }) {
  const { icone: Icone, rotulo, para, distintivo } = item

  return (
    <NavLink
      to={para}
      end
      className={({ isActive }) =>
        cn(
          'relative flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] transition-colors',
          isActive ? 'text-acento-texto' : 'text-texto-suave',
        )
      }
    >
      <span className="relative">
        <Icone className="size-[22px]" aria-hidden />
        {Boolean(distintivo) && (
          <span className="absolute -right-2 -top-1.5 grid min-w-4 place-items-center rounded-full bg-acento px-1 text-[10px] font-bold leading-4 text-sobre-acento">
            {distintivo! > 9 ? '9+' : distintivo}
          </span>
        )}
      </span>
      <span className="truncate">{rotulo}</span>
    </NavLink>
  )
}
