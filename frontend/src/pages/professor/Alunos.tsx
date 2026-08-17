import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, Dumbbell, Search, UserPlus, Users } from 'lucide-react'
import { api, mensagemDeErro } from '../../lib/api'
import { useRequisicao } from '../../lib/useRequisicao'
import { mascararCpf, mascararTitulo, somenteDigitos, tempoRelativo } from '../../lib/formato'
import { Botao } from '../../components/ui/Botao'
import { Campo, CampoSenha } from '../../components/ui/Campo'
import { Cartao } from '../../components/ui/Cartao'
import { Aviso } from '../../components/ui/Aviso'
import { Esqueleto } from '../../components/ui/Carregando'
import { Vazio } from '../../components/ui/Vazio'
import { Selo } from '../../components/ui/Selo'
import { Painel } from '../../components/ui/Painel'
import { useDebounce } from '../../lib/useDebounce'
import type { Aluno } from '../../types'

const FORM_VAZIO = { nome: '', cpf: '', email: '', titulo: '', senha: '' }

export default function Alunos() {
  const [busca, setBusca] = useState('')
  const [incluirInativos, setIncluirInativos] = useState(false)
  const [painelAberto, setPainelAberto] = useState(false)
  const [sucesso, setSucesso] = useState<string | null>(null)

  const buscaAdiada = useDebounce(busca, 300)

  const alunos = useRequisicao<Aluno[]>(
    () =>
      api
        .get<Aluno[]>('/professores/alunos', {
          params: { busca: buscaAdiada || undefined, incluirInativos: incluirInativos || undefined },
        })
        .then((r) => r.data),
    [buscaAdiada, incluirInativos],
  )

  async function alternarStatus(aluno: Aluno) {
    const acao = aluno.ativo ? 'desativar' : 'reativar'
    if (aluno.ativo && !confirm(`Desativar ${aluno.nome}? Os treinos dele serão inativados.`)) {
      return
    }

    try {
      await api.put(`/professores/alunos/${acao}`, { cpf: aluno.cpf })
      setSucesso(`${aluno.nome} foi ${aluno.ativo ? 'desativado' : 'reativado'}.`)
      alunos.recarregar()
    } catch (e) {
      alert(mensagemDeErro(e))
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alunos</h1>
          <p className="mt-1 text-sm text-texto-suave">
            {alunos.dados ? `${alunos.dados.length} encontrado(s)` : 'Carregando...'}
          </p>
        </div>
        <Botao onClick={() => setPainelAberto(true)} tamanho="sm" className="shrink-0">
          <UserPlus className="size-4" aria-hidden />
          Novo
        </Botao>
      </header>

      {sucesso && <Aviso tipo="sucesso">{sucesso}</Aviso>}

      <div className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-texto-suave"
            aria-hidden
          />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou CPF"
            aria-label="Buscar aluno"
            className="h-12 w-full rounded-xl border border-borda bg-superficie pl-11 pr-4 text-texto placeholder:text-texto-suave/60 focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/25"
          />
        </div>

        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-texto-suave">
          <input
            type="checkbox"
            checked={incluirInativos}
            onChange={(e) => setIncluirInativos(e.target.checked)}
            className="size-4 accent-[var(--color-acento)]"
          />
          Mostrar inativos
        </label>
      </div>

      {alunos.erro && <Aviso tipo="erro">{alunos.erro}</Aviso>}

      {alunos.carregando ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Esqueleto key={i} className="h-[72px]" />
          ))}
        </div>
      ) : alunos.dados?.length ? (
        <ul className="space-y-2">
          {alunos.dados.map((aluno) => (
            <li key={aluno.id}>
              <Cartao className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{aluno.nome}</p>
                    {!aluno.ativo && <Selo tom="perigo">inativo</Selo>}
                  </div>
                  <p className="mt-0.5 text-sm tabular-nums text-texto-suave">
                    {mascararCpf(aluno.cpf)}
                  </p>
                  <p className="mt-1 text-xs text-texto-suave">
                    {aluno.ultima_sessao ? (
                      <>Treinou {tempoRelativo(aluno.ultima_sessao)}</>
                    ) : (
                      <span className="text-alerta">Nunca treinou pelo app</span>
                    )}
                  </p>
                </div>

                <Link
                  to={`/professor/alunos/${aluno.id}/frequencia`}
                  aria-label={`Frequência de ${aluno.nome}`}
                  className="grid size-10 shrink-0 place-items-center rounded-xl border border-borda text-texto-suave transition-colors hover:border-acento/40 hover:text-acento-texto"
                >
                  <CalendarCheck className="size-4" aria-hidden />
                </Link>

                <Link
                  to={`/professor/treino?aluno=${aluno.id}`}
                  aria-label={`Montar treino para ${aluno.nome}`}
                  className="grid size-10 shrink-0 place-items-center rounded-xl border border-borda text-texto-suave transition-colors hover:border-acento/40 hover:text-acento-texto"
                >
                  <Dumbbell className="size-4" aria-hidden />
                </Link>

                <Botao
                  variante={aluno.ativo ? 'perigo' : 'secundario'}
                  tamanho="sm"
                  onClick={() => alternarStatus(aluno)}
                  className="shrink-0"
                >
                  {aluno.ativo ? 'Desativar' : 'Reativar'}
                </Botao>
              </Cartao>
            </li>
          ))}
        </ul>
      ) : (
        <Vazio
          icone={Users}
          titulo={busca ? 'Nenhum aluno encontrado' : 'Nenhum aluno cadastrado'}
          descricao={
            busca ? 'Tente outro nome ou CPF.' : 'Cadastre o primeiro aluno para começar.'
          }
          acao={
            !busca && (
              <Botao onClick={() => setPainelAberto(true)}>
                <UserPlus className="size-4" aria-hidden />
                Cadastrar aluno
              </Botao>
            )
          }
        />
      )}

      <PainelCadastro
        aberto={painelAberto}
        aoFechar={() => setPainelAberto(false)}
        aoCriar={(nome) => {
          setSucesso(`${nome} cadastrado com sucesso.`)
          setPainelAberto(false)
          alunos.recarregar()
        }}
      />
    </div>
  )
}

