# Leva 2 — o núcleo portável

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> caixas (`- [ ]`) para acompanhamento.

**Objetivo:** fazer os controllers reais do backend atenderem requisições **sem Express e sem Node**,
de dentro de um bundle de browser, com o SQLite embaixo — provado por teste, ainda sem Android.

**Arquitetura:** três arquivos de borda substituem o que não atravessa para o browser
(`senha.js`, `env.js`, `db.js`), um roteador de ~40 linhas ocupa o lugar do Express, e o adapter do
axios liga as telas a ele. A troca das bordas acontece no build, por um plugin do Vite que resolve
por caminho real — nenhum arquivo do backend é editado.

**Tecnologias:** Vite (modo `standalone`), Vitest, `scrypt-js`, `node:sqlite` (nos testes),
`jose` (que já é WebCrypto e não precisa de porte).

**Spec:** `docs/superpowers/specs/2026-08-22-app-android-standalone-design.md`
**Leva anterior:** `docs/superpowers/plans/2026-08-22-app-android-leva1-sqlite.md`

## Restrições globais

- **Nada de `sed -i`** para editar arquivo-fonte neste Windows: grava por temporário + rename, o
  observador do Vite não percebe, e o dev server passa a servir módulo velho — tela preta com o build
  passando. Usar editor ou script Node.
- **Nenhum arquivo de `backend/src/controllers/`, `backend/src/routes/` ou
  `backend/src/middlewares/` é alterado.** É a razão de existir desta leva: o APK roda as regras
  verdadeiras. Se algo só funciona mexendo em controller, isso é achado a relatar.
- **O formato do hash não muda:** `"<sal_hex>:<hash_hex>"`, scrypt com **N=16384, r=8, p=1**, hash de
  64 bytes, sal de 32 bytes. O sal entra no scrypt como **texto UTF-8 da string hex**, não como
  bytes decodificados — é assim que o `node:crypto` faz, e foi medido.
- **Comparação de hash em tempo constante.** O browser não tem `timingSafeEqual`; a borda precisa de
  uma comparação que não vaze o tamanho do prefixo correto pelo tempo.
- **Nomes em português** nos arquivos novos, seguindo o projeto.
- **Commits em pt-BR, sem acento na mensagem, direto na `main`, sem push.** Sem `Co-Authored-By`.
- Os arquivos de `frontend/src/local/` são **`.js`**, não `.ts`: eles conversam com o backend, que é
  JS. Um único `index.d.ts` declara o que o `api.ts` consome, isolando o atrito de tipos.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `backend/src/config/sqlite.js` (alterado) | Normalizar o erro de unicidade para o código que o `errorHandler` entende. |
| `frontend/src/local/ambiente.js` (novo) | Borda de `env.js`: configuração fixa, sem `dotenv`. |
| `frontend/src/local/senha.js` (novo) | Borda de `senha.js`: scrypt em JS puro, mesmo formato. |
| `frontend/src/local/banco.js` (novo) | Borda de `db.js`: fachada com driver injetado, sem `pg`. |
| `frontend/src/local/roteador.js` (novo) | Método + caminho → controller, com `autenticar`/`exigirPerfil`, 404 e erros. |
| `frontend/src/local/rotas.js` (novo) | A tabela de rotas, separada para poder ser conferida contra o Express. |
| `frontend/src/local/adaptadorAxios.js` (novo) | Adapter do axios que entrega ao roteador em vez da rede. |
| `frontend/src/local/index.js` (novo) | Monta tudo e devolve o adapter pronto. |
| `frontend/src/local/index.d.ts` (novo) | O tipo do que o `api.ts` consome. |
| `frontend/vite.config.ts` (alterado) | Modo `standalone`, plugin de troca de bordas, leitura fora da raiz. |
| `frontend/src/local/bancoDoAparelho.js` (novo) | Fronteira com a leva 3: hoje falha com mensagem clara, para a pendencia ficar visivel. |
| `frontend/src/lib/api.ts` (alterado) | Expor `instalarAdaptador`, o unico ponto que conhece a instancia do axios. |
| `frontend/src/main.tsx` (alterado) | No modo standalone, ligar o nucleo local antes do primeiro render. |
| `frontend/package.json` (alterado) | `scrypt-js` e o script `build:standalone`. |

`rotas.js` é separado de `roteador.js` de propósito: a tabela é o que pode envelhecer quando alguém
acrescenta uma rota no Express, e separá-la permite um teste que a confere contra os arquivos de rota
de verdade.

---

### Tarefa 1: O erro de unicidade, no código que o errorHandler entende

Achado da leva 1, que a suíte não pegou: o `errorHandler` traduz `erro.code === "23505"` (o
`unique_violation` do PostgreSQL) em **409 "Registro já existe"**. No SQLite o erro chega como
`code: "ERR_SQLITE_ERROR"`, `errcode: 2067` — então no APK a mesma colisão viraria **500 genérico**.

Nenhum teste pegou porque os controllers conferem duplicidade antes de escrever; este caminho é a
rede para o caso de corrida. No APK há um usuário só, mas dois toques rápidos são exatamente o
cenário que o projeto já trata em outros lugares.

**Arquivos:**
- Modificar: `backend/src/config/sqlite.js`
- Teste: `backend/test/sqlite.test.js`

**Interfaces:**
- Consome: o driver da leva 1.
- Produz: erros de violação de unicidade com `code === "23505"`, além do `errcode` original.

- [ ] **Passo 1: escrever os testes que falham**

Acrescentar ao fim de `backend/test/sqlite.test.js`:

```js
// O errorHandler traduz o 23505 do PostgreSQL em 409 "Registro ja existe". Sem
// normalizar, a mesma colisao no APK viraria 500 generico — a pessoa veria
// "erro interno" no lugar de "esse CPF ja existe".
test("violacao de unicidade chega com o codigo que o errorHandler entende", async (t) => {
  const bd = bancoNovo();
  t.after(() => bd.end());

  await inserirUsuario(bd, "11111111111");

  await assert.rejects(
    () => inserirUsuario(bd, "11111111111", "Outro"),
    (erro) => {
      assert.equal(erro.code, "23505", `codigo inesperado: ${erro.code}`);
      return true;
    }
  );
});

// A mensagem original nao pode ser perdida: e o que diz QUAL coluna colidiu, e
// vai para o log do servidor quando o erro nao for tratado.
test("a violacao preserva a mensagem original do SQLite", async (t) => {
  const bd = bancoNovo();
  t.after(() => bd.end());

  await inserirUsuario(bd, "11111111111");

  await assert.rejects(
    () => inserirUsuario(bd, "11111111111", "Outro"),
    /UNIQUE constraint failed/
  );
});

// Erro que nao e de unicidade nao pode virar 409: um NOT NULL violado e defeito
// nosso, e precisa continuar chegando como erro interno.
test("outros erros do banco nao ganham o codigo de unicidade", async (t) => {
  const bd = bancoNovo();
  t.after(() => bd.end());

  await assert.rejects(
    () => bd.query("INSERT INTO treino (id_aluno, id_professor) VALUES (9999, 9999)"),
    (erro) => {
      assert.notEqual(erro.code, "23505", "erro de chave estrangeira nao e conflito de unicidade");
      return true;
    }
  );
});
```

