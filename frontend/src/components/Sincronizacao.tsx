import { useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, Cloud, CloudOff, LogOut, RefreshCw, Wifi } from 'lucide-react'
import { Botao } from './ui/Botao'
import { Campo, CampoSenha } from './ui/Campo'
import { Cartao } from './ui/Cartao'
import { Aviso } from './ui/Aviso'
import { Selo } from './ui/Selo'
import { formatarDataHora, tempoRelativo } from '../lib/formato'
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
      console.error('[sincronizacao] ativar:', e)

      if (e.tipo === 'rede') {
        setErro('Sem conexão com o servidor. Tente quando tiver internet.')
      } else if (e.tipo) {
        // Veio do cliente, já em português e escrito para ser lido.
        setErro(e.message ?? 'Não foi possível ativar a sincronização.')
      } else {
        // Qualquer outra coisa é erro técnico — do SQLite, do driver, de um
        // campo que mudou de nome. "run: FOREIGN KEY constraint failed (code
        // 787)" chegou assim na tela dele em 13/09/2026, e não há nada que a
        // pessoa possa fazer com isso. O detalhe fica no console.
        setErro('Não foi possível ativar a sincronização. Tente de novo.')
      }
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
              {/* Dizia "e substituído pelo que está no servidor", e o recomeço
                  não desce sessão nenhuma: ele apaga as três tabelas de sessão
                  e repõe identidade, catálogo e ficha. Ele ativou em
                  20/09/2026 esperando os treinos de volta. Enquanto a leva 4
                  não existir, o aviso tem de dizer o que de fato acontece. */}
              <p className="text-texto">
                Ao ativar, o histórico de treinos guardado <strong>neste aparelho será apagado</strong>{' '}
                e sua ficha passa a vir do servidor. Os treinos já registrados{' '}
                <strong>não voltam para cá</strong> — eles continuam guardados no site. Os treinos
                que você fizer daqui em diante sobem normalmente.
              </p>
            </div>

            <Campo
              rotulo="CPF"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              inputMode="numeric"
              autoComplete="username"
            />
            {/* CampoSenha, e não Campo com type="password": ele traz o olho de
                mostrar e o aviso de Caps Lock, que é o mesmo que a tela de
                login oferece. Aqui a senha é digitada de memória e sem
                gerenciador — não ter como conferir o que se digitou faz a
                pessoa errar e culpar a sincronização. */}
            <CampoSenha
              rotulo="Senha"
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
          {/* A data é o que permite desconfiar sozinho: "tudo enviado" com a
              última subida de duas semanas atrás diz muito mais do que
              qualquer selo. */}
          <p className="mt-0.5 text-xs text-texto-suave">
            {estado.ultima
              ? `Último contato com o servidor: ${tempoRelativo(estado.ultima)} (${formatarDataHora(estado.ultima)}).`
              : 'Nunca sincronizado.'}
          </p>
        </div>
        {/* Três estados, e não dois: `online` nasce `null` a cada abertura do
            app e só uma tentativa de verdade o resolve. Tratar `null` como
            "conectado" — o que esta tela fazia — é afirmar o que ninguém
            verificou, e foi assim que o projeto ficou seis dias pausado sem
            que nada na tela mudasse. */}
        <Selo tom={estado.online === true ? 'acento' : 'neutro'}>
          {estado.online === true ? (
            <>
              <Wifi className="size-3.5" aria-hidden /> conectado
            </>
          ) : estado.online === false ? (
            <>
              <CloudOff className="size-3.5" aria-hidden /> sem rede
            </>
          ) : (
            <>
              <Cloud className="size-3.5" aria-hidden /> não verificado
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
