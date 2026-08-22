# Leva 3 — Capacitor e APK

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> caixas (`- [ ]`) para acompanhamento.

**Objetivo:** o APK instalado, abrindo offline, com a conta já cadastrada, executando um treino — e o
histórico ainda lá depois de fechar e reabrir.

**Arquitetura:** o núcleo da leva 2 ganha o driver que fala com o SQLite nativo do aparelho, um seed
que roda na primeira abertura, e o empacotamento do Capacitor. Nenhum controller muda, e o roteador
e as bordas continuam como estão.

**Tecnologias:** Capacitor 8, `@capacitor-community/sqlite` 8.1.1, Android SDK (platform 37,
build-tools 36), JDK 25 embutido no Android Studio.

**Spec:** `docs/superpowers/specs/2026-08-22-app-android-standalone-design.md`
**Levas anteriores:** `docs/superpowers/plans/2026-08-22-app-android-leva1-sqlite.md`,
`docs/superpowers/plans/2026-08-22-app-android-leva2-nucleo.md`

## O que já foi medido do ambiente e do plugin

Levantado antes de escrever, para o plano não apostar:

| Item | Estado |
|---|---|
| Android Studio | instalado em `C:\Program Files\Android\Android Studio` |
| JDK | 25, embutido no Studio (`jbr`), **fora do PATH** |
| SDK | `%LOCALAPPDATA%\Android\Sdk` — platform **android-37.0**, build-tools **36.0.0**, `adb` presente |
| `JAVA_HOME` / `ANDROID_HOME` | **não definidos** — o Gradle na linha de comando precisa dos dois |
| `cmdline-tools` (`sdkmanager`, `avdmanager`) | **ausentes** — criar AVD é pela interface do Studio |
| Imagem de sistema para emulador | **nenhuma baixada** |
| Plugin de SQLite | `@capacitor-community/sqlite` 8.1.1, exige `@capacitor/core` ≥ 8 |

E a API do plugin, com dois padrões que **precisam** ser sobrescritos:

```
conexao.query(sql, valores)                       → { values: [...] }        leitura
conexao.run(sql, valores, transaction, returnMode) → { changes: { changes, lastId, values } }
conexao.execute(statements, transaction)          → DDL e vários comandos
conexao.beginTransaction() / commitTransaction() / rollbackTransaction()
```

- **`run(..., transaction = true)` é o padrão.** Cada escrita abriria e fecharia a própria transação,
  quebrando o `BEGIN … COMMIT` dos controllers — as travas de perfil e o cadastro de treino dependem
  de a transação envolver várias escritas. Passar **`false`** sempre.
- **`returnMode = 'no'` é o padrão**, e o projeto tem 16 `RETURNING`. Sem `'all'`, todo `INSERT …
  RETURNING id` voltaria vazio e os controllers quebrariam ao ler `rows[0].id`.

## Restrições globais

- **Nada de `sed -i`** para editar arquivo-fonte neste Windows: grava por temporário + rename, o
  observador do Vite não percebe, e passa a servir módulo velho.
- **Nenhum arquivo de `backend/src/`** é alterado. Se algo só funciona mexendo lá, é achado a relatar.
- **O caminho do Android é gerado**: `frontend/android/` nasce do `npx cap add android`. Não editar à
  mão o que o Capacitor regenera, com uma exceção declarada na Tarefa 4 (`variables.gradle`).
- **Commits em pt-BR, sem acento na mensagem, direto na `main`, sem push.** Sem `Co-Authored-By`.
- **A conta padrão do seed é pública** — foi decisão consciente. O README precisa dizer, na primeira
  linha da seção, que trocar a senha é o primeiro passo depois de instalar.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `frontend/src/local/parametros.js` (novo) | Expandir `?1` numerado para `?` posicional, duplicando valores reusados. |
| `frontend/src/local/bancoDoAparelho.js` (reescrito) | O driver: contrato `DriverDeBanco` sobre o plugin nativo. |
| `frontend/src/local/semear.js` (novo) | Schema, catálogo e dados iniciais na primeira abertura. |
| `frontend/capacitor.config.ts` (novo) | `appId`, `appName`, pasta do build web. |
| `frontend/android/` (gerado) | Projeto Android do Capacitor. |
| `frontend/scripts/apk.mjs` (novo) | Build do APK com `JAVA_HOME` e `ANDROID_HOME` resolvidos. |
| `frontend/README.md`, `ROADMAP.md`, `CLAUDE.md` | Documentação. |

---

### Tarefa 1: Parâmetros numerados viram posicionais

O tradutor da leva 1 gera `?1`, `?2`, preservando o reuso do mesmo parâmetro — que o projeto usa na
busca por CPF **ou** título. O `node:sqlite` aceita essa numeração; **se o plugin nativo não aceitar,
a consulta falha ou, pior, lê o valor errado.**

Em vez de descobrir isso no aparelho, o driver converte para `?` posicional simples, duplicando o
valor quando o parâmetro se repete. Fica correto nos dois casos, e é testável aqui.

**Arquivos:**
- Criar: `frontend/src/local/parametros.js`
- Teste: `frontend/src/local/parametros.test.js`

**Interfaces:**
- Produz: `paraPosicionais(sql, valores) => { sql, valores }`

- [ ] **Passo 1: escrever os testes**

