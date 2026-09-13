import { useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, CloudOff, LogOut, RefreshCw, Wifi } from 'lucide-react'
import { Botao } from './ui/Botao'
import { Campo } from './ui/Campo'
import { Cartao } from './ui/Cartao'
import { Aviso } from './ui/Aviso'
import { Selo } from './ui/Selo'
import { sincronizacaoDoApp } from '../local/sincronizacao/doApp.js'
import { useAuth } from '../auth/useAuth'

/**
 * Ativa e opera a sincronização com o servidor.
 *
 * Mora no Perfil, ao lado de "Trocar minha senha": é ação de conta, e não uma
 * quarta aba na barra — o app funciona inteiro sem isto, e quem nunca ativar
 * não perde nada.
 */
export function Sincronizacao() {
  const motor = sincronizacaoDoApp()
  const { entrar } = useAuth()
  const [estado, setEstado] = useState(motor.estado())
  const [pendentes, setPendentes] = useState<number | null>(null)
  const [entrando, setEntrando] = useState(false)
  const [cpf, setCpf] = useState('')
  const [senha, setSenha] = useState('')
  const [ocupadoAqui, setOcupadoAqui] = useState(false)
  const [erro, setErro] = useState('')
  const [resumo, setResumo] = useState('')

  useEffect(() => motor.assinar(setEstado), [motor])

  useEffect(() => {
    let valido = true
    motor
      .pendentes()
      .then((linhas) => valido && setPendentes(linhas.length))
      .catch(() => valido && setPendentes(null))
    return () => {
      valido = false
    }
  }, [motor, estado])

  async function confirmarEntrada(evento: FormEvent) {
    evento.preventDefault()
    setErro('')
    setOcupadoAqui(true)
    try {
      const conta = await motor.entrarNaSincronizacao({ cpf, senha })

      // Entrar de novo, por dentro: o recomeço troca a linha do usuário pela do
      // servidor, com o **id de lá**, e o token do app aponta para o id antigo
      // — a próxima requisição viraria 401 e jogaria a pessoa para o login logo
      // depois de ativar. Apareceu no emulador em 13/09/2026.
      //
      // A credencial é a mesma que acabou de ser digitada e validada, e o
      // caminho é o normal do app: token novo, contexto atualizado.
      await entrar(cpf, senha)

      setResumo(`Pronto. Sua ficha veio do servidor: ${conta.exerciciosDaFicha} exercício(s).`)
      setEntrando(false)
      setSenha('')
    } catch (falha) {
      const e = falha as { tipo?: string; message?: string }
      setErro(
        e.tipo === 'rede'
          ? 'Sem conexão com o servidor. Tente quando tiver internet.'
          : (e.message ?? 'Não foi possível ativar a sincronização.'),
      )
    } finally {
      setOcupadoAqui(false)
    }
  }

  async function sincronizarAgora() {
    setErro('')
    setResumo('')
    const resultado = await motor.sincronizar()

    if (resultado.precisaEntrarDeNovo) {
      setErro('Sua sessão de sincronização expirou. Ative de novo.')
      return
    }
    if (resultado.online === false) {
      setErro('Sem conexão. Os treinos continuam guardados aqui e sobem depois.')
      return
    }
    if (resultado.erro) {
      setErro(resultado.erro)
      return
    }
    const enviadas = resultado.enviadas ?? 0
    setResumo(enviadas > 0 ? `${enviadas} treino(s) enviado(s).` : 'Tudo já estava enviado.')
  }

  if (!estado.ligada) {
    return (
      <Cartao className="space-y-4">
        <div>
          <h2 className="font-semibold">Sincronizar com a academia</h2>
          <p className="mt-1 text-sm text-texto-suave">
            Seus treinos passam a aparecer no site, e a ficha vem de lá. Sem ativar, o aplicativo
            continua funcionando normalmente, só neste aparelho.
          </p>
        </div>

        {!entrando ? (
          <Botao onClick={() => setEntrando(true)}>Ativar sincronização</Botao>
        ) : (
          <form onSubmit={confirmarEntrada} className="space-y-4">
            {/* O aviso vem ANTES dos campos: a pessoa precisa saber o que perde
                antes de digitar a senha, e não depois de já ter ativado. */}
            <div className="flex items-start gap-2.5 rounded-xl border border-alerta/30 bg-alerta/10 px-3.5 py-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-alerta" aria-hidden />
              <p className="text-texto">
                Ao ativar, o histórico de treinos guardado <strong>neste aparelho será apagado</strong>{' '}
                e substituído pelo que está no servidor. Os treinos que você fizer daqui em diante
                sobem normalmente.
              </p>
            </div>

            <Campo
              rotulo="CPF"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              inputMode="numeric"
              autoComplete="username"
            />
            <Campo
              rotulo="Senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
            />

            {erro && <Aviso tipo="erro">{erro}</Aviso>}

            <div className="flex gap-2">
              <Botao type="submit" carregando={ocupadoAqui}>
                Confirmar e ativar
              </Botao>
              <Botao variante="secundario" type="button" onClick={() => setEntrando(false)}>
                Cancelar
              </Botao>
            </div>
          </form>
        )}
      </Cartao>
    )
  }

  return (
    <Cartao className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Sincronização</h2>
          <p className="mt-1 text-sm text-texto-suave">
            {pendentes === null
              ? 'Ativa.'
              : pendentes === 0
                ? 'Tudo enviado.'
                : `${pendentes} treino(s) aguardando envio.`}
          </p>
        </div>
        <Selo tom={estado.online === false ? 'neutro' : 'acento'}>
          {estado.online === false ? (
            <>
              <CloudOff className="size-3.5" aria-hidden /> sem rede
            </>
          ) : (
            <>
              <Wifi className="size-3.5" aria-hidden /> conectado
            </>
          )}
        </Selo>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {resumo && <Aviso tipo="sucesso">{resumo}</Aviso>}

      <div className="flex gap-2">
        <Botao onClick={sincronizarAgora} carregando={estado.ocupada}>
          <RefreshCw className="size-4" aria-hidden />
          Sincronizar agora
        </Botao>
        <Botao variante="secundario" onClick={() => motor.sair()}>
          <LogOut className="size-4" aria-hidden /> Desativar
        </Botao>
      </div>
    </Cartao>
  )
}
