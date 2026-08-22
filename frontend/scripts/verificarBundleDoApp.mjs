import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Confere o bundle do modo standalone depois do build.
 *
 * Existe porque "o build passou" não prova nada aqui. Duas falhas silenciosas
 * são possíveis, e as duas já aconteceram durante a leva 2:
 *
 * 1. O núcleo não entrar no bundle. Sem `VITE_MODO_APP` definido, o Vite avalia
 *    a condição do `main.tsx` como falsa e o tree-shaking remove tudo — build
 *    verde, e o APK abriria sem banco e sem regra nenhuma.
 * 2. Uma borda não ser trocada, arrastando `pg`, `dotenv` ou `node:crypto` para
 *    dentro do aplicativo.
 */

const pasta = join(process.cwd(), 'dist-app', 'assets')

// Trechos que só existem se os controllers e middlewares de verdade estiverem
// dentro do bundle.
const PRECISA_TER = [
  'CPF ou senha incorretos', // authController
  'Acesso negado', // exigirPerfil
  'Rota não encontrada', // o roteador local
  'Identificador inválido', // a validação de :id
  'sessoes_invalidadas_em', // a coluna que derruba sessão
]

// Sinais de que algo do Node atravessou.
const NAO_PODE_TER = ['dotenv', 'node:crypto', 'createRequire', "require('pg')"]

const bundles = readdirSync(pasta)
  .filter((arquivo) => arquivo.endsWith('.js'))
  .map((arquivo) => readFileSync(join(pasta, arquivo), 'utf8'))

if (bundles.length === 0) {
  console.error(`Nenhum .js em ${pasta}. O build rodou?`)
  process.exit(1)
}

const tudo = bundles.join('\n')
const faltando = PRECISA_TER.filter((marca) => !tudo.includes(marca))
const vazou = NAO_PODE_TER.filter((marca) => tudo.includes(marca))

if (faltando.length > 0) {
  console.error('O nucleo do backend NAO esta no bundle. Faltou:', faltando.join(', '))
  console.error('Verifique se VITE_MODO_APP esta definido para o modo standalone.')
}
if (vazou.length > 0) {
  console.error('Node vazou para o bundle do app:', vazou.join(', '))
  console.error('Verifique o resolve.alias das bordas no vite.config.ts.')
}
if (faltando.length > 0 || vazou.length > 0) process.exit(1)

const tamanho = bundles.reduce((total, texto) => total + Buffer.byteLength(texto), 0)
console.log(
  `Bundle do app conferido: nucleo presente, nada de Node dentro (${(tamanho / 1024).toFixed(0)} KB em ${bundles.length} arquivos).`,
)