```js
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { paraPosicionais } from './parametros.js'

describe('parametros numerados viram posicionais', () => {
  it('troca ?1 por ? na ordem de aparicao', () => {
    const r = paraPosicionais('SELECT * FROM t WHERE a = ?1 AND b = ?2', ['x', 'y'])

    expect(r.sql).toBe('SELECT * FROM t WHERE a = ? AND b = ?')
    expect(r.valores).toEqual(['x', 'y'])
  })

  // O caso que motiva o arquivo: o mesmo parametro duas vezes na consulta.
  it('duplica o valor quando o parametro se repete', () => {
    const r = paraPosicionais("WHERE (?1 <> '' AND cpf = ?1) OR (?2 <> '' AND titulo = ?2)", ['111', ''])

    expect(r.sql).toBe("WHERE (? <> '' AND cpf = ?) OR (? <> '' AND titulo = ?)")
    expect(r.valores).toEqual(['111', '111', '', ''])
  })

  // A ordem no SQL nao e necessariamente a ordem do array: o projeto tem
  // consultas montadas por partes, onde o ?3 aparece antes do ?1.
  it('segue a ordem do SQL, e nao a do array', () => {
    const r = paraPosicionais('SET b = ?2, a = ?1', ['valorA', 'valorB'])

    expect(r.sql).toBe('SET b = ?, a = ?')
    expect(r.valores).toEqual(['valorB', 'valorA'])
  })

  it('numero de dois digitos nao e confundido com um', () => {
    const valores = Array.from({ length: 12 }, (_, i) => `v${i + 1}`)
    const r = paraPosicionais('VALUES (?1, ?10, ?11, ?12, ?2)', valores)

    expect(r.sql).toBe('VALUES (?, ?, ?, ?, ?)')
    expect(r.valores).toEqual(['v1', 'v10', 'v11', 'v12', 'v2'])
  })

  it('sem parametro nenhum, passa igual', () => {
    const r = paraPosicionais('SELECT 1', [])

    expect(r.sql).toBe('SELECT 1')
    expect(r.valores).toEqual([])
  })

  it('parametro sem valor correspondente vira nulo, e nao undefined', () => {
    // undefined nao pode ser ligado a parametro do SQLite; nulo pode.
    const r = paraPosicionais('WHERE a = ?1 AND b = ?2', ['x'])

    expect(r.valores).toEqual(['x', null])
  })
})
```

- [ ] **Passo 2: rodar e confirmar o vermelho**

```bash
cd frontend && npx vitest run src/local/parametros.test.js
```

- [ ] **Passo 3: escrever a expansão**

```js
/**
 * Converte `?1`, `?2` (numerados) em `?` posicionais, reordenando os valores
 * para a ordem em que aparecem no SQL e duplicando os que se repetem.
 *
 * O tradutor de dialeto gera numerados de propósito: é o que preserva o mesmo
 * parâmetro usado duas vezes na mesma consulta, como na busca por CPF ou título.
 * O `node:sqlite` entende essa forma; o plugin nativo do aparelho passa os
 * valores como array para a camada Java, e não há garantia de que a numeração
 * sobreviva. Converter aqui deixa de ser uma aposta.
 */
export function paraPosicionais(sql, valores = []) {
  const usados = []

  const convertido = sql.replace(/\?(\d+)/g, (_todo, numero) => {
    const indice = Number(numero) - 1
    // Nulo, e não undefined: o SQLite recusa undefined, e um parâmetro sem
    // valor correspondente é ausência de dado, não erro de programação aqui.
    usados.push(valores[indice] ?? null)
    return '?'
  })

  return { sql: convertido, valores: usados }
}
```

- [ ] **Passo 4: rodar e confirmar o verde**

- [ ] **Passo 5: quebrar de propósito**

1. Trocar `/\?(\d+)/g` por `/\?(\d)/g`. O teste do número de dois dígitos precisa ficar **vermelho**
   (o `?10` viraria `?` seguido de um `0` solto).
2. Trocar `usados.push(valores[indice] ?? null)` por `usados.push(...valores)` fora do replace, ou
   simplesmente devolver `valores` intactos: o teste do parâmetro repetido e o da ordem precisam cair.

Desfazer as duas.

- [ ] **Passo 6: commit**

```bash
cd .. && git add frontend/src/local/parametros.js frontend/src/local/parametros.test.js
git commit -m "Converte parametro numerado em posicional para o driver do aparelho"
```

---

### Tarefa 2: O driver do aparelho

**Arquivos:**
- Reescrever: `frontend/src/local/bancoDoAparelho.js`
- Teste: `frontend/src/local/bancoDoAparelho.test.js`
- Instalar: `npm install @capacitor/core @capacitor-community/sqlite` no `frontend/`

**Interfaces:**
- Consome: `paraPosicionais`, e o plugin.
- Produz: `abrirBancoDoAparelho({ plugin } = {}) => Promise<DriverDeBanco>` — o `plugin` é injetável
  para o teste passar um duplo; em produção vem do Capacitor.

- [ ] **Passo 1: escrever os testes com um duplo do plugin**

O driver é testável sem aparelho: o que importa é **como** ele chama o plugin.

