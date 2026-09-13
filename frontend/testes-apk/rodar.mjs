/**
 * Roda os casos do APK no emulador, do começo ao fim.
 *
 *   npm run testar:apk            (de dentro de frontend/)
 *   npm run testar:apk -- --sem-build    reaproveita o APK já compilado
 *
 * O que ele faz, em ordem: sobe o emulador, compila e instala o APK do zero,
 * cria uma conta de teste no servidor com ficha, roda os casos em sequência e
 * **apaga tudo o que criou** — a conta, a ficha e as sessões.
 *
 * Os casos rodam em sequência e compartilham estado de propósito: é um roteiro
 * de uso, não uma matriz independente. Um caso que falha interrompe os
 * seguintes, porque a partir dali o aparelho não está mais no estado que eles
 * pressupõem — e um relatório de dez falhas em cascata esconde a única que
 * importa.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  abrirApp,
  conectarNaTela,
  dormir,
  ligarRede,
  reinstalar,
  subirEmulador,
  temInternet,
} from './aparelho.mjs'
import { CASOS } from './casos.mjs'

const executar = promisify(execFile)
const AQUI = dirname(fileURLToPath(import.meta.url))
// A suite mora dentro de frontend/ porque a resolucao ESM e pelo caminho do
// arquivo: 'ws' existe no node_modules daqui, e nao na raiz do repositorio.
const RAIZ = join(AQUI, '..', '..')
const APK = join(RAIZ, 'frontend', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')

const CPF_DE_TESTE = '90900900902'
const SENHA_DE_TESTE = 'teste123'

const backend = (caminho) => import(`file:///${join(RAIZ, 'backend', 'src', caminho).replace(/\\/g, '/')}`)

/**
 * Carrega o `backend/.env` à mão.
 *
 * O `dotenv` do backend lê do diretório atual, e aqui o diretório atual é o
 * `frontend/` — sem isto, `carregarConfig()` falha dizendo que faltam as
 * variáveis do banco, o que manda quem está lendo o erro para o lado errado.
 *
 * Só preenche o que ainda não existe, como o dotenv faz: variável já definida
 * no ambiente ganha do arquivo.
 */
