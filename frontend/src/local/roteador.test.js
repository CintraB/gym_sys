// @vitest-environment node
//
// O nucleo local e codigo de servidor rodando dentro do cliente: nao tem DOM.
// No jsdom o jose recusa a chave que o TextEncoder produz, porque o instanceof
// Uint8Array falha entre o realm do jsdom e o do Node.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { TABELA } from './rotas.js'
import { despachar, escolherRota } from './roteador.js'
import { configurarPool } from './banco.js'

// A partir da raiz do projeto, e nao de import.meta.url: dentro do Vite o
// import.meta.url do modulo transformado nao e uma URL file://, e fileURLToPath
// recusa. O Vitest roda com cwd em frontend/.
const pastaRotas = join(process.cwd(), '..', 'backend', 'src', 'routes')

/**
 * Extrai as rotas registradas nos arquivos do Express, por leitura de texto.
 *
 * Ler o texto, e não importar o Express e inspecionar o router, é de propósito:
 * a introspecção depende de estrutura interna do Express, que muda de versão
 * para versão, e aqui só interessa o que está escrito nos arquivos.
 */
function rotasDoExpress() {
  const prefixos = {
    'alunoRoutes.js': '/alunos',
    'professorRoutes.js': '/professores',
    'adminRoutes.js': '/admin',
    'index.js': '',
  }

  const encontradas = []
  for (const arquivo of readdirSync(pastaRotas)) {
    const prefixo = prefixos[arquivo]
    if (prefixo === undefined) {
      throw new Error(`arquivo de rota novo, sem prefixo declarado neste teste: ${arquivo}`)
    }

    const texto = readFileSync(join(pastaRotas, arquivo), 'utf8')
    for (const achado of texto.matchAll(/rotas\.(get|post|put|delete)\(\s*"([^"]+)"/g)) {
      encontradas.push(`${achado[1].toUpperCase()} ${prefixo}${achado[2]}`)
    }
  }
  return encontradas
}

describe('tabela de rotas do app', () => {
  // Sem este teste, uma rota nova no Express so apareceria como 404 dentro do
  // APK — e seria descoberta em campo, com o telefone na mao.
  it('cobre todas as rotas que o Express registra', () => {
    const doApp = new Set(TABELA.map((r) => `${r.metodo} ${r.caminho}`))
    const faltando = rotasDoExpress().filter((rota) => !doApp.has(rota))

    expect(faltando).toEqual([])
  })

  it('nao inventa rota que o Express nao tem', () => {
    const doExpress = new Set(rotasDoExpress())
    const sobrando = TABELA.map((r) => `${r.metodo} ${r.caminho}`).filter(
      (rota) => !doExpress.has(rota),
    )

    expect(sobrando).toEqual([])
  })

  it('toda rota tem uma acao de verdade', () => {
    for (const rota of TABELA) {
      expect(typeof rota.acao, `${rota.metodo} ${rota.caminho}`).toBe('function')
    }
  })

  // O exigirPerfil do Express vinha do prefixo. Se uma rota de /professores
  // ficasse sem perfil na tabela, um aluno alcancaria a area do professor.
  it('toda rota de area exige o perfil da area', () => {
    for (const rota of TABELA) {
      const area = rota.caminho.split('/')[1]
      if (!['alunos', 'professores', 'admin'].includes(area)) continue

      const esperado = { alunos: 'aluno', professores: 'professor', admin: 'admin' }[area]
      expect(rota.perfil, `${rota.metodo} ${rota.caminho}`).toBe(esperado)
      expect(rota.autenticado, `${rota.metodo} ${rota.caminho}`).toBe(true)
    }
  })
})

/** Banco de teste em SQLite, com o schema e o seed de verdade. */
async function bancoDeTeste() {
  const { criarBancoSqlite } = await import('../../../backend/src/config/sqlite.js')
  const raiz = join(process.cwd(), '..', 'backend', 'db')

  const bd = criarBancoSqlite({ arquivo: ':memory:' })
  bd.aplicarSql(readFileSync(join(raiz, 'schema.sql'), 'utf8'))
  bd.aplicarSql(readFileSync(join(raiz, 'seed.sql'), 'utf8'))
  configurarPool(bd)
  return bd
}

/** Cria um usuario direto no banco e devolve o token dele. */
async function logar(bd, { cpf, aluno = true, professor = false, admin = false }) {
  const { criarHashComSal } = await import('./senha.js')
  const hash = await criarHashComSal('senha123')
  bd.aplicarSql(`
    INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
    VALUES ('${cpf}', 'Pessoa ${cpf}', '${hash}', '${cpf}@t.com', '${cpf}0',
            ${aluno ? 'TRUE' : 'FALSE'}, ${professor ? 'TRUE' : 'FALSE'},
            ${admin ? 'TRUE' : 'FALSE'}, TRUE)
  `)

  const entrada = await despachar({
    metodo: 'POST',
    caminho: '/login',
    corpo: { cpf, senha: 'senha123' },
  })
  if (entrada.status !== 200) throw new Error(`login falhou: ${JSON.stringify(entrada)}`)
  return { token: entrada.corpo.token, cabecalhos: { Authorization: `Bearer ${entrada.corpo.token}` } }
}