```js
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { abrirBancoDoAparelho } from './bancoDoAparelho.js'

/** Duplo do plugin: registra as chamadas e devolve o que for combinado. */
function pluginFalso({ aoConsultar = () => ({ values: [] }), aoEscrever = () => ({ changes: { changes: 1 } }) } = {}) {
  const chamadas = []
  const conexao = {
    open: async () => chamadas.push(['open']),
    close: async () => chamadas.push(['close']),
    execute: async (sql, transacao) => {
      chamadas.push(['execute', sql, transacao])
      return { changes: { changes: 0 } }
    },
    query: async (sql, valores) => {
      chamadas.push(['query', sql, valores])
      return aoConsultar(sql, valores)
    },
    run: async (sql, valores, transacao, returnMode) => {
      chamadas.push(['run', sql, valores, transacao, returnMode])
      return aoEscrever(sql, valores)
    },
    beginTransaction: async () => chamadas.push(['begin']),
    commitTransaction: async () => chamadas.push(['commit']),
    rollbackTransaction: async () => chamadas.push(['rollback']),
  }

  return {
    chamadas,
    plugin: {
      createConnection: async (...args) => {
        chamadas.push(['createConnection', ...args])
        return conexao
      },
      closeConnection: async () => chamadas.push(['closeConnection']),
    },
  }
}

describe('driver do aparelho', () => {
  it('abre a conexao e devolve o contrato de banco', async () => {
    const { plugin, chamadas } = pluginFalso()

    const bd = await abrirBancoDoAparelho({ plugin, semear: async () => {} })

    expect(typeof bd.query).toBe('function')
    expect(typeof bd.connect).toBe('function')
    expect(typeof bd.end).toBe('function')
    expect(chamadas.map((c) => c[0])).toContain('open')
  })

  it('SELECT vai por query, e as linhas voltam em rows', async () => {
    const { plugin, chamadas } = pluginFalso({ aoConsultar: () => ({ values: [{ id: 7 }] }) })
    const bd = await abrirBancoDoAparelho({ plugin, semear: async () => {} })

    const r = await bd.query('SELECT id FROM usuario WHERE id = ?1', [7])

    expect(r.rows).toEqual([{ id: 7 }])
    expect(chamadas).toContainEqual(['query', 'SELECT id FROM usuario WHERE id = ?', [7]])
  })

  // returnMode 'all' e o que faz o RETURNING voltar. Com o padrao 'no', todo
  // INSERT ... RETURNING id voltaria vazio e o controller quebraria em rows[0].
  it('INSERT com RETURNING vai por run, pedindo as linhas de volta', async () => {
    const { plugin, chamadas } = pluginFalso({
      aoEscrever: () => ({ changes: { changes: 1, lastId: 3, values: [{ id: 3 }] } }),
    })
    const bd = await abrirBancoDoAparelho({ plugin, semear: async () => {} })

    const r = await bd.query('INSERT INTO usuario (nome) VALUES (?1) RETURNING id', ['Fulano'])

    expect(r.rows).toEqual([{ id: 3 }])
    const chamada = chamadas.find((c) => c[0] === 'run')
    expect(chamada[3]).toBe(false) // transaction
    expect(chamada[4]).toBe('all') // returnMode
  })

  // transaction: false em toda escrita. Com o padrao true, cada UPDATE abriria e
  // fecharia a propria transacao, e o BEGIN ... COMMIT dos controllers — de que
  // as travas de perfil e o cadastro de treino dependem — deixaria de valer.
  it('escrita sem RETURNING nao abre transacao propria', async () => {
    const { plugin, chamadas } = pluginFalso()
    const bd = await abrirBancoDoAparelho({ plugin, semear: async () => {} })

    await bd.query('UPDATE usuario SET nome = ?1 WHERE id = ?2', ['Outro', 1])

    const chamada = chamadas.find((c) => c[0] === 'run')
    expect(chamada[3]).toBe(false)
  })

  // Os controllers pedem transacao mandando o SQL "BEGIN" pela conexao. O plugin
  // tem metodos proprios, e misturar os dois caminhos deixaria a transacao
  // pendurada.
  it('BEGIN, COMMIT e ROLLBACK viram os metodos do plugin', async () => {
    const { plugin, chamadas } = pluginFalso()
    const bd = await abrirBancoDoAparelho({ plugin, semear: async () => {} })

    const cliente = await bd.connect()
    await cliente.query('BEGIN')
    await cliente.query('COMMIT')
    await cliente.query('ROLLBACK')
    cliente.release()

    const nomes = chamadas.map((c) => c[0])
    expect(nomes).toContain('begin')
    expect(nomes).toContain('commit')
    expect(nomes).toContain('rollback')
    // Nenhum desses tres pode ter ido como SQL solto.
    expect(chamadas.filter((c) => c[0] === 'run' || c[0] === 'query')).toEqual([])
  })

  it('booleano e Date convertidos antes de chegar ao plugin', async () => {
    const { plugin, chamadas } = pluginFalso()
    const bd = await abrirBancoDoAparelho({ plugin, semear: async () => {} })

    const quando = new Date('2026-08-22T19:00:00.000Z')
    await bd.query('UPDATE usuario SET ativo = ?1, visto = ?2 WHERE id = ?3', [false, quando, 1])

    const chamada = chamadas.find((c) => c[0] === 'run')
    expect(chamada[2]).toEqual([0, '2026-08-22T19:00:00.000Z', 1])
  })

  it('booleano volta como boolean nas colunas do schema', async () => {
    const { plugin } = pluginFalso({ aoConsultar: () => ({ values: [{ ativo: 1, aluno: 0, nome: 'x' }] }) })
    const bd = await abrirBancoDoAparelho({ plugin, semear: async () => {} })

    const r = await bd.query('SELECT ativo, aluno, nome FROM usuario')

    expect(r.rows[0]).toEqual({ ativo: true, aluno: false, nome: 'x' })
  })

  it('violacao de unicidade chega com o codigo do Postgres', async () => {
    const { plugin } = pluginFalso({
      aoEscrever: () => {
        throw new Error('UNIQUE constraint failed: usuario.cpf')
      },
    })
    const bd = await abrirBancoDoAparelho({ plugin, semear: async () => {} })

    await expect(bd.query('INSERT INTO usuario (cpf) VALUES (?1)', ['1'])).rejects.toMatchObject({
      code: '23505',
    })
  })

  it('semeia na abertura, uma vez', async () => {
    const { plugin } = pluginFalso()
    let vezes = 0

    await abrirBancoDoAparelho({ plugin, semear: async () => { vezes += 1 } })

    expect(vezes).toBe(1)
  })
})
```

