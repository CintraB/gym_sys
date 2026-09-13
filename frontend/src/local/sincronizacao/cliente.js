/**
 * A saída de rede do app.
 *
 * `fetch`, e não a instância do axios, de propósito: o `api` está com o adapter
 * local instalado (é o que faz as telas falarem com o núcleo dentro do
 * aparelho), e passar por ele traria junto o interceptor de 401 — que derrubaria
 * a sessão do app por causa de um token de sincronização vencido. São duas
 * identidades diferentes, e aqui elas ficam separadas por construção.
 *
 * `buscar` é parâmetro para o teste trocar a rede sem tocar em global.
 */

/** Falha de sincronização, com o tipo que decide o que fazer com ela. */
export class ErroSincronizacao extends Error {
  constructor(tipo, mensagem, detalhe) {
    super(mensagem)
    this.name = 'ErroSincronizacao'
    /** 'rede' | 'credencial' | 'politica' | 'servidor' */
    this.tipo = tipo
    this.detalhe = detalhe
  }
}

function tipoDoStatus(status) {
  if (status === 401) return 'credencial'
  if (status === 403) return 'politica'
  return 'servidor'
}

/**
 * A mensagem que a pessoa vê.
 *
 * O PostgREST responde em inglês e em vocabulário de banco de dados — "JWT
 * issued at future", "permission denied for table usuario". Repassar isso à
 * tela é jogar na pessoa um problema que não é dela e que ela não tem como
 * resolver. Aconteceu no aparelho dele em 13/09/2026.
 *
 * A mensagem do **nosso** servidor passa: a Edge Function responde em `erro`,
 * em português, e ela foi escrita para ser lida ("CPF ou senha incorretos").
 * O texto original fica em `detalhe`, para o log.
 */
function mensagemPara(tipo, dados) {
  if (typeof dados?.erro === 'string') return dados.erro

  if (tipo === 'credencial') return 'Sua sessão de sincronização expirou. Ative de novo.'
  if (tipo === 'politica') return 'O servidor recusou o acesso a esses dados.'
  return 'O servidor não conseguiu responder agora. Tente de novo em instantes.'
}

export function criarCliente({ url, chave, buscar = fetch }) {
  const base = url.replace(/\/$/, '')

  async function pedir(endereco, { token, metodo = 'GET', corpo, perfil = true } = {}) {
    const cabecalhos = { apikey: chave, 'content-type': 'application/json' }
    if (token) cabecalhos.Authorization = `Bearer ${token}`

    // O schema `public` é exposto mas **não** é o padrão deste projeto — a
    // lista de Exposed schemas começa em `graphql_public`, e o PostgREST usa o
    // primeiro. Sem nomear o perfil, toda consulta volta 404 "Could not find
    // the table 'graphql_public.usuario'", que parece tabela inexistente e não
    // schema errado.
    //
    // Nomear em vez de depender da ordem: a ordem é configuração invisível no
    // painel, e o app não deve quebrar se alguém a mexer.
    if (perfil) {
      if (metodo === 'GET') cabecalhos['Accept-Profile'] = 'public'
      else cabecalhos['Content-Profile'] = 'public'
    }

    let resposta
    try {
      resposta = await buscar(endereco, {
        method: metodo,
        headers: cabecalhos,
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      })
    } catch (erro) {
      // `fetch` só rejeita por falha de transporte. É o caso normal do app:
      // sem sinal, Wi-Fi sem saída, servidor fora do ar.
      throw new ErroSincronizacao('rede', 'Sem conexão com o servidor', erro)
    }

    // Texto antes de JSON: um 502 do proxy vem em HTML, e `.json()` estouraria
    // escondendo o status — que é justamente o que decide o tipo do erro.
    const texto = await resposta.text()
    let dados
    try {
      dados = texto ? JSON.parse(texto) : null
    } catch {
      dados = texto
    }

    if (!resposta.ok) {
      const tipo = tipoDoStatus(resposta.status)
      throw new ErroSincronizacao(tipo, mensagemPara(tipo, dados), dados)
    }

    return dados
  }

  return {
    rest: (caminho, opcoes) => pedir(`${base}/rest/v1${caminho}`, opcoes),
    rpc: (nome, argumentos, opcoes = {}) =>
      pedir(`${base}/rest/v1/rpc/${nome}`, { ...opcoes, metodo: 'POST', corpo: argumentos }),
    // Sem token: é ela que emite. O `verify_jwt` da função é `false`.
    //
    // `perfil: false` porque Edge Function não é PostgREST: o header de schema
    // não significa nada ali.
    funcao: (nome, corpo) =>
      pedir(`${base}/functions/v1/${nome}`, { metodo: 'POST', corpo, perfil: false }),
  }
}
