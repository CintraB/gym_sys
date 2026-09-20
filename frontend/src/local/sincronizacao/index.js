import { entrar, esquecerToken, tokenGuardado, tokenValido } from './identidade.js'
import { recomecar } from './recomeco.js'
import { sessoesPendentes, subir } from './subida.js'

/**
 * O motor: decide quando rodar, guarda o estado e avisa a tela.
 *
 * Roda ao abrir o app, ao finalizar uma sessão e no botão manual. **Sem serviço
 * em segundo plano** — isso é obra própria, com bateria e permissão do Android
 * no meio.
 *
 * **Como o app sabe que está online:** pela última tentativa real, e não por
 * `navigator.onLine` — que no Android mente, dizendo `true` com Wi-Fi
 * conectado e sem saída para a internet, que é exatamente o caso da academia
 * com portal cativo.
 */
/** Quando o servidor foi tocado pela última vez, com sucesso. */
const CHAVE_CONTATO = 'gymsys.sync.contato'

/**
 * Vinte horas, e não vinte e quatro.
 *
 * Quem abre o app sempre no mesmo horário — e é o caso de quem treina depois
 * do trabalho — ficaria a poucos minutos de completar as 24 h e pularia o dia,
 * abrindo buracos justamente na janela de sete dias que decide a pausa.
 */
const HORAS_ENTRE_CONTATOS = 20

/** A marca vive no localStorage porque precisa sobreviver a fechar o app. */
function contatoRecente(agora = Date.now()) {
  const marca = Date.parse(localStorage.getItem(CHAVE_CONTATO) ?? '')
  if (!Number.isFinite(marca)) return false
  return agora - marca < HORAS_ENTRE_CONTATOS * 60 * 60 * 1000
}

function marcarContato(quando) {
  localStorage.setItem(CHAVE_CONTATO, quando)
}

function ultimoContato() {
  return localStorage.getItem(CHAVE_CONTATO)
}

export function criarSincronizacao({ bd, cliente }) {
  const ouvintes = new Set()
  let ocupada = false
  // `null` é "não sei", e não "offline": o motor nasce assim a cada abertura do
  // app, e só uma tentativa de verdade muda isso. A tela precisa saber a
  // diferença — dizer "conectado" sem nunca ter tentado foi o que escondeu seis
  // dias de servidor pausado em 19/09/2026.
  let online = null
  // A data, ao contrário, sobrevive: é a mesma marca do contato diário, e é o
  // que a tela mostra para a pessoa julgar sozinha se está velha demais.
  let ultima = ultimoContato()

  function estado() {
    return { ligada: tokenValido(), online, ultima, ocupada }
  }

  const avisar = () => ouvintes.forEach((ouvinte) => ouvinte(estado()))

  /**
   * A primeira entrada: troca a credencial por token e recomeça o banco local.
   *
   * Quem chama tem de ter avisado que o histórico local vai embora — decisão
   * dele em 13/09/2026.
   */
  async function entrarNaSincronizacao({ cpf, senha }) {
    const { token } = await entrar(cliente, { cpf, senha })
    const resumo = await recomecar(bd, cliente, { token, senha })
    online = true
    ultima = new Date().toISOString()
    avisar()
    return resumo
  }

  function sair() {
    esquecerToken()
    avisar()
  }

  async function sincronizar() {
    if (ocupada) return { ocupada: true }
    if (!tokenValido()) return { ligada: false }

    // A trava vem ANTES de qualquer `await`: marcada depois, duas chamadas
    // simultâneas — abrir o app e finalizar uma sessão ao mesmo tempo —
    // atravessariam as duas, e a fila subiria duas vezes.
    ocupada = true
    avisar()
    try {
      const { token } = tokenGuardado()

      const pendentes = await sessoesPendentes(bd)
      // Nada a subir ainda rende uma requisição, mas só uma por dia: o plano
      // gratuito do Supabase pausa o projeto que tem "atividade insuficiente"
      // na semana, e sem isto o dia sem treino não gerava requisição nenhuma.
      // Aconteceu em 19/09/2026, com quatro treinos subidos nos seis dias
      // anteriores.
      if (pendentes.length === 0) {
        if (contatoRecente()) return { enviadas: 0, repetidas: 0, falhas: 0, online }

        // A consulta mais barata que a RLS deixa passar: `usuario_le_a_si` dá
        // ao dono do token a própria linha, e é a mesma tabela que o recomeço
        // já lê. Qualquer coisa que devolvesse 403 viraria alarme de política
        // na tela — que é como o app grita "isto é bug".
        await cliente.rest('/usuario?select=id&limit=1', { token })
        online = true
        ultima = new Date().toISOString()
        marcarContato(ultima)
        return { enviadas: 0, repetidas: 0, falhas: 0, online }
      }
      const resultado = await subir(bd, cliente, { token })

      // Online é o que a última tentativa REAL disse. Se tudo o que houve foi
      // falha de rede, o aparelho está offline — mesmo que `subir` não tenha
      // lançado, porque ele engole por sessão para uma não segurar a fila.
      const algoPassou = resultado.enviadas + resultado.repetidas > 0
      online = algoPassou || resultado.falhasDeRede === 0
      ultima = new Date().toISOString()
      // Subir já é atividade para o servidor: no dia de treino o contato do
      // dia sai de graça, e a próxima abertura não gasta uma requisição só
      // para dizer "oi".
      if (online) marcarContato(ultima)
      return { ...resultado, online }
    } catch (erro) {
      if (erro?.tipo === 'credencial') {
        // O token venceu ou foi revogado. Desliga a sincronização e pede para
        // entrar de novo — e **nunca** mexe na sessão do aplicativo, que é
        // outra identidade, contra o banco do aparelho.
        esquecerToken()
        return { precisaEntrarDeNovo: true, online: true }
      }
      if (erro?.tipo === 'rede') {
        online = false
        return { online: false, erro: erro.message }
      }
      // 'politica' e 'servidor' são bug: gritam em vez de sumir em silêncio.
      console.error('[sincronizacao]', erro?.tipo, erro?.message ?? erro)
      return { online: true, erro: erro?.message ?? String(erro) }
    } finally {
      ocupada = false
      avisar()
    }
  }

  return {
    estado,
    assinar: (ouvinte) => {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
    entrarNaSincronizacao,
    sair,
    sincronizar,
    pendentes: () => sessoesPendentes(bd),
  }
}