- [ ] **Passo 2: rodar e confirmar o vermelho**

- [ ] **Passo 3: escrever o driver**

```js
import { paraPosicionais } from './parametros.js'

const NOME_DO_BANCO = 'gymsys'

/**
 * Colunas declaradas BOOLEAN no schema.
 *
 * Aqui é lista, e não `PRAGMA table_info` como no driver de teste: a consulta do
 * pragma pelo plugin custa uma ida à camada nativa por tabela, na abertura do
 * app. A lista é conferida por um teste contra o `schema.sql`.
 */
const COLUNAS_BOOLEANAS = new Set([
  'aluno', 'professor', 'admin', 'ativo', 'concluido', 'ver', 'alterar', 'apagar',
])

/** O SQLite recusa boolean e grava Date como nulo, calado. */
function paraSqlite(valor) {
  if (valor instanceof Date) return valor.toISOString()
  if (typeof valor === 'boolean') return valor ? 1 : 0
  return valor
}

function daSqlite(linha) {
  const convertida = {}
  for (const [coluna, valor] of Object.entries(linha)) {
    convertida[coluna] = COLUNAS_BOOLEANAS.has(coluna) && valor !== null ? valor === 1 : valor
  }
  return convertida
}

/** O errorHandler, compartilhado com a versão web, reconhece o 23505. */
function normalizar(erro) {
  if (/UNIQUE constraint failed/i.test(erro?.message ?? '')) erro.code = '23505'
  return erro
}

const ehLeitura = (sql) => /^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql)
const temRetorno = (sql) => /\bRETURNING\b/i.test(sql)
const ehControleDeTransacao = (sql) => /^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(sql)

/**
 * Abre o banco do aparelho e devolve o contrato que a fachada `db` espera.
 *
 * `plugin` e `semear` são injetáveis para o teste — em produção o plugin vem do
 * Capacitor e o seed é o de `semear.js`.
 */
export async function abrirBancoDoAparelho({ plugin, semear } = {}) {
  const sqlite = plugin ?? (await conectarAoPlugin())
  const semearBanco = semear ?? (await import('./semear.js')).semear

  const conexao = await sqlite.createConnection(NOME_DO_BANCO, false, 'no-encryption', 1, false)
  await conexao.open()

  async function executar(sql, valores = []) {
    // BEGIN/COMMIT/ROLLBACK têm método próprio no plugin. Mandá-los como SQL
    // deixaria a transação pendurada, porque o plugin controla o estado dela
    // por dentro.
    if (ehControleDeTransacao(sql)) {
      const comando = sql.trim().split(/\s+/)[0].toUpperCase()
      if (comando === 'BEGIN') await conexao.beginTransaction()
      else if (comando === 'COMMIT') await conexao.commitTransaction()
      else await conexao.rollbackTransaction()
      return { rows: [] }
    }

    const pedido = paraPosicionais(sql, valores.map(paraSqlite))

    try {
      if (ehLeitura(pedido.sql)) {
        const resultado = await conexao.query(pedido.sql, pedido.valores)
        return { rows: (resultado.values ?? []).map(daSqlite) }
      }

      // transaction: false porque a transação é dos controllers, e returnMode
      // 'all' porque o projeto tem 16 RETURNING — com o padrão do plugin, todos
      // voltariam vazios.
      const resultado = await conexao.run(
        pedido.sql,
        pedido.valores,
        false,
        temRetorno(pedido.sql) ? 'all' : 'no',
      )
      return { rows: (resultado.changes?.values ?? []).map(daSqlite) }
    } catch (erro) {
      throw normalizar(erro)
    }
  }

  const bd = {
    query: (sql, valores) => executar(sql, valores),
    connect: async () => ({ query: (sql, valores) => executar(sql, valores), release: () => {} }),
    end: async () => {
      await conexao.close()
      await sqlite.closeConnection(NOME_DO_BANCO, false)
    },
    /** SQL cru, para o seed aplicar schema e catálogo. */
    aplicarSql: (sql) => conexao.execute(sql, false),
  }

  await semearBanco(bd)
  return bd
}

/**
 * Carrega o plugin do Capacitor. Import dinâmico para o módulo continuar
 * testável em Node, onde o Capacitor não existe.
 */
async function conectarAoPlugin() {
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite')
  return new SQLiteConnection(CapacitorSQLite)
}
```

- [ ] **Passo 4: rodar e confirmar o verde**

- [ ] **Passo 5: um teste que amarra a lista de booleanas ao schema**

A lista fixa é a única duplicação de conhecimento do banco nesta leva. Acrescentar a
`bancoDoAparelho.test.js`:

```js
it('a lista de colunas booleanas confere com o schema', async () => {
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const schema = readFileSync(join(process.cwd(), '..', 'backend', 'db', 'schema.sql'), 'utf8')

  const noSchema = new Set(
    [...schema.matchAll(/^\s+(\w+)\s+BOOLEAN\b/gim)].map((achado) => achado[1]),
  )
  const { COLUNAS_BOOLEANAS } = await import('./bancoDoAparelho.js')

  expect([...noSchema].filter((c) => !COLUNAS_BOOLEANAS.has(c))).toEqual([])
})
```

Para isso, exportar `COLUNAS_BOOLEANAS` no driver.

- [ ] **Passo 6: quebrar de propósito**

1. `transaction` de `false` para `true` no `run`: os dois testes que conferem o parâmetro precisam
   ficar **vermelhos**.
2. `returnMode` fixo em `'no'`: o teste do `RETURNING` precisa cair.
3. Mandar BEGIN como SQL (remover o ramo de controle de transação): o teste das transações cai.
4. Remover uma coluna de `COLUNAS_BOOLEANAS`: o teste contra o schema cai.

Desfazer as quatro.

- [ ] **Passo 7: commit**

```bash
cd .. && git add frontend/ && git commit -m "Liga o nucleo ao SQLite nativo do aparelho"
```

---

### Tarefa 3: O seed da primeira abertura

**Arquivos:**
- Criar: `frontend/src/local/semear.js`
- Teste: `frontend/src/local/semear.test.js`

**Interfaces:**
- Consome: o contrato de banco — `query` (assíncrono, devolve `{ rows }`) e `aplicarSql`.
- Produz: `semear(bd) => Promise<void>` e `CONTA_PADRAO`.

Tudo que lê usa `await bd.query(...)` e `.rows`, e não uma forma síncrona: é a única que os **dois**
drivers oferecem — o de teste (`node:sqlite`) e o do aparelho, que é assíncrono por natureza.
`aplicarSql` fica só para os dois arquivos `.sql`, que são muitos comandos de uma vez.

- [ ] **Passo 1: escrever os testes, contra `node:sqlite` de verdade**

```js
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { semear, CONTA_PADRAO } from './semear.js'
import { verificarSenha } from './senha.js'

/** Banco vazio, com o mesmo contrato que o driver do aparelho oferece. */
async function bancoVazio() {
  const { criarBancoSqlite } = await import('../../../backend/src/config/sqlite.js')
  return criarBancoSqlite({ arquivo: ':memory:' })
}

const linhas = async (bd, sql) => (await bd.query(sql)).rows

describe('seed da primeira abertura', () => {
  it('cria o schema, o catalogo e a conta padrao', async () => {
    const bd = await bancoVazio()

    await semear(bd)

    const exercicios = await linhas(bd, 'SELECT COUNT(*)::int AS n FROM exercicio')
    expect(exercicios[0].n).toBe(77)

    const contas = await linhas(bd, 'SELECT cpf, aluno, professor, admin FROM usuario')
    expect(contas).toHaveLength(1)
    expect(contas[0].cpf).toBe(CONTA_PADRAO.cpf)
    // Os tres perfis: quem administra, da aula e treina na propria academia.
    expect(contas[0]).toMatchObject({ aluno: true, professor: true, admin: true })
  })

  it('a senha padrao entra como hash utilizavel, e nao em texto', async () => {
    const bd = await bancoVazio()
    await semear(bd)

    const [conta] = await linhas(bd, 'SELECT senha FROM usuario')
    expect(conta.senha).not.toBe(CONTA_PADRAO.senha)
    expect(conta.senha).toMatch(/^[0-9a-f]{64}:[0-9a-f]{128}$/)
    expect(await verificarSenha(conta.senha, CONTA_PADRAO.senha)).toBe(true)
  })

  // Reabrir o app nao pode duplicar nada nem apagar o que foi feito. E o teste
  // mais importante daqui: o seed roda em TODA abertura.
  it('rodar de novo nao duplica e nao apaga', async () => {
    const bd = await bancoVazio()
    await semear(bd)

    await bd.query(
      `INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
       VALUES ('55555555555', 'Aluno Novo', 'sal:hash', 'a@b.com', '555555555555', TRUE, FALSE, FALSE, TRUE)`,
    )

    await semear(bd)

    const contas = await linhas(bd, 'SELECT cpf FROM usuario ORDER BY cpf')
    expect(contas.map((c) => c.cpf)).toContain('55555555555')
    expect(contas.filter((c) => c.cpf === CONTA_PADRAO.cpf)).toHaveLength(1)

    const exercicios = await linhas(bd, 'SELECT COUNT(*)::int AS n FROM exercicio')
    expect(exercicios[0].n).toBe(77)
  })

  it('nasce com alunos de exemplo e um treino de dois blocos', async () => {
    const bd = await bancoVazio()
    await semear(bd)

    const alunos = await linhas(
      bd,
      'SELECT nome FROM usuario WHERE aluno = TRUE AND admin = FALSE',
    )
    expect(alunos.length).toBeGreaterThan(0)

    const blocos = await linhas(bd, 'SELECT letra FROM treino_bloco ORDER BY letra')
    expect(blocos.map((b) => b.letra)).toEqual(['A', 'B'])

    const exercicios = await linhas(bd, 'SELECT COUNT(*)::int AS n FROM ex_usuario')
    expect(exercicios[0].n).toBeGreaterThan(0)
  })

  // O treino de exemplo aponta para exercicios do catalogo por nome. Se o
  // seed.sql mudar, isso precisa estourar, e nao gerar treino vazio.
  it('o treino de exemplo aponta para exercicios que existem', async () => {
    const bd = await bancoVazio()
    await semear(bd)

    const orfaos = await linhas(
      bd,
      `SELECT COUNT(*)::int AS n FROM ex_usuario e
        LEFT JOIN exercicio c ON c.id_exercicio = e.id_exercicio
       WHERE c.id_exercicio IS NULL`,
    )
    expect(orfaos[0].n).toBe(0)
  })
})
```