describe('despacho sem Express', () => {
  it('responde a rota aberta', async () => {
    const resposta = await despachar({ metodo: 'GET', caminho: '/health' })

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({ status: 'ok' })
  })

  it('caminho desconhecido vira 404 com mensagem, e nao excecao', async () => {
    const resposta = await despachar({ metodo: 'GET', caminho: '/nao/existe' })

    expect(resposta.status).toBe(404)
    expect(resposta.corpo.message).toMatch(/não encontrada/i)
  })

  it('metodo errado no caminho certo tambem e 404', async () => {
    const resposta = await despachar({ metodo: 'DELETE', caminho: '/health' })

    expect(resposta.status).toBe(404)
  })

  it('rota protegida sem token e 401', async () => {
    await bancoDeTeste()

    const resposta = await despachar({ metodo: 'GET', caminho: '/me' })

    expect(resposta.status).toBe(401)
  })

  // O caminho inteiro: controller real, senha em scrypt da borda, banco SQLite.
  // Se isto passa, o nucleo esta de pe.
  it('faz login de verdade e devolve token que abre o /me', async () => {
    const bd = await bancoDeTeste()
    const { cabecalhos } = await logar(bd, { cpf: '11111111111', professor: true, admin: true })

    const meu = await despachar({ metodo: 'GET', caminho: '/me', cabecalhos })

    expect(meu.status).toBe(200)
    expect(meu.corpo.cargo).toBe('admin')
    expect(meu.corpo.cpf).toBe('11111111111')
  })

  it('senha errada e 401, com a mensagem que nao diz qual campo errou', async () => {
    const bd = await bancoDeTeste()
    await logar(bd, { cpf: '11111111111' })

    const resposta = await despachar({
      metodo: 'POST',
      caminho: '/login',
      corpo: { cpf: '11111111111', senha: 'errada' },
    })

    expect(resposta.status).toBe(401)
    expect(resposta.corpo.message).toMatch(/CPF ou senha/i)
  })

  // O exigirPerfil do Express era aplicado no prefixo da rota. Se o roteador
  // esquecer isso, um aluno alcanca a area do professor dentro do APK.
  it('aluno nao alcanca rota de professor', async () => {
    const bd = await bancoDeTeste()
    const { cabecalhos } = await logar(bd, { cpf: '22222222222' })

    const resposta = await despachar({
      metodo: 'GET',
      caminho: '/professores/alunos',
      cabecalhos,
    })

    expect(resposta.status).toBe(403)
  })

  it('extrai o :id do caminho, e recusa id que nao e numero', async () => {
    const bd = await bancoDeTeste()
    const { cabecalhos } = await logar(bd, { cpf: '11111111111', aluno: false, professor: true })

    const inexistente = await despachar({
      metodo: 'GET',
      caminho: '/professores/aluno/4321',
      cabecalhos,
    })
    expect(inexistente.status).toBe(404)

    // O rotas.param do Express recusava id nao numerico com 400, para o "abc"
    // nao chegar ao banco e virar 500 sem explicar nada.
    const invalido = await despachar({
      metodo: 'GET',
      caminho: '/professores/aluno/abc',
      cabecalhos,
    })
    expect(invalido.status).toBe(400)
  })

  it('a query string chega ao controller', async () => {
    const bd = await bancoDeTeste()
    const { cabecalhos } = await logar(bd, { cpf: '11111111111', aluno: false, professor: true })

    const resposta = await despachar({
      metodo: 'GET',
      caminho: '/professores/alunos?busca=zzzznaoexiste',
      cabecalhos,
    })

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual([])
  })

  // Erro que nao e ErroApi nao pode vazar detalhe do banco para a tela.
  it('erro inesperado vira 500 generico', async () => {
    configurarPool({
      query: async () => {
        throw new Error('detalhe interno do banco que nao deve aparecer')
      },
    })

    const resposta = await despachar({
      metodo: 'POST',
      caminho: '/login',
      corpo: { cpf: '11111111111', senha: 'senha123' },
    })

    expect(resposta.status).toBe(500)
    expect(JSON.stringify(resposta.corpo)).not.toMatch(/detalhe interno/)
  })
})

// A prioridade de rota literal sobre rota com parametro, provada com o conflito
// construido: as rotas reais hoje nao tem esse caso, entao testar com elas nao
// prova nada. E defensivo — acrescentar um /treino/pedidos depois de um
// /treino/:id faria o "pedidos" virar id invalido, com um 400 inexplicavel.
describe('escolha de rota', () => {
  const tabela = [
    { metodo: 'GET', caminho: '/coisa/:id', acao: () => 'por parametro' },
    { metodo: 'GET', caminho: '/coisa/especial', acao: () => 'literal' },
  ]

  it('literal ganha de parametro, mesmo declarado depois', () => {
    const achada = escolherRota(tabela, 'GET', '/coisa/especial')

    expect(achada.rota.acao()).toBe('literal')
    expect(achada.params).toEqual({})
  })

  it('o que nao casa com literal cai no parametro', () => {
    const achada = escolherRota(tabela, 'GET', '/coisa/42')

    expect(achada.rota.acao()).toBe('por parametro')
    expect(achada.params).toEqual({ id: '42' })
  })

  it('caminho de outro tamanho nao casa', () => {
    expect(escolherRota(tabela, 'GET', '/coisa/42/demais')).toBe(null)
  })

  it('metodo diferente nao casa', () => {
    expect(escolherRota(tabela, 'POST', '/coisa/especial')).toBe(null)
  })
})