function PainelCadastro({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean
  aoFechar: () => void
  aoCriar: (nome: string) => void
}) {
  const [form, setForm] = useState(FORM_VAZIO)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  function atualizar(campo: keyof typeof FORM_VAZIO, valor: string) {
    setForm((atual) => ({ ...atual, [campo]: valor }))
  }

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await api.post('/professores/alunos', {
        ...form,
        cpf: somenteDigitos(form.cpf),
        titulo: somenteDigitos(form.titulo),
      })
      aoCriar(form.nome)
      setForm(FORM_VAZIO)
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível cadastrar.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Painel
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Cadastrar aluno"
      rodape={
        <div className="flex gap-3">
          <Botao variante="secundario" onClick={aoFechar} className="flex-1">
            Cancelar
          </Botao>
          <Botao type="submit" form="form-aluno" carregando={enviando} className="flex-1">
            Cadastrar
          </Botao>
        </div>
      }
    >
      <form id="form-aluno" onSubmit={aoEnviar} className="space-y-4">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <Campo
          rotulo="Nome completo"
          value={form.nome}
          onChange={(e) => atualizar('nome', e.target.value)}
          placeholder="João da Silva"
          required
        />
        <Campo
          rotulo="CPF"
          inputMode="numeric"
          value={form.cpf}
          onChange={(e) => atualizar('cpf', mascararCpf(e.target.value))}
          placeholder="000.000.000-00"
          required
        />
        <Campo
          rotulo="E-mail"
          type="email"
          value={form.email}
          onChange={(e) => atualizar('email', e.target.value)}
          placeholder="joao@exemplo.com"
          required
        />
        <Campo
          rotulo="Título"
          inputMode="numeric"
          value={form.titulo}
          onChange={(e) => atualizar('titulo', mascararTitulo(e.target.value))}
          placeholder="0000 0000 0000"
          dica="12 dígitos"
          required
        />
        <CampoSenha
          rotulo="Senha de acesso"
          value={form.senha}
          onChange={(e) => atualizar('senha', e.target.value)}
          placeholder="Mínimo 6 caracteres"
          dica="O aluno usa CPF + esta senha para entrar."
          required
        />
      </form>
    </Painel>
  )
}