- [ ] **Passo 2: rodar e confirmar o vermelho**

```bash
cd frontend && npx vitest run src/local/semear.test.js
```

- [ ] **Passo 3: escrever o seed**

O schema e o catálogo entram por `?raw` do Vite, para não duplicar o DDL:

```js
import schemaSql from '../../../backend/db/schema.sql?raw'
import catalogoSql from '../../../backend/db/seed.sql?raw'
import { criarHashComSal } from './senha.js'

/**
 * A conta com que o aplicativo nasce.
 *
 * **É pública**: está no repositório e dentro do APK. Foi decisão consciente, e o
 * README diz que trocar a senha é o primeiro passo depois de instalar — a tela
 * existe em Perfil → Trocar minha senha.
 *
 * Nasce com os três perfis porque é o caso real de quem usa isto: administra o
 * sistema, dá aula e treina na própria academia. Sem a flag `aluno` a pessoa não
 * apareceria na própria lista de alunos, e não poderia ter treino.
 */
export const CONTA_PADRAO = {
  cpf: '00000000000',
  nome: 'Administrador',
  senha: 'gymsys123',
  email: 'admin@gymsys.local',
  titulo: '000000000000',
}

const ALUNOS_DE_EXEMPLO = [
  { cpf: '11111111111', nome: 'Ana Souza', titulo: '111111111111' },
  { cpf: '22222222222', nome: 'Bruno Lima', titulo: '222222222222' },
]

const BLOCOS_DE_EXEMPLO = [
  { letra: 'A', nome: 'Peito e Tríceps', exercicios: ['SUPINO SENTADO', 'CROSS OVER (CRUCIFIXO)'] },
  { letra: 'B', nome: 'Costas e Bíceps', exercicios: ['PUXADOR FRENTE', 'ROSCA DIRETA W'] },
]

/**
 * Prepara o banco na abertura do app.
 *
 * Roda em **toda** abertura, e não só na primeira: o `CREATE TABLE IF NOT EXISTS`
 * do schema é idempotente, e os dados só entram quando ainda não há usuário
 * nenhum. Assim não é preciso guardar em outro lugar a informação de "já
 * semeei" — que seria mais um estado para sair de sincronia com a realidade do
 * banco.
 */
export async function semear(bd) {
  bd.aplicarSql(schemaSql)

  const { rows } = await bd.query('SELECT COUNT(*)::int AS n FROM usuario')
  if (rows[0].n > 0) return

  bd.aplicarSql(catalogoSql)

  const hashDono = await criarHashComSal(CONTA_PADRAO.senha)
  await bd.query(
    `INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
     VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, TRUE, TRUE)`,
    [CONTA_PADRAO.cpf, CONTA_PADRAO.nome, hashDono, CONTA_PADRAO.email, CONTA_PADRAO.titulo],
  )

  const hashExemplo = await criarHashComSal('treino123')
  for (const aluno of ALUNOS_DE_EXEMPLO) {
    await bd.query(
      `INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
       VALUES ($1, $2, $3, $4, $5, TRUE, FALSE, FALSE, TRUE)`,
      [aluno.cpf, aluno.nome, hashExemplo, `${aluno.cpf}@exemplo.local`, aluno.titulo],
    )
  }

  await semearTreinoDeExemplo(bd)
}

/**
 * Um treino montado para a primeira aluna, com dois blocos.
 *
 * Existe para o app não abrir com todas as telas vazias: sem isto, "Meu treino"
 * e o histórico não mostrariam nada, e não se saberia se está vazio ou quebrado.
 */
async function semearTreinoDeExemplo(bd) {
  const { rows: donos } = await bd.query('SELECT id FROM usuario WHERE cpf = $1', [CONTA_PADRAO.cpf])
  const { rows: alunas } = await bd.query('SELECT id FROM usuario WHERE cpf = $1', [
    ALUNOS_DE_EXEMPLO[0].cpf,
  ])

  const { rows: treinos } = await bd.query(
    `INSERT INTO treino (id_aluno, id_professor, ativo) VALUES ($1, $2, TRUE)
     RETURNING id_treino`,
    [alunas[0].id, donos[0].id],
  )
  const idTreino = treinos[0].id_treino

  let ordem = 1
  for (const bloco of BLOCOS_DE_EXEMPLO) {
    const { rows: criados } = await bd.query(
      `INSERT INTO treino_bloco (id_treino, letra, nome, ordem, ativo)
       VALUES ($1, $2, $3, $4, TRUE) RETURNING id_bloco`,
      [idTreino, bloco.letra, bloco.nome, ordem],
    )

    for (const nome of bloco.exercicios) {
      const { rows: achados } = await bd.query(
        'SELECT id_exercicio FROM exercicio WHERE nome_exercicio = $1 LIMIT 1',
        [nome],
      )
      // Estourar, e não pular: um nome que saiu do catálogo deixaria o treino de
      // exemplo incompleto sem ninguém perceber.
      if (achados.length === 0) {
        throw new Error(`Exercício do seed não existe no catálogo: ${nome}`)
      }

      await bd.query(
        `INSERT INTO ex_usuario (id_treino, id_bloco, id_user, id_exercicio,
                                 numero_serie, carga, repeticoes, ativo)
         VALUES ($1, $2, $3, $4, 3, 20, '12', TRUE)`,
        [idTreino, criados[0].id_bloco, alunas[0].id, achados[0].id_exercicio],
      )
    }
    ordem += 1
  }
}
```