- [ ] **Passo 2: rodar e confirmar o vermelho**

```bash
cd backend && npm run test:sqlite 2>&1 | grep -E "^✖|codigo inesperado"
```

Esperado: o primeiro teste falha com `codigo inesperado: ERR_SQLITE_ERROR`.

- [ ] **Passo 3: normalizar no driver**

Em `backend/src/config/sqlite.js`, dentro de `executar`, envolver a execução:

```js
    // 2067 é SQLITE_CONSTRAINT_UNIQUE. O errorHandler, que é compartilhado com
    // a versão web, reconhece o "23505" do PostgreSQL — normalizar aqui é o que
    // faz a mesma colisão virar 409 nos dois bancos, em vez de 500 no APK.
    //
    // A mensagem original fica: é ela que diz qual coluna colidiu.
    try {
      const linhas = conexao.prepare(traduzido).all(...valores.map(paraSqlite));
      return { rows: linhas.map(daSqlite) };
    } catch (erro) {
      if (erro?.errcode === 2067) erro.code = "23505";
      throw erro;
    }
```

- [ ] **Passo 4: confirmar o verde nos dois bancos**

```bash
cd backend && npm test && npm run test:sqlite
```

Esperado: 0 falhas nos dois bancos.

- [ ] **Passo 5: quebrar de propósito**

Trocar `2067` por `9999` e rodar `npm run test:sqlite`: o teste do código precisa ficar **vermelho**.
Depois trocar a condição para `if (erro)` (sem checar o errcode) e rodar: o teste "outros erros do
banco nao ganham o codigo" precisa ficar vermelho. Desfazer as duas.

- [ ] **Passo 6: commit**

```bash
cd backend && git add src/config/sqlite.js test/sqlite.test.js
git commit -m "Normaliza a violacao de unicidade do SQLite para o codigo do Postgres"
```

---

### Tarefa 2: As três bordas

**Arquivos:**
- Criar: `frontend/src/local/ambiente.js`, `frontend/src/local/senha.js`,
  `frontend/src/local/banco.js`
- Teste: `frontend/src/local/senha.test.js`, `frontend/src/local/banco.test.js`
- Modificar: `frontend/vite.config.ts` (liberar leitura fora da raiz, para o teste importar o backend)
- Instalar: `npm install scrypt-js` no `frontend/`

**Interfaces:**
- Produz:
  - `ambiente.js`: `carregarConfig() => { jwt: { segredo, expiracao } }` — mesmo nome e forma que
    `backend/src/config/env.js`, porque é o que `jwt.js` importa
  - `senha.js`: `criarHashComSal(senha) => Promise<string>` e
    `verificarSenha(hashArmazenada, senhaInformada) => Promise<boolean>` — mesmos nomes de
    `backend/src/lib/senha.js`
  - `banco.js`: `db` (com `query`, `connect`, `end`) e `configurarPool(driver)` — mesmos nomes de
    `backend/src/config/db.js`

- [ ] **Passo 1: liberar o Vite para ler fora da raiz**

Em `frontend/vite.config.ts`, dentro de `server`:

```ts
    // O modo standalone importa os controllers de ../backend, fora da raiz do
    // projeto. Sem isto o dev server recusa a leitura, e o teste que compara a
    // borda de senha com a do backend nem carrega.
    fs: { allow: ['..'] },
```

- [ ] **Passo 2: escrever o teste da borda de senha**

Este é o teste que importa: se o hash não for compatível, o APK e o servidor não aceitam a mesma
senha. Criar `frontend/src/local/senha.test.js`:

```js
import { describe, it, expect } from 'vitest'
import * as borda from './senha.js'
import * as backend from '../../../backend/src/lib/senha.js'

const SENHA = 'senha123'

describe('borda de senha do app', () => {
  it('produz o formato sal:hash, com os tamanhos do backend', async () => {
    const hash = await borda.criarHashComSal(SENHA)
    const [sal, digest] = hash.split(':')

    expect(sal).toMatch(/^[0-9a-f]{64}$/) // 32 bytes em hex
    expect(digest).toMatch(/^[0-9a-f]{128}$/) // 64 bytes em hex
  })

  it('verifica a senha correta e recusa a errada', async () => {
    const hash = await borda.criarHashComSal(SENHA)

    expect(await borda.verificarSenha(hash, SENHA)).toBe(true)
    expect(await borda.verificarSenha(hash, 'outraSenha')).toBe(false)
  })

  // O teste central da leva: sem isto, a conta criada no servidor nao entra no
  // APK, e vice-versa. Os parametros do scrypt e o tratamento do sal precisam
  // ser identicos aos do node:crypto.
  it('aceita hash gerada pelo backend', async () => {
    const doBackend = await backend.criarHashComSal(SENHA)

    expect(await borda.verificarSenha(doBackend, SENHA)).toBe(true)
    expect(await borda.verificarSenha(doBackend, 'outraSenha')).toBe(false)
  })

  it('gera hash que o backend aceita', async () => {
    const daBorda = await borda.criarHashComSal(SENHA)

    expect(await backend.verificarSenha(daBorda, SENHA)).toBe(true)
    expect(await backend.verificarSenha(daBorda, 'outraSenha')).toBe(false)
  })

  it('usa sal aleatorio: a mesma senha gera hashes diferentes', async () => {
    const a = await borda.criarHashComSal(SENHA)
    const b = await borda.criarHashComSal(SENHA)

    expect(a).not.toBe(b)
    expect(await borda.verificarSenha(a, SENHA)).toBe(true)
    expect(await borda.verificarSenha(b, SENHA)).toBe(true)
  })

  // Hash malformada no banco nao pode virar excecao: viraria 500 no lugar de
  // "CPF ou senha incorretos".
  it('nao quebra com hash malformada', async () => {
    for (const ruim of ['', 'semdoispontos', ':', 'sal:', ':hash', null, undefined, 42]) {
      expect(await borda.verificarSenha(ruim, SENHA)).toBe(false)
    }
  })
})
```

- [ ] **Passo 3: rodar e confirmar o vermelho**

```bash
cd frontend && npm test -- --run src/local/senha.test.js
```

Esperado: falha ao resolver `./senha.js`.

- [ ] **Passo 4: escrever a borda de senha**

```bash
cd frontend && npm install scrypt-js
```

Criar `frontend/src/local/senha.js`:

