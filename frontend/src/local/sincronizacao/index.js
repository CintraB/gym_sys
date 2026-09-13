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
export function criarSincronizacao({ bd, cliente }) {
  const ouvintes = new Set()
  let ocupada = false
  let online = null
  let ultima = null

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
      const pendentes = await sessoesPendentes(bd)
      // Nada a subir não é motivo para acordar a rede: o app chama isto em toda
      // abertura, e a maioria delas não tem sessão nova.
      if (pendentes.length === 0) return { enviadas: 0, repetidas: 0, falhas: 0, online }

      const { token } = tokenGuardado()
      const resultado = await subir(bd, cliente, { token })

      // Online é o que a última tentativa REAL disse. Se tudo o que houve foi
      // falha de rede, o aparelho está offline — mesmo que `subir` não tenha
      // lançado, porque ele engole por sessão para uma não segurar a fila.
      const algoPassou = resultado.enviadas + resultado.repetidas > 0
      online = algoPassou || resultado.falhasDeRede === 0
      ultima = new Date().toISOString()
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