- [ ] **Passo 4: rodar e confirmar o verde**

```bash
cd frontend && npx vitest run src/local/semear.test.js
```

- [ ] **Passo 5: quebrar de propósito**

1. Remover o `if (rows[0].n > 0) return`: o teste de rodar duas vezes precisa ficar **vermelho**, com
   a conta padrão duplicada.
2. Gravar `CONTA_PADRAO.senha` direto na coluna, sem hash: o teste da senha cai.
3. Trocar um nome de `BLOCOS_DE_EXEMPLO` por um inexistente: o `throw` precisa aparecer como falha do
   teste, e não como treino incompleto passando.

Desfazer as três.

- [ ] **Passo 6: commit**

```bash
cd .. && git add frontend/ && git commit -m "Faz o app nascer com conta, alunos de exemplo e um treino"
```

---

### Tarefa 4: Capacitor e o projeto Android

**Arquivos:**
- Criar: `frontend/capacitor.config.ts`, `frontend/scripts/apk.mjs`
- Gerado: `frontend/android/`
- Modificar: `frontend/package.json`, `.gitignore`

- [ ] **Passo 1: instalar e configurar**

```bash
cd frontend
npm install @capacitor/core @capacitor-community/sqlite
npm install -D @capacitor/cli @capacitor/android
```

Criar `frontend/capacitor.config.ts`:

```ts
import type { CapacitorConfig } from '@capacitor/cli'

/**
 * O `webDir` aponta para `dist-app`, e não `dist`: é a saída do
 * `build:standalone`, a única que leva o núcleo do backend dentro. Empacotar
 * `dist` geraria um APK que tenta falar com um servidor que não existe.
 */
const config: CapacitorConfig = {
  appId: 'com.cintra.gymsys',
  appName: 'Gym Sys',
  webDir: 'dist-app',
  android: {
    // O app é offline: sem isto, o WebView tentaria carregar por http e o
    // Android bloquearia conteúdo misto.
    allowMixedContent: false,
  },
}

export default config
```

- [ ] **Passo 2: gerar o projeto Android**

```bash
cd frontend && npm run build:standalone && npx cap add android
```

O `cap add` exige que `dist-app` já exista, por isso o build vem antes.

- [ ] **Passo 3: acertar as versões do Gradle para o SDK instalado**

A máquina tem **platform android-37.0** e **build-tools 36.0.0**, e o Capacitor gera o projeto
pedindo outras — provavelmente uma platform que não está baixada.

Em `frontend/android/variables.gradle`, mudar **apenas duas linhas**, deixando todo o resto como o
Capacitor gerou:

```gradle
    compileSdkVersion = 37
    targetSdkVersion = 37
```

Nada mais. As versões de biblioteca que o Capacitor escreve ali são as que ele testou com a própria
versão — trocá-las por conta própria é trocar um erro conhecido por um desconhecido. Esta é a única
edição à mão dentro de `android/`, e existe para não baixar uma platform inteira sem necessidade.

Se mesmo assim o Gradle pedir uma platform que falta, a mensagem dele diz qual: instalar pelo SDK
Manager do Android Studio é mais rápido que discutir com o Gradle.

- [ ] **Passo 4: o script que gera o APK**

Criar `frontend/scripts/apk.mjs`:

```js
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Gera o APK de depuração.
 *
 * Existe porque `JAVA_HOME` e `ANDROID_HOME` não estão definidos nesta máquina —
 * o Java vive dentro do Android Studio. Sem resolver os dois, o Gradle falha com
 * "JAVA_HOME is not set", que não diz o que fazer.
 *
 * Depuração, e não release: para uso próprio basta, e release exigiria gerar e
 * guardar uma keystore.
 */
const estudio = process.env.ANDROID_STUDIO ?? 'C:\\Program Files\\Android\\Android Studio'
const javaHome = process.env.JAVA_HOME ?? join(estudio, 'jbr')
const androidHome =
  process.env.ANDROID_HOME ?? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk')

for (const [nome, caminho] of [
  ['JAVA_HOME', javaHome],
  ['ANDROID_HOME', androidHome],
]) {
  if (!existsSync(caminho)) {
    console.error(`${nome} não encontrado em ${caminho}.`)
    console.error('Defina a variável de ambiente e rode de novo.')
    process.exit(1)
  }
}

const pastaAndroid = join(process.cwd(), 'android')
if (!existsSync(pastaAndroid)) {
  console.error('A pasta android/ não existe. Rode: npx cap add android')
  process.exit(1)
}

const gradlew = join(pastaAndroid, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')

execFileSync(gradlew, ['assembleDebug'], {
  cwd: pastaAndroid,
  stdio: 'inherit',
  env: { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: androidHome, ANDROID_SDK_ROOT: androidHome },
})

const apk = join(pastaAndroid, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
console.log(existsSync(apk) ? `APK pronto: ${apk}` : 'Gradle terminou, mas o APK não foi encontrado.')
```