```js
import { scrypt } from 'scrypt-js'

/**
 * Senha no app standalone, com o mesmo formato e os mesmos parâmetros do
 * `backend/src/lib/senha.js` — que usa o scrypt do `node:crypto`, indisponível
 * no browser.
 *
 * Os parâmetros não são escolha: são os padrões do Node, medidos. Mudar
 * qualquer um faz o hash divergir, e aí a conta criada no servidor não entra no
 * APK. É o que os testes de ida e volta protegem.
 */
const N = 16384
const r = 8
const p = 1
const TAMANHO_HASH = 64
const TAMANHO_SAL = 32

const utf8 = (texto) => new TextEncoder().encode(texto)

const paraHex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

const deHex = (hex) =>
  new Uint8Array(hex.match(/.{1,2}/g)?.map((par) => parseInt(par, 16)) ?? [])

/**
 * O sal entra como TEXTO da string hex, e não como os bytes que ela representa.
 * É o que o node:crypto faz ao receber uma string, e trocar isso quebraria a
 * compatibilidade de forma silenciosa — a hash sairia válida, só diferente.
 */
const calcular = (senha, salHex) =>
  scrypt(utf8(senha), utf8(salHex), N, r, p, TAMANHO_HASH)

/** Formato armazenado no banco: "<sal_hex>:<hash_hex>". */
export async function criarHashComSal(senha) {
  const sal = paraHex(crypto.getRandomValues(new Uint8Array(TAMANHO_SAL)))
  const hash = await calcular(senha, sal)
  return `${sal}:${paraHex(hash)}`
}

export async function verificarSenha(hashArmazenada, senhaInformada) {
  if (typeof hashArmazenada !== 'string' || typeof senhaInformada !== 'string') {
    return false
  }

  const [sal, hashEsperada] = hashArmazenada.split(':')
  if (!sal || !hashEsperada) {
    return false
  }

  const calculada = await calcular(senhaInformada, sal)
  const esperada = deHex(hashEsperada)

  return iguaisEmTempoConstante(calculada, esperada)
}

/**
 * Substitui o `timingSafeEqual` do Node, que não existe no browser.
 *
 * Compara tudo sempre, acumulando as diferenças com XOR: sair no primeiro byte
 * diferente deixaria o tempo de resposta contar quantos bytes acertaram, e é
 * assim que se descobre uma hash por tentativa.
 */
function iguaisEmTempoConstante(a, b) {
  if (a.length !== b.length) return false

  let diferenca = 0
  for (let i = 0; i < a.length; i += 1) {
    diferenca |= a[i] ^ b[i]
  }
  return diferenca === 0
}
```

- [ ] **Passo 5: rodar e confirmar o verde**

```bash
cd frontend && npm test -- --run src/local/senha.test.js
```

Esperado: todos verdes, incluindo os dois de ida e volta com o backend.

- [ ] **Passo 6: quebrar de propósito, nos três pontos que importam**

Cada um faz o hash divergir de um jeito que **não** aparece sozinho — só o teste cruzado pega:

1. `N = 16384` → `N = 8192`. Os testes de ida e volta com o backend precisam ficar **vermelhos**, e
   os testes internos da borda precisam continuar **verdes** (a borda fica coerente consigo mesma —
   é exatamente por isso que o teste cruzado existe).
2. `utf8(salHex)` → `deHex(salHex)` em `calcular`. Mesmo resultado: só os cruzados caem.
3. `iguaisEmTempoConstante` retornando `a.length === b.length` (sem comparar conteúdo). O teste
   "verifica a senha correta e recusa a errada" precisa ficar vermelho.

Desfazer os três.

- [ ] **Passo 7: escrever a borda de ambiente**

Criar `frontend/src/local/ambiente.js`:

```js
/**
 * Borda de `backend/src/config/env.js`, que não atravessa para o browser porque
 * o `dotenv` puxa `path` e `fs`.
 *
 * Devolve só o que o app usa. O `db` do original não entra: quem escolhe o
 * banco aqui é `banco.js`, com o driver do aparelho.
 */

const CHAVE_SEGREDO = 'gymsys.local.segredo'

/**
 * Segredo do JWT, sorteado na primeira execução e guardado no aparelho.
 *
 * Não é uma constante no código de propósito: um segredo fixo no bundle é
 * público — qualquer um que abra o APK o encontra e passa a forjar token. Como
 * cada instalação tem o seu, um APK extraído não diz nada sobre o aparelho de
 * ninguém.
 *
 * Vale notar o que isto *não* resolve: quem já tem o aparelho destravado
 * também tem o banco, então forjar token não dá acesso a nada novo. A troca é
 * barata e fecha o caso do APK circulando por aí.
 */
function segredoDaInstalacao() {
  const guardado = localStorage.getItem(CHAVE_SEGREDO)
  if (guardado) return guardado

  const sorteado = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
  localStorage.setItem(CHAVE_SEGREDO, sorteado)
  return sorteado
}

export function carregarConfig() {
  return {
    jwt: {
      segredo: segredoDaInstalacao(),
      // Um ano: no app offline não há sessão para roubar pela rede, e expirar o
      // token faria a pessoa se ver deslogada sem ter como pedir outro.
      expiracao: '365d',
    },
  }
}
```

- [ ] **Passo 8: escrever o teste e a borda de banco**

Criar `frontend/src/local/banco.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { db, configurarPool } from './banco.js'

describe('borda de banco do app', () => {
  beforeEach(() => configurarPool(null))

  it('delega query ao driver injetado', async () => {
    const chamadas = []
    configurarPool({
      query: async (sql, valores) => {
        chamadas.push([sql, valores])
        return { rows: [{ id: 1 }] }
      },
    })

    const resultado = await db.query('SELECT 1', [7])

    expect(resultado.rows).toEqual([{ id: 1 }])
    expect(chamadas).toEqual([['SELECT 1', [7]]])
  })

  it('delega connect, para as transacoes', async () => {
    const cliente = { query: async () => ({ rows: [] }), release: () => {} }
    configurarPool({ connect: async () => cliente })

    expect(await db.connect()).toBe(cliente)
  })

  // Sem driver, a mensagem precisa dizer o que fazer. O sintoma natural seria
  // "cannot read property query of null", que nao ajuda ninguem.
  it('sem driver, diz o que falta', async () => {
    await expect(db.query('SELECT 1')).rejects.toThrow(/configurarPool/)
  })
})
```

Criar `frontend/src/local/banco.js`:

```js
/**
 * Borda de `backend/src/config/db.js`.
 *
 * O original é injetável desde sempre — foi feito assim para os testes —, mas
 * o `import pg` no topo arrasta `net` e `events` para o bundle mesmo quando o
 * pool nunca é criado. Aqui não existe driver embutido: quem manda é quem
 * chama `configurarPool`, que no APK é o SQLite do aparelho e nos testes o
 * `node:sqlite`.
 *
 * Os nomes são os mesmos do original de propósito: é o que permite o plugin do
 * Vite trocar um pelo outro sem que nenhum controller perceba.
 */
let driver = null

export function configurarPool(novo) {
  driver = novo
}

function exigirDriver() {
  if (!driver) {
    throw new Error('Banco não configurado: chame configurarPool antes de usar o app.')
  }
  return driver
}

export const db = {
  query: (texto, valores) => exigirDriver().query(texto, valores),
  connect: () => exigirDriver().connect(),
  end: () => (driver ? driver.end() : Promise.resolve()),
}
```

- [ ] **Passo 9: rodar tudo e commitar**

```bash
cd frontend && npm test -- --run && npm run lint
cd .. && git add frontend/ && git commit -m "Porta as tres bordas que nao atravessam para o browser"
```

Esperado: os 64 testes que ja existiam mais os novos das bordas, todos verdes, e lint limpo.

---

### Tarefa 3: O roteador mínimo

**Arquivos:**
- Criar: `frontend/src/local/rotas.js`, `frontend/src/local/roteador.js`
- Teste: `frontend/src/local/roteador.test.js`