function carregarEnvDoBackend() {
  const caminho = join(RAIZ, 'backend', '.env')
  let texto
  try {
    texto = readFileSync(caminho, 'utf8')
  } catch {
    throw new Error(`não achei ${caminho} — a suíte precisa do banco configurado`)
  }

  for (const linha of texto.split('\n')) {
    const limpa = linha.trim()
    if (!limpa || limpa.startsWith('#')) continue
    const separador = limpa.indexOf('=')
    if (separador === -1) continue
    const chave = limpa.slice(0, separador).trim()
    const valor = limpa.slice(separador + 1).trim().replace(/^["']|["']$/g, '')
    if (!(chave in process.env)) process.env[chave] = valor
  }
}

/** A conta da semente, que é como o APK nasce. */
function credenciaisDaSemente() {
  const caminho = join(RAIZ, 'frontend', 'src', 'local', 'sementeLocal.js')
  let texto
  try {
    texto = readFileSync(caminho, 'utf8')
  } catch {
    texto = readFileSync(join(RAIZ, 'frontend', 'src', 'local', 'semear.js'), 'utf8')
  }
  return {
    cpf: texto.match(/cpf:\s*'(\d+)'/)[1],
    senha: texto.match(/senha:\s*'([^']+)'/)[1],
  }
}

/** A conta de teste no servidor: criada agora, apagada no fim. */
async function prepararServidor() {
  carregarEnvDoBackend()
  const { db } = await backend('config/db.js')
  const { criarHashComSal } = await backend('lib/senha.js')

  const apagar = async () => {
    const { rows } = await db.query('SELECT id FROM usuario WHERE cpf = $1', [CPF_DE_TESTE])
    if (rows.length === 0) return
    const id = rows[0].id
    await db.query(
      `DELETE FROM sessao_serie WHERE id_sessao_exercicio IN (
         SELECT se.id FROM sessao_exercicio se
           JOIN sessao_treino s ON s.id_sessao = se.id_sessao WHERE s.id_aluno = $1)`,
      [id],
    )
    await db.query(
      'DELETE FROM sessao_exercicio WHERE id_sessao IN (SELECT id_sessao FROM sessao_treino WHERE id_aluno = $1)',
      [id],
    )
    await db.query('DELETE FROM sessao_treino WHERE id_aluno = $1', [id])
    await db.query('DELETE FROM ex_usuario WHERE id_user = $1', [id])
    await db.query(
      'DELETE FROM treino_bloco WHERE id_treino IN (SELECT id_treino FROM treino WHERE id_aluno = $1)',
      [id],
    )
    await db.query('DELETE FROM treino WHERE id_aluno = $1', [id])
    await db.query('DELETE FROM pedido_treino WHERE id_aluno = $1', [id])
    await db.query('DELETE FROM tentativa_login WHERE cpf = $1', [CPF_DE_TESTE])
    await db.query('DELETE FROM usuario WHERE id = $1', [id])
  }

  await apagar()

  const { rows } = await db.query(
    `INSERT INTO usuario (nome, senha, cpf, email, titulo, aluno, professor, admin, ativo)
     VALUES ('Teste do Emulador', $1, $2, 'emulador@exemplo.invalido', '909009009021', TRUE, FALSE, FALSE, TRUE)
     RETURNING id`,
    [await criarHashComSal(SENHA_DE_TESTE), CPF_DE_TESTE],
  )
  const id = rows[0].id

  const { rows: treinos } = await db.query(
    'INSERT INTO treino (id_aluno, id_professor) VALUES ($1, $1) RETURNING id_treino',
    [id],
  )
  const { rows: blocos } = await db.query(
    `INSERT INTO treino_bloco (id_treino, letra, nome, ordem)
     VALUES ($1, 'A', 'Teste do emulador', 1) RETURNING id_bloco`,
    [treinos[0].id_treino],
  )
  // Um exercício de nome distinto: é como o caso da ficha prova que o que está
  // na tela veio do servidor, e não da semente.
  const { rows: catalogo } = await db.query(
    "SELECT id_exercicio, nome_exercicio FROM exercicio WHERE nome_exercicio = 'PUXADA FRONTAL' LIMIT 1",
  )
  const exercicio = catalogo[0] ?? (await db.query('SELECT id_exercicio, nome_exercicio FROM exercicio LIMIT 1')).rows[0]

  await db.query(
    `INSERT INTO ex_usuario (id_treino, id_bloco, id_user, id_exercicio, numero_serie, repeticoes, carga)
     VALUES ($1, $2, $3, $4, 3, '10', 20)`,
    [treinos[0].id_treino, blocos[0].id_bloco, id, exercicio.id_exercicio],
  )

  return {
    conta: {
      id,
      cpf: CPF_DE_TESTE,
      senha: SENHA_DE_TESTE,
      nomeDoExercicio: exercicio.nome_exercicio,
    },
    servidor: {
      sessoesDe: async (idAluno) =>
        (
          await db.query(
            'SELECT id_sessao, uuid, duracao_segundos FROM sessao_treino WHERE id_aluno = $1 ORDER BY id_sessao',
            [idAluno],
          )
        ).rows,
    },
    limpar: async () => {
      await apagar()
      await db.end()
    },
  }
}

const VERDE = '[32m'
const VERMELHO = '[31m'
const CINZA = '[90m'
const FIM = '[0m'

async function principal() {
  const semBuild = process.argv.includes('--sem-build')
  const resultados = []

  console.log(`${CINZA}preparando o aparelho...${FIM}`)
  console.log(' ', await subirEmulador())
  await ligarRede()
  if (!(await temInternet())) {
    throw new Error('o emulador está sem internet — os casos de rede não fariam sentido')
  }

  if (!semBuild) {
    console.log(`${CINZA}  compilando o APK (use --sem-build para pular)...${FIM}`)
    await executar('npm', ['run', 'apk'], { cwd: join(RAIZ, 'frontend'), shell: true, maxBuffer: 50 * 1024 * 1024 })
  }
  await reinstalar(APK)
  console.log('  APK instalado do zero (uninstall + install, nunca -r)')

  const { conta, servidor, limpar } = await prepararServidor()
  console.log(`  conta de teste ${conta.id} no servidor, ficha com "${conta.nomeDoExercicio}"\n`)

  await abrirApp()
  let tela = await (await conectarNaTela()).abrir()
  const conectar = async () => {
    tela.fechar()
    tela = await (await conectarNaTela()).abrir()
    return tela
  }

  const contexto = { get tela() { return tela }, conta, servidor, semente: credenciaisDaSemente(), conectar }

  let parou = false
  for (const caso of CASOS) {
    if (parou) {
      resultados.push({ nome: caso.nome, estado: 'pulado' })
      continue
    }
    try {
      const detalhe = await caso.rodar(contexto)
      resultados.push({ nome: caso.nome, estado: 'ok', detalhe })
      console.log(`${VERDE}ok  ${FIM}${caso.nome}${detalhe ? `${CINZA} — ${detalhe}${FIM}` : ''}`)
    } catch (erro) {
      resultados.push({ nome: caso.nome, estado: 'falhou', detalhe: erro.message })
      console.log(`${VERMELHO}FALHOU${FIM} ${caso.nome}`)
      console.log(`        ${erro.message}`)
      try {
        const erros = tela.drenarErros()
        if (erros.length > 0) {
          console.log(`${CINZA}        console do app:${FIM}`)
          for (const erro of erros) console.log(`${CINZA}          ${erro.slice(0, 200)}${FIM}`)
        }
        console.log(`${CINZA}        tela: ${(await tela.texto()).slice(0, 200).replace(/\n+/g, ' | ')}${FIM}`)
      } catch {
        /* a tela pode ter morrido junto */
      }
      parou = true
    }
  }

  tela.fechar()
  await ligarRede()
  await limpar()
  console.log(`\n${CINZA}conta de teste e tudo o que ela criou foram apagados do servidor${FIM}`)

  const ok = resultados.filter((r) => r.estado === 'ok').length
  const falhou = resultados.filter((r) => r.estado === 'falhou').length
  const pulados = resultados.filter((r) => r.estado === 'pulado').length

  console.log(`\n${ok} ok, ${falhou} falhou, ${pulados} pulado(s), de ${CASOS.length} casos`)
  if (pulados > 0) {
    console.log(`${CINZA}os pulados não rodaram porque o aparelho parou no estado da falha acima${FIM}`)
  }
  process.exitCode = falhou > 0 ? 1 : 0
}

principal().catch((erro) => {
  console.error(`\n${VERMELHO}o roteiro não pôde rodar:${FIM}`, erro.message)
  process.exitCode = 1
})