Em `package.json`:

```json
    "apk": "npm run build:standalone && npx cap sync android && node scripts/apk.mjs",
```

- [ ] **Passo 5: ignorar o que é gerado**

No `.gitignore` da raiz, acrescentar as saídas do Android — o projeto `android/` **fica versionado**
(o `variables.gradle` editado à mão precisa viajar), mas não o que o Gradle produz:

```gitignore
android/app/build
android/build
android/.gradle
android/local.properties
android/app/src/main/assets/public
android/app/src/main/res/xml/config.xml
```

- [ ] **Passo 6: gerar o APK**

```bash
cd frontend && npm run apk
```

A primeira execução baixa o Gradle e as dependências — demora. Esperado ao fim: o caminho do
`app-debug.apk`.

- [ ] **Passo 7: commit**

```bash
cd .. && git add -A && git commit -m "Empacota o app com Capacitor e gera o APK de depuracao"
```

---

### Tarefa 5: Emulador, instalação e a verificação que importa

Esta tarefa tem **passos manuais seus**: sem `cmdline-tools` na máquina, criar o emulador é pela
interface do Android Studio.

- [ ] **Passo 1: criar o emulador** (manual)

No Android Studio: **More Actions → Virtual Device Manager → Create Virtual Device**.

- Aparelho: **Pixel 6** (tela de tamanho comum, sem recortes exóticos)
- Imagem: **API 35 ou 36**, variante **x86_64** com Google APIs — o Studio baixa (~1,5 GB)
- Nome: qualquer; anotar para o passo seguinte

Um aparelho **modesto** seria melhor para medir o scrypt, mas o emulador roda no processador do PC e
não representa isso de qualquer forma. A medição real fica para quando você instalar no seu telefone.

- [ ] **Passo 2: subir o emulador e instalar**

```bash
"$LOCALAPPDATA/Android/Sdk/emulator/emulator" -list-avds
"$LOCALAPPDATA/Android/Sdk/emulator/emulator" -avd <nome> &
"$LOCALAPPDATA/Android/Sdk/platform-tools/adb" wait-for-device
"$LOCALAPPDATA/Android/Sdk/platform-tools/adb" install -r frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

- [ ] **Passo 3: a verificação que decide se a leva 3 está pronta**

Com o app aberto **e o Wi-Fi do emulador desligado** — offline é o ponto:

1. Entrar com a conta padrão (`000.000.000-00` / `gymsys123`)
2. Abrir a área do professor: a lista de alunos mostra os dois exemplos
3. Abrir "Meu treino" da Ana pela área do professor: os blocos A e B aparecem
4. Trocar para a área do aluno, iniciar o treino, marcar um exercício, finalizar
5. **Fechar o aplicativo de verdade** (não só minimizar: arrastar para fora dos recentes)
6. Abrir de novo, entrar, e conferir que o histórico mostra a sessão de agora

O passo 6 é o objetivo inteiro da seção 6. Se o histórico estiver vazio ali, o banco não persistiu, e
nada mais nesta leva importa.

- [ ] **Passo 4: registrar o que apareceu**

Anotar, para o README e o roadmap: **quanto tempo levou o login** (é a medição do scrypt no
aparelho), se alguma tela ficou visualmente errada no formato do telefone, e qualquer erro que tenha
aparecido. Ler o log com:

```bash
"$LOCALAPPDATA/Android/Sdk/platform-tools/adb" logcat -s Capacitor Capacitor/Console chromium
```

- [ ] **Passo 5: commit do que os achados exigirem**

Se nada apareceu, não há o que commitar aqui — o commit é da Tarefa 6.

---

### Tarefa 6: Documentação

- [ ] **Passo 1: `frontend/README.md`**

Na seção "O app com o backend dentro", acrescentar como gerar e instalar (`npm run apk`, o emulador, o
`adb install`), e **abrir a subseção com o aviso**: a conta padrão é pública, então trocar a senha é o
primeiro passo depois de instalar. Registrar o tempo de login medido no aparelho.

- [ ] **Passo 2: `ROADMAP.md`**

Marcar a leva 3 e a seção 6 como entregues. Substituir a incerteza do scrypt pela medição no
aparelho. Se ficou algo de fora (uma tela torta, um ajuste de layout), abrir item novo em vez de
deixar implícito.

- [ ] **Passo 3: `CLAUDE.md`**

Acrescentar: o APK sai de `npm run apk`, o `webDir` é `dist-app`, `android/variables.gradle` é editado
à mão para as versões instaladas do SDK (e o motivo), e os dois padrões do plugin que precisam ser
sobrescritos (`transaction: false`, `returnMode: 'all'`).

- [ ] **Passo 4: commit**

---

## Pronto quando

- [ ] `cd backend && npm test && npm run test:sqlite` — verdes
- [ ] `cd frontend && npm test -- --run` — verde, com os novos das Tarefas 1 a 3
- [ ] `cd frontend && npm run lint` e `npm run build` — limpos
- [ ] `npm run apk` gera o `app-debug.apk`
- [ ] O app instala, abre **offline**, faz login, executa um treino
- [ ] **O histórico continua lá depois de fechar e reabrir o aplicativo**
- [ ] Nenhum arquivo de `backend/src/` alterado