**Interfaces:**
- Consome: as bordas da Tarefa 2; os controllers e middlewares do backend.
- Produz:
  - `rotas.js`: `TABELA` — lista de `{ metodo, caminho, perfil, acao }`, onde `caminho` usa `:id`
  - `roteador.js`: `despachar({ metodo, caminho, corpo, cabecalhos }) => Promise<{ status, corpo }>`

- [ ] **Passo 1: escrever o teste de paridade com o Express**

Este é o teste que impede a tabela de envelhecer: quem acrescentar rota no Express e esquecer o app
descobre aqui, e não no celular. Criar `frontend/src/local/roteador.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TABELA } from './rotas.js'

const pastaRotas = fileURLToPath(new URL('../../../backend/src/routes/', import.meta.url))

/** Extrai as rotas registradas nos arquivos do Express, por leitura de texto. */
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
    if (prefixo === undefined) throw new Error(`arquivo de rota novo, sem prefixo: ${arquivo}`)

    const texto = readFileSync(new URL(arquivo, `file://${pastaRotas}`), 'utf8')
    for (const achado of texto.matchAll(/rotas\.(get|post|put|delete)\(\s*"([^"]+)"/g)) {
      encontradas.push(`${achado[1].toUpperCase()} ${prefixo}${achado[2]}`)
    }
  }
  return encontradas
}

describe('tabela de rotas do app', () => {
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
})
```

- [ ] **Passo 2: rodar e confirmar o vermelho**

```bash
cd frontend && npm test -- --run src/local/roteador.test.js
```

Esperado: falha ao resolver `./rotas.js`.

- [ ] **Passo 3: escrever a tabela**

Criar `frontend/src/local/rotas.js`, espelhando `backend/src/routes/`. O `perfil` é o que o
`exigirPerfil` do Express aplicava no prefixo; `null` significa rota aberta ou só autenticada:

```js
import { login, eu, trocarMinhaSenha } from '../../../backend/src/controllers/authController.js'
import * as aluno from '../../../backend/src/controllers/alunoController.js'
import * as sessao from '../../../backend/src/controllers/sessaoController.js'
import * as professor from '../../../backend/src/controllers/professorController.js'
import * as admin from '../../../backend/src/controllers/adminController.js'

/**
 * As rotas do app, espelhando `backend/src/routes/`.
 *
 * `autenticado` e `perfil` reproduzem o que o Express aplicava no prefixo:
 * `rotas.use("/professores", autenticar, exigirPerfil("professor"), ...)`.
 *
 * Um teste confere esta lista contra os arquivos de rota de verdade — sem ele,
 * uma rota nova no Express só apareceria como "404" dentro do APK.
 */
export const TABELA = [
  { metodo: 'GET', caminho: '/', autenticado: false, perfil: null, acao: () => ({ status: 'ok', servico: 'gym-sys-api' }) },
  { metodo: 'GET', caminho: '/health', autenticado: false, perfil: null, acao: () => ({ status: 'ok' }) },

  { metodo: 'POST', caminho: '/login', autenticado: false, perfil: null, acao: login },
  { metodo: 'GET', caminho: '/me', autenticado: true, perfil: null, acao: eu },
  { metodo: 'PUT', caminho: '/me/senha', autenticado: true, perfil: null, acao: trocarMinhaSenha },

  { metodo: 'GET', caminho: '/alunos/meutreino', autenticado: true, perfil: 'aluno', acao: aluno.meuTreino },
  { metodo: 'GET', caminho: '/alunos/historico', autenticado: true, perfil: 'aluno', acao: aluno.meuHistorico },
  { metodo: 'GET', caminho: '/alunos/pedidotreino', autenticado: true, perfil: 'aluno', acao: aluno.meuPedido },
  { metodo: 'POST', caminho: '/alunos/pedidotreino', autenticado: true, perfil: 'aluno', acao: aluno.pedirNovoTreino },
  { metodo: 'GET', caminho: '/alunos/treino/sessao', autenticado: true, perfil: 'aluno', acao: sessao.sessaoAtual },
  { metodo: 'POST', caminho: '/alunos/treino/sessao', autenticado: true, perfil: 'aluno', acao: sessao.iniciarSessao },
  { metodo: 'DELETE', caminho: '/alunos/treino/sessao', autenticado: true, perfil: 'aluno', acao: sessao.descartarSessao },
  { metodo: 'POST', caminho: '/alunos/treino/sessao/finalizar', autenticado: true, perfil: 'aluno', acao: sessao.finalizarSessao },
  { metodo: 'PUT', caminho: '/alunos/treino/sessao/exercicio/:id', autenticado: true, perfil: 'aluno', acao: sessao.alternarExercicio },
  { metodo: 'GET', caminho: '/alunos/sessoes', autenticado: true, perfil: 'aluno', acao: sessao.minhasSessoes },
  { metodo: 'GET', caminho: '/alunos/sessoes/:id', autenticado: true, perfil: 'aluno', acao: sessao.detalheDaMinhaSessao },

  { metodo: 'GET', caminho: '/professores/resumo', autenticado: true, perfil: 'professor', acao: professor.resumo },
  { metodo: 'GET', caminho: '/professores/alunos', autenticado: true, perfil: 'professor', acao: professor.listarAlunos },
  { metodo: 'POST', caminho: '/professores/alunos', autenticado: true, perfil: 'professor', acao: professor.cadastrarAluno },
  { metodo: 'PUT', caminho: '/professores/alunos/desativar', autenticado: true, perfil: 'professor', acao: professor.desativarUsuario },
  { metodo: 'PUT', caminho: '/professores/alunos/reativar', autenticado: true, perfil: 'professor', acao: professor.reativarUsuario },
  { metodo: 'GET', caminho: '/professores/aluno/:id', autenticado: true, perfil: 'professor', acao: professor.listarAlunoPorId },
  { metodo: 'PUT', caminho: '/professores/aluno/:id', autenticado: true, perfil: 'professor', acao: professor.alterarAluno },
  { metodo: 'GET', caminho: '/professores/aluno/:id/treino', autenticado: true, perfil: 'professor', acao: professor.treinoDoAluno },
  { metodo: 'GET', caminho: '/professores/aluno/:id/sessoes', autenticado: true, perfil: 'professor', acao: sessao.sessoesDoAluno },
  { metodo: 'POST', caminho: '/professores/usuario/cpfoutitulo', autenticado: true, perfil: 'professor', acao: professor.buscarUsuarioPorCpfOuTitulo },
  { metodo: 'GET', caminho: '/professores/professores', autenticado: true, perfil: 'professor', acao: professor.listarProfessores },
  { metodo: 'POST', caminho: '/professores/professores', autenticado: true, perfil: 'professor', acao: professor.cadastrarProfessor },
  { metodo: 'GET', caminho: '/professores/professor/:id', autenticado: true, perfil: 'professor', acao: professor.listarProfessorPorId },
  { metodo: 'GET', caminho: '/professores/exercicios', autenticado: true, perfil: 'professor', acao: professor.listarExercicios },
  { metodo: 'POST', caminho: '/professores/exercicios', autenticado: true, perfil: 'professor', acao: professor.cadastrarExercicio },
  { metodo: 'POST', caminho: '/professores/treino', autenticado: true, perfil: 'professor', acao: professor.cadastrarTreino },
  { metodo: 'PUT', caminho: '/professores/treino/:id', autenticado: true, perfil: 'professor', acao: professor.editarTreino },
  { metodo: 'GET', caminho: '/professores/treino/pedidos', autenticado: true, perfil: 'professor', acao: professor.listarPedidos },
  { metodo: 'POST', caminho: '/professores/treino/pedido/finalizado', autenticado: true, perfil: 'professor', acao: professor.finalizarPedido },
  { metodo: 'PUT', caminho: '/professores/treino/inativar/:id', autenticado: true, perfil: 'professor', acao: professor.inativarTreino },
  { metodo: 'PUT', caminho: '/professores/treino/reativar/:id', autenticado: true, perfil: 'professor', acao: professor.reativarTreino },
  // Aliases em GET, mantidos por compatibilidade com a versao anterior da API.
  { metodo: 'GET', caminho: '/professores/treino/inativar/:id', autenticado: true, perfil: 'professor', acao: professor.inativarTreino },
  { metodo: 'GET', caminho: '/professores/treino/reativar/:id', autenticado: true, perfil: 'professor', acao: professor.reativarTreino },

  { metodo: 'GET', caminho: '/admin/usuarios', autenticado: true, perfil: 'admin', acao: admin.listarUsuarios },
  { metodo: 'PUT', caminho: '/admin/usuarios/:id', autenticado: true, perfil: 'admin', acao: admin.alterarUsuario },
  { metodo: 'PUT', caminho: '/admin/usuarios/:id/senha', autenticado: true, perfil: 'admin', acao: admin.redefinirSenha },
  { metodo: 'PUT', caminho: '/admin/usuarios/:id/perfis', autenticado: true, perfil: 'admin', acao: admin.alterarPerfis },
]
```

Se o teste de paridade acusar diferença, **a tabela está errada** — conferir contra
`backend/src/routes/`, não ajustar o teste.

- [ ] **Passo 4: escrever os testes do despacho**

Acrescentar a `frontend/src/local/roteador.test.js`:

```js
import { despachar } from './roteador.js'
import { configurarPool } from './banco.js'

