import { useState } from 'react'
import { KeyRound, Pencil, Search, Users as IconeUsuarios } from 'lucide-react'
import { api } from '../../lib/api'
import { useRequisicao } from '../../lib/useRequisicao'
import { useDebounce } from '../../lib/useDebounce'
import { contar, mascararCpf } from '../../lib/formato'
import { useAuth } from '../../auth/useAuth'
import { Botao } from '../../components/ui/Botao'
import { Selecao } from '../../components/ui/Campo'
import { Cartao } from '../../components/ui/Cartao'
import { Aviso } from '../../components/ui/Aviso'
import { Esqueleto } from '../../components/ui/Carregando'
import { Selo } from '../../components/ui/Selo'
import { Vazio } from '../../components/ui/Vazio'
import { RedefinirSenha } from './RedefinirSenha'
import { EditarUsuario } from './EditarUsuario'
import type { UsuarioAdmin } from '../../types'

/** Os selos de perfil, na mesma ordem de precedência do cargo principal. */
function perfisDe(usuario: UsuarioAdmin) {
  const perfis: string[] = []
  if (usuario.admin) perfis.push('admin')
  if (usuario.professor) perfis.push('professor')
  if (usuario.aluno) perfis.push('aluno')
  return perfis
}

export default function Usuarios() {
  const { usuario: eu } = useAuth()
  const [busca, setBusca] = useState('')
  const [perfil, setPerfil] = useState('')
  const [status, setStatus] = useState('')
  const [redefinindo, setRedefinindo] = useState<UsuarioAdmin | null>(null)
  const [editando, setEditando] = useState<UsuarioAdmin | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  const buscaAdiada = useDebounce(busca, 300)

  const usuarios = useRequisicao<UsuarioAdmin[]>(
    () =>
      api
        .get<UsuarioAdmin[]>('/admin/usuarios', {
          params: { busca: buscaAdiada || undefined, perfil: perfil || undefined, status: status || undefined },
        })
        .then((r) => r.data),
    [buscaAdiada, perfil, status],
  )

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="mt-1 text-sm text-texto-suave">
          {usuarios.dados
            ? contar(usuarios.dados.length, 'usuário encontrado', 'usuários encontrados')
            : 'Carregando...'}
        </p>
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
            aria-label="Buscar usuário"
            className="h-12 w-full rounded-xl border border-borda bg-superficie pl-11 pr-4 text-texto placeholder:text-texto-suave/60 focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/25"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Selecao rotulo="Perfil" value={perfil} onChange={(e) => setPerfil(e.target.value)}>
            <option value="">Todos</option>
            <option value="admin">Admin</option>
            <option value="professor">Professor</option>
            <option value="aluno">Aluno</option>
          </Selecao>
          <Selecao rotulo="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
          </Selecao>
        </div>
      </div>

      {usuarios.erro && <Aviso tipo="erro">{usuarios.erro}</Aviso>}

      {usuarios.carregando ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Esqueleto key={i} className="h-[72px]" />
          ))}
        </div>
      ) : usuarios.dados?.length ? (
        <ul className="space-y-2">
          {usuarios.dados.map((usuario) => (
            <li key={usuario.id}>
              <Cartao className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{usuario.nome}</p>
                    {!usuario.ativo && <Selo tom="perigo">inativo</Selo>}
                  </div>
                  <p className="mt-0.5 text-sm tabular-nums text-texto-suave">
                    {mascararCpf(usuario.cpf)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {perfisDe(usuario).map((nome) => (
                      <Selo key={nome} tom={nome === 'admin' ? 'acento' : undefined}>
                        {nome}
                      </Selo>
                    ))}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {/* Editar aparece também na própria conta: o admin pode
                      corrigir o próprio nome. É só o perfil de admin que ele
                      não pode tirar de si. */}
                  <Botao
                    variante="secundario"
                    tamanho="sm"
                    onClick={() => {
                      setSucesso(null)
                      setEditando(usuario)
                    }}
                  >
                    <Pencil className="size-4" aria-hidden />
                    Editar
                  </Botao>

                  {/* Para a própria conta o caminho é o Perfil, com a senha
                      atual — a rota de admin recusa e devolve 403. */}
                  {usuario.id !== eu?.id && (
                    <Botao
                      variante="secundario"
                      tamanho="sm"
                      onClick={() => {
                        setSucesso(null)
                        setRedefinindo(usuario)
                      }}
                    >
                      <KeyRound className="size-4" aria-hidden />
                      Senha
                    </Botao>
                  )}
                </div>
              </Cartao>
            </li>
          ))}
        </ul>
      ) : (
        <Vazio
          icone={IconeUsuarios}
          titulo="Nenhum usuário encontrado"
          descricao="Ajuste a busca ou os filtros."
        />
      )}

      {editando && (
        <EditarUsuario
          usuario={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={(nome) => {
            setEditando(null)
            setSucesso(`Dados de ${nome} atualizados.`)
            usuarios.recarregar()
          }}
        />
      )}

      {redefinindo && (
        <RedefinirSenha
          usuario={redefinindo}
          aoFechar={() => setRedefinindo(null)}
          aoRedefinir={(nome) => {
            setRedefinindo(null)
            setSucesso(`Senha de ${nome} redefinida. Passe a senha e peça que ela troque.`)
          }}
        />
      )}
    </div>
  )
}