/** Banco de teste em SQLite, com o schema de verdade. */
async function bancoDeTeste() {
  const { criarBancoSqlite } = await import('../../../backend/src/config/sqlite.js')
  const { readFileSync } = await import('node:fs')
  const raiz = fileURLToPath(new URL('../../../backend/db/', import.meta.url))

  const bd = criarBancoSqlite({ arquivo: ':memory:' })
  bd.aplicarSql(readFileSync(`${raiz}schema.sql`, 'utf8'))
  bd.aplicarSql(readFileSync(`${raiz}seed.sql`, 'utf8'))
  configurarPool(bd)
  return bd
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

  // O login e o caminho inteiro: controller real, senha em scrypt da borda, e
  // banco SQLite. Se isto passa, o nucleo esta de pe.
  it('faz login de verdade e devolve token que abre o /me', async () => {
    const bd = await bancoDeTeste()
    const { criarHashComSal } = await import('./senha.js')
    const hash = await criarHashComSal('senha123')
    bd.aplicarSql(`
      INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
      VALUES ('11111111111', 'Dono', '${hash}', 'a@b.com', '111111111111', TRUE, TRUE, TRUE, TRUE)
    `)

    const entrada = await despachar({
      metodo: 'POST',
      caminho: '/login',
      corpo: { cpf: '11111111111', senha: 'senha123' },
    })

    expect(entrada.status).toBe(200)
    expect(entrada.corpo.token).toBeTruthy()
    expect(entrada.corpo.usuario.cargo).toBe('admin')

    const meu = await despachar({
      metodo: 'GET',
      caminho: '/me',
      cabecalhos: { Authorization: `Bearer ${entrada.corpo.token}` },
    })

    expect(meu.status).toBe(200)
    expect(meu.corpo.nome).toBe('Dono')
  })

  it('senha errada e 401, com a mensagem que nao diz qual campo errou', async () => {
    const bd = await bancoDeTeste()
    const { criarHashComSal } = await import('./senha.js')
    const hash = await criarHashComSal('senha123')
    bd.aplicarSql(`
      INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
      VALUES ('11111111111', 'Dono', '${hash}', 'a@b.com', '111111111111', TRUE, TRUE, TRUE, TRUE)
    `)

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
    const { criarHashComSal } = await import('./senha.js')
    const hash = await criarHashComSal('senha123')
    bd.aplicarSql(`
      INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
      VALUES ('22222222222', 'Aluno', '${hash}', 'c@d.com', '222222222222', TRUE, FALSE, FALSE, TRUE)
    `)

    const entrada = await despachar({
      metodo: 'POST',
      caminho: '/login',
      corpo: { cpf: '22222222222', senha: 'senha123' },
    })
    const resposta = await despachar({
      metodo: 'GET',
      caminho: '/professores/alunos',
      cabecalhos: { Authorization: `Bearer ${entrada.corpo.token}` },
    })

    expect(resposta.status).toBe(403)
  })

  it('extrai o :id do caminho', async () => {
    const bd = await bancoDeTeste()
    const { criarHashComSal } = await import('./senha.js')
    const hash = await criarHashComSal('senha123')
    bd.aplicarSql(`
      INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
      VALUES ('11111111111', 'Prof', '${hash}', 'a@b.com', '111111111111', FALSE, TRUE, FALSE, TRUE)
    `)
    const entrada = await despachar({
      metodo: 'POST',
      caminho: '/login',
      corpo: { cpf: '11111111111', senha: 'senha123' },
    })
    const cabecalhos = { Authorization: `Bearer ${entrada.corpo.token}` }

    const inexistente = await despachar({ metodo: 'GET', caminho: '/professores/aluno/4321', cabecalhos })
    expect(inexistente.status).toBe(404)

    // O rotas.param do Express recusava id nao numerico com 400, para nao
    // deixar o "abc" chegar ao banco e virar 500.
    const invalido = await despachar({ metodo: 'GET', caminho: '/professores/aluno/abc', cabecalhos })
    expect(invalido.status).toBe(400)
  })

  it('a query string chega ao controller', async () => {
    const bd = await bancoDeTeste()
    const { criarHashComSal } = await import('./senha.js')
    const hash = await criarHashComSal('senha123')
    bd.aplicarSql(`
      INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
      VALUES ('11111111111', 'Prof', '${hash}', 'a@b.com', '111111111111', FALSE, TRUE, FALSE, TRUE)
    `)
    const entrada = await despachar({
      metodo: 'POST',
      caminho: '/login',
      corpo: { cpf: '11111111111', senha: 'senha123' },
    })

    const resposta = await despachar({
      metodo: 'GET',
      caminho: '/professores/alunos?busca=zzzznaoexiste',
      cabecalhos: { Authorization: `Bearer ${entrada.corpo.token}` },
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
```

- [ ] **Passo 5: escrever o roteador**

Criar `frontend/src/local/roteador.js`:

```js
import { autenticar, exigirPerfil } from '../../../backend/src/middlewares/auth.js'
import { ErroApi, erroRequisicao } from '../../../backend/src/lib/erros.js'
import { TABELA } from './rotas.js'

/**
 * O lugar do Express dentro do app.
 *
 * Não há servidor, porta nem HTTP: o adapter do axios entrega método e caminho,
 * isto acha o controller e devolve `{ status, corpo }`. Os controllers não
 * mudam, então precisam receber algo com a cara de `req` e de `res` — e é só
 * disso que eles usam:
 *
 *   req: body, params.id, query.*, usuario, headers.authorization
 *   res: json e status().json()
 *
 * `req.ip` fica de fora porque só o limitador de requisições usava, e limitador
 * não faz sentido num aplicativo local: quem tentaria força bruta já está com o
 * aparelho na mão, e o banco também.
 */

/** Casa o caminho pedido com um padrão de rota, devolvendo os parâmetros. */
function casar(padrao, caminho) {
  const partesPadrao = padrao.split('/')
  const partesCaminho = caminho.split('/')
  if (partesPadrao.length !== partesCaminho.length) return null

  const params = {}
  for (const [i, parte] of partesPadrao.entries()) {
    if (parte.startsWith(':')) {
      params[parte.slice(1)] = decodeURIComponent(partesCaminho[i])
      continue
    }
    if (parte !== partesCaminho[i]) return null
  }
  return params
}

/**
 * Acha a rota. Literal ganha de parâmetro no mesmo número de segmentos: sem
 * isso, `/professores/treino/pedidos` cairia em `/professores/treino/:id`,
 * dependendo da ordem da tabela.
 */
function acharRota(metodo, caminho) {
  const candidatas = TABELA.filter((rota) => rota.metodo === metodo)

  const literais = candidatas.filter((rota) => !rota.caminho.includes(':'))
  const comParametro = candidatas.filter((rota) => rota.caminho.includes(':'))

  for (const rota of [...literais, ...comParametro]) {
    const params = casar(rota.caminho, caminho)
    if (params) return { rota, params }
  }
  return null
}

export async function despachar({ metodo, caminho, corpo, cabecalhos = {} }) {
  const [semQuery, query = ''] = caminho.split('?')
  const achada = acharRota(metodo, semQuery)

  if (!achada) {
    return { status: 404, corpo: { message: 'Rota não encontrada' } }
  }

  const req = {
    body: corpo ?? {},
    params: achada.params,
    query: Object.fromEntries(new URLSearchParams(query)),
    headers: normalizarCabecalhos(cabecalhos),
  }

  let status = 200
  let enviado
  const res = {
    status: (codigo) => {
      status = codigo
      return res
    },
    json: (dados) => {
      enviado = dados
      return res
    },
  }

  try {
    // O Express recusava id não numérico antes do controller, com 400: sem
    // isso o "abc" chegava ao banco e virava 500 sem explicar nada.
    if (achada.params.id !== undefined) {
      const id = Number(achada.params.id)
      if (!Number.isInteger(id) || id <= 0) throw erroRequisicao('Identificador inválido')
    }

    if (achada.rota.autenticado) {
      await comoPromessa((proximo) => autenticar(req, res, proximo))
      if (achada.rota.perfil) {
        await comoPromessa((proximo) => exigirPerfil(achada.rota.perfil)(req, res, proximo))
      }
    }

    const resultado = await achada.rota.acao(req, res, (erro) => {
      if (erro) throw erro
    })

    // As rotas de status devolvem o objeto direto; os controllers usam res.json.
    if (enviado === undefined && resultado !== undefined) enviado = resultado

    return { status, corpo: enviado ?? null }
  } catch (erro) {
    return traduzirErro(erro)
  }
}

/** Cabeçalhos em minúsculas, como o Express entrega. */
function normalizarCabecalhos(cabecalhos) {
  return Object.fromEntries(
    Object.entries(cabecalhos).map(([nome, valor]) => [nome.toLowerCase(), valor]),
  )
}

/**
 * Transforma um middleware de callback em promessa.
 *
 * `autenticar` é embrulhado em `asyncHandler`, que captura a rejeição e chama
 * `next(erro)` em vez de propagar — então esperar pelo retorno não basta, é
 * preciso esperar pelo `next`.
 */
function comoPromessa(executar) {
  return new Promise((resolver, rejeitar) => {
    executar((erro) => (erro ? rejeitar(erro) : resolver()))
  })
}

/**
 * O mesmo contrato do `errorHandler` do Express: só `ErroApi` vira mensagem, e
 * o resto vira 500 genérico. Devolver o erro do banco à tela entregaria query,
 * tabela e constraint.
 */
function traduzirErro(erro) {
  if (erro instanceof ErroApi) {
    return { status: erro.status, corpo: { message: erro.message } }
  }
  if (erro?.code === '23505') {
    return { status: 409, corpo: { message: 'Registro já existe' } }
  }

  console.error('[erro nao tratado]', erro)
  return { status: 500, corpo: { message: 'Erro interno do servidor' } }
}
```

- [ ] **Passo 6: rodar até o verde**

```bash
cd frontend && npm test -- --run src/local/roteador.test.js
```

Esperado: todos verdes. Se o teste de paridade acusar rota faltando, corrigir a **tabela**, nunca o teste.

- [ ] **Passo 7: quebrar de propósito**

1. Remover a linha do `exigirPerfil` no `despachar`. O teste "aluno nao alcanca rota de professor"
   precisa ficar **vermelho** — é a trava mais séria do roteador.
2. Em `acharRota`, juntar literais e parâmetros numa lista só, na ordem da tabela. Um teste de rota
   precisa cair; se nenhum cair, acrescentar o caso concreto
   (`GET /professores/treino/pedidos` não pode ser atendido por `/professores/treino/:id`).
3. Remover a validação do `:id`. O teste do `/professores/aluno/abc` precisa ficar vermelho.
4. Em `traduzirErro`, devolver `erro.message` no caso genérico. O teste "erro inesperado vira 500
   generico" precisa ficar vermelho.
5. Comentar uma rota da `TABELA`. O teste de paridade precisa ficar vermelho.

Desfazer as cinco.

- [ ] **Passo 8: commit**

```bash
cd .. && git add frontend/src/local/ && git commit -m "Poe um roteador de 40 linhas no lugar do Express"
```

---

### Tarefa 4: O adapter do axios

**Arquivos:**
- Criar: `frontend/src/local/adaptadorAxios.js`, `frontend/src/local/index.js`,
  `frontend/src/local/index.d.ts`
- Teste: `frontend/src/local/adaptadorAxios.test.js`
- Modificar: `frontend/src/lib/api.ts`

**Interfaces:**
- Consome: `despachar` de `roteador.js`.
- Produz:
  - `adaptadorAxios.js`: `adaptadorLocal(config) => Promise<AxiosResponse>`
  - `index.js`: `ligarAppLocal({ driver }) => void` — configura o banco e instala o adapter
  - `index.d.ts`: os tipos de `ligarAppLocal`

- [ ] **Passo 1: escrever os testes**

Criar `frontend/src/local/adaptadorAxios.test.js`:

```js
import { describe, it, expect } from 'vitest'
import axios from 'axios'
import { adaptadorLocal } from './adaptadorAxios.js'

/** Instância igual à do app, mas com o adapter local no lugar da rede. */
function apiLocal() {
  return axios.create({ baseURL: '', adapter: adaptadorLocal })
}

describe('adapter do axios', () => {
  it('responde 200 com o corpo desserializado', async () => {
    const resposta = await apiLocal().get('/health')

    expect(resposta.status).toBe(200)
    expect(resposta.data).toEqual({ status: 'ok' })
  })

  // O interceptor de 401 do api.ts le erro.response.status. Se o adapter
  // rejeitar com um erro sem `response`, a sessao nunca cai — e a tela fica
  // presa mostrando erro em vez de voltar para o login.
  it('erro traz response.status, do jeito que o interceptor espera', async () => {
    const api = apiLocal()

    await expect(api.get('/me')).rejects.toMatchObject({
      response: { status: 401 },
    })
  })

  it('404 tambem rejeita com response', async () => {
    await expect(apiLocal().get('/nao/existe')).rejects.toMatchObject({
      response: { status: 404, data: { message: expect.stringMatching(/não encontrada/i) } },
    })
  })

  // O axios serializa o corpo antes de chamar o adapter, entao chega string.
  it('manda o corpo do POST como objeto para o roteador', async () => {
    await expect(
      apiLocal().post('/login', { cpf: '00000000000', senha: 'x' }),
    ).rejects.toMatchObject({ response: { status: 401 } })
  })

  it('a query string chega ao roteador', async () => {
    const resposta = await apiLocal().get('/health', { params: { qualquer: 'coisa' } })

    expect(resposta.status).toBe(200)
  })

  // mensagemDeErro() usa isAxiosError para achar a mensagem da API.
  it('o erro e reconhecido como erro do axios', async () => {
    try {
      await apiLocal().get('/me')
      expect.unreachable('deveria ter rejeitado')
    } catch (erro) {
      expect(axios.isAxiosError(erro)).toBe(true)
      expect(erro.response.data.message).toBeTruthy()
    }
  })
})
```

- [ ] **Passo 2: rodar e confirmar o vermelho**

```bash
cd frontend && npm test -- --run src/local/adaptadorAxios.test.js
```

- [ ] **Passo 3: escrever o adapter**

Criar `frontend/src/local/adaptadorAxios.js`:

```js
import { AxiosError } from 'axios'
import { despachar } from './roteador.js'

/**
 * Adapter do axios que entrega ao roteador local em vez de à rede.
 *
 * É o ponto de troca que deixa as nove telas e os 64 testes do front intactos:
 * elas continuam chamando `api.get('/professores/alunos')`, e os interceptors de
 * token e de 401 continuam valendo — inclusive a expulsão de sessão por troca
 * de senha ou de CPF, que é comportamento de servidor que o app mantém.
 */
export async function adaptadorLocal(config) {
  const caminho = montarCaminho(config)

  const { status, corpo } = await despachar({
    metodo: (config.method ?? 'get').toUpperCase(),
    caminho,
    corpo: desserializar(config.data),
    cabecalhos: cabecalhosDe(config),
  })

  const resposta = {
    data: corpo,
    status,
    statusText: String(status),
    headers: {},
    config,
    request: { caminho },
  }

  // O axios normalmente decide isto pelo validateStatus; aqui a decisão é
  // explícita porque o erro precisa nascer com `response` preenchido — é onde o
  // interceptor de 401 e o mensagemDeErro() vão procurar.
  const aceitar = config.validateStatus ?? ((s) => s >= 200 && s < 300)
  if (aceitar(status)) return resposta

  throw new AxiosError(
    corpo?.message ?? `Requisição falhou com status ${status}`,
    status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
    config,
    resposta.request,
    resposta,
  )
}

/** Junta baseURL, url e params no caminho que o roteador entende. */
function montarCaminho(config) {
  const base = (config.baseURL ?? '').replace(/\/$/, '')
  const url = config.url ?? '/'
  const caminho = url.startsWith('http') ? new URL(url).pathname : `${base}${url}`

  const busca = new URLSearchParams(
    Object.entries(config.params ?? {}).filter(([, valor]) => valor !== undefined && valor !== null),
  ).toString()

  return busca ? `${caminho}?${busca}` : caminho
}

/**
 * O axios já serializou o corpo em JSON quando chega aqui (o transformRequest
 * roda antes do adapter), então é preciso desfazer.
 */
function desserializar(dados) {
  if (dados === undefined || dados === null) return undefined
  if (typeof dados !== 'string') return dados

  try {
    return JSON.parse(dados)
  } catch {
    return undefined
  }
}

function cabecalhosDe(config) {
  const cabecalhos = config.headers ?? {}
  // AxiosHeaders tem toJSON; um objeto simples, não.
  return typeof cabecalhos.toJSON === 'function' ? cabecalhos.toJSON() : { ...cabecalhos }
}
```

- [ ] **Passo 4: escrever o `index.js` e o `index.d.ts`**

`frontend/src/local/index.js`:

```js
import { configurarPool } from './banco.js'
import { adaptadorLocal } from './adaptadorAxios.js'

/**
 * Liga o app ao próprio núcleo: o banco recebe o driver do ambiente e o axios
 * passa a falar com o roteador local.
 *
 * Quem chama é o `api.ts`, só no modo standalone.
 */
export function ligarAppLocal({ driver }) {
  configurarPool(driver)
  return adaptadorLocal
}
```

`frontend/src/local/index.d.ts`:

```ts
import type { AxiosAdapter } from 'axios'

/** O driver de banco do ambiente: SQLite nativo no APK, node:sqlite nos testes. */
export interface DriverDeBanco {
  query: (texto: string, valores?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
  connect: () => Promise<{ query: DriverDeBanco['query']; release: () => void }>
  end: () => Promise<void>
}

export function ligarAppLocal(opcoes: { driver: DriverDeBanco }): AxiosAdapter
```

- [ ] **Passo 5: rodar e commitar**

```bash
cd frontend && npm test -- --run && npm run lint
cd .. && git add frontend/ && git commit -m "Liga as telas ao nucleo local pelo adapter do axios"
```

Esperado: toda a suite do front verde — os 64 anteriores mais os das bordas, do roteador e do adapter.

- [ ] **Passo 6: quebrar de propósito**

1. No adapter, lançar um `Error` comum em vez de `AxiosError`. O teste "erro traz response.status"
   precisa ficar **vermelho** — é o que mantém o interceptor de 401 funcionando.
2. Remover o `desserializar` (passar `config.data` cru). O teste do POST precisa cair.

Desfazer as duas.

---

### Tarefa 5: O build standalone

**Arquivos:**
- Modificar: `frontend/vite.config.ts`, `frontend/package.json`, `frontend/src/lib/api.ts`

- [ ] **Passo 1: o plugin que troca as bordas**

Em `frontend/vite.config.ts`, antes do `defineConfig`:

```ts
import { fileURLToPath } from 'node:url'

/**
 * Troca os três arquivos que não atravessam para o browser pelas bordas de
 * `src/local/`, no momento do build.
 *
 * Resolve pelo **caminho real**, e não pelo texto do import: `env.js` é
 * importado como './env.js' de dentro de config/ e como '../config/env.js' de
 * dentro de lib/, então casar por string deixaria um dos dois passar — e o que
 * passasse arrastaria `dotenv`, `fs` e `path` para o bundle.
 */
function trocarBordasDoBackend() {
  // O id que o Vite entrega vem como caminho do sistema — no Windows com
  // barras invertidas, no Linux com normais. Normalizar os dois lados para
  // barra normal é o que faz a comparação funcionar nos dois, e este projeto
  // roda no Windows aqui e em Linux no servidor de casa.
  const normalizar = (caminho) => caminho.replace(/\\/g, '/')

  const doBackend = (relativo) =>
    normalizar(fileURLToPath(new URL(`../backend/src/${relativo}`, import.meta.url)))
  const local = (arquivo) => fileURLToPath(new URL(`./src/local/${arquivo}`, import.meta.url))

  const substituicoes = new Map([
    [doBackend('config/db.js'), local('banco.js')],
    [doBackend('config/env.js'), local('ambiente.js')],
    [doBackend('lib/senha.js'), local('senha.js')],
  ])

  return {
    name: 'gymsys-trocar-bordas',
    async resolveId(fonte, importador, opcoes) {
      const resolvido = await this.resolve(fonte, importador, { ...opcoes, skipSelf: true })
      if (!resolvido) return null

      // O id pode vir com sufixo de query (?v=, ?import) — só o caminho importa.
      const [caminho] = normalizar(resolvido.id).split('?')
      return substituicoes.get(caminho) ?? null
    },
  }
}
```

E dentro de `defineConfig`, condicionado ao modo:

```ts
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === 'standalone' ? [trocarBordasDoBackend()] : []),
    VitePWA({ /* … como está … */ }),
  ],
  // … o resto como está …
}))
```

**Verificar que a troca aconteceu**, e não confiar no build passar: acrescentar ao plugin, no
`buildEnd`, uma conferência de que as três substituições foram usadas ao menos uma vez —

```js
    buildEnd() {
      const naoUsadas = [...substituicoes.keys()].filter((chave) => !usadas.has(chave))
      if (naoUsadas.length > 0) {
        this.error(
          `Bordas nao trocadas: ${naoUsadas.join(', ')}. ` +
            `O bundle levaria pg, dotenv ou node:crypto para dentro do APK.`
        )
      }
    },
```

com `const usadas = new Set()` no escopo do plugin e `usadas.add(caminho)` junto do `return`. Sem
isso, um caminho que deixasse de casar (uma pasta renomeada, por exemplo) passaria em silêncio — e o
sintoma apareceria só no aparelho.

- [ ] **Passo 2: o script de build**

Em `frontend/package.json`:

```json
    "build:standalone": "tsc && vite build --mode standalone --outDir dist-app",
```

- [ ] **Passo 3: ligar o adapter, no bootstrap e não no `api.ts`**

Em `frontend/src/lib/api.ts`, só um ponto de entrada:

```ts
/**
 * Instala um adapter no lugar da rede. Usado pelo modo standalone, em que o
 * núcleo do backend roda dentro do próprio aplicativo.
 *
 * Fica aqui, e não no módulo do app local, para o `api.ts` continuar sendo o
 * único lugar que conhece a instância do axios.
 */
export function instalarAdaptador(adaptador: AxiosAdapter) {
  api.defaults.adapter = adaptador
}
```

com `import type { AxiosAdapter } from 'axios'` no topo.

Em `frontend/src/main.tsx`, **antes** de renderizar:

```tsx
// No APK não existe rede: o núcleo roda dentro do aplicativo. O import é
// dinâmico para o build web não carregar nada disto, e acontece antes do render
// para nenhuma tela chegar a fazer chamada pela rede que não existe.
if (import.meta.env.VITE_MODO_APP === 'standalone') {
  const { ligarAppLocal } = await import('./local/index.js')
  const { abrirBancoDoAparelho } = await import('./local/bancoDoAparelho.js')
  const { instalarAdaptador } = await import('./lib/api')

  instalarAdaptador(ligarAppLocal({ driver: await abrirBancoDoAparelho() }))
}
```

O `await` no topo é aceitável **aqui**: `main.tsx` é o ponto de entrada, roda uma vez, e nada mais
depende dele. Fazer isso dentro de `api.ts` seria diferente — todo módulo que importa a API passaria
a esperar por essa promessa.

**`bancoDoAparelho.js` é da leva 3** — é ele que fala com o plugin nativo. Nesta leva, criar o
arquivo devolvendo um erro claro, para o build não quebrar e a pendência ficar visível:

```js
/**
 * O driver de banco do aparelho. Chega na leva 3, junto com o Capacitor.
 *
 * Existe agora para o build standalone fechar e para a pendência ficar explícita
 * — e não como um `catch` silencioso que faria o app abrir com banco vazio.
 */
export async function abrirBancoDoAparelho() {
  throw new Error('Banco do aparelho ainda não implementado: leva 3 da seção 6 do roadmap.')
}
```

- [ ] **Passo 4: verificar que o bundle não arrastou Node para dentro**

```bash
cd frontend && npm run build:standalone
```

Esperado: build completa. **Se `pg` ou `dotenv` tivessem entrado, o Vite falharia** ao tentar
resolver `net`, `fs` ou `tls` — a mensagem "Module ... has been externalized for browser
compatibility" é o sinal de que uma borda não foi trocada.

Conferir também que o build web continua limpo:

```bash
cd frontend && npm run build
```

- [ ] **Passo 5: commit**

```bash
cd .. && git add frontend/ && git commit -m "Empacota o modo standalone, com as bordas trocadas no build"
```

---

### Tarefa 6: Documentação

- [ ] **Passo 1: `backend/README.md`**

Acrescentar à seção do SQLite que a violação de unicidade é normalizada para `23505`, e por quê.

- [ ] **Passo 2: `frontend/README.md`**

Documentar `src/local/`: o que cada arquivo substitui, o modo `standalone`, e que **as telas não
sabem da diferença** porque a troca é no adapter do axios.

- [ ] **Passo 3: `ROADMAP.md`**

Marcar a leva 2 da seção 6 como entregue, deixando claro o que falta: o driver do aparelho e o
Capacitor.

- [ ] **Passo 4: `CLAUDE.md`**

Acrescentar que `frontend/src/local/` tem as bordas e o roteador do app, e a regra: **rota nova no
Express exige entrada na tabela de `rotas.js`** — o teste de paridade quebra se esquecerem.

- [ ] **Passo 5: commit**

```bash
git add backend/README.md frontend/README.md ROADMAP.md
git commit -m "Documenta o nucleo portavel do app"
```

---

## Pronto quando

- [ ] `cd backend && npm test && npm run test:sqlite` — verdes nos dois
- [ ] `cd frontend && npm test -- --run` — toda a suite verde
- [ ] `cd frontend && npm run lint` — limpo
- [ ] `cd frontend && npm run build && npm run build:standalone` — os dois completam
- [ ] Nenhum arquivo de `backend/src/controllers/`, `routes/` ou `middlewares/` alterado
- [ ] O hash da borda e o do backend se aceitam nos dois sentidos, provado por teste
- [ ] A tabela de rotas confere com os arquivos de rota do Express, provado por teste
