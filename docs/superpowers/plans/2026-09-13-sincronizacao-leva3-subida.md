# Sincronização do APK — Leva 3: o recomeço e a subida

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> caixa (`- [ ]`) para acompanhamento.

**Objetivo:** o APK passa a falar com o servidor: ao entrar na sincronização pela primeira vez, o
banco local é **recomeçado** a partir do servidor; daí em diante, cada sessão finalizada **sobe**
sozinha e aparece no site.

**Arquitetura:** uma camada nova em `frontend/src/local/sincronizacao/`, ao lado do núcleo e fora
da tabela de rotas — ela não é um controller. Fala com o Supabase por `fetch` direto, nunca pela
instância do axios: o `api` está capturado pelo adaptador local, e passar por ele traria junto o
interceptor de 401 que derrubaria a sessão do app. O que já subiu é marcado numa tabela **local**,
que o servidor não tem.

**Stack:** JavaScript (ESM), Vitest, SQLite no aparelho, PostgREST, Capacitor.

**Spec:** `docs/superpowers/specs/2026-09-07-sincronizacao-do-apk-design.md`

## Global Constraints

- **Nomes e comentários em pt-BR.** Comentário explica **por quê**, não o quê.
- **Um commit por tarefa**, direto na `main`, sem push. Mensagem em pt-BR sem acento no corpo, e
  **sem `Co-Authored-By`** — só o Cristhian assina os commits deste repositório.
- **Nunca usar `sed -i`** em arquivo-fonte nesta máquina: o observador do Vite não percebe e o dev
  server passa a servir módulo velho. Não mandar texto acentuado por `curl` no Git Bash.
- **As suítes atuais não podem mudar de resultado:** 259 no backend (nos dois bancos), 264 no
  front (mais o que esta leva acrescentar), 53 em `test:rls`, 25 em `test:identidade`.
- **Rota nova no backend exige entrada em `src/local/rotas.js`** — mas **esta leva não cria rota
  nenhuma**: a camada de sincronização fica fora do roteador, e o teste que confere a tabela
  continua valendo como está.
- **`VITE_MODO_APP` vem do `vite.config.ts`**, e `scripts/verificarBundleDoApp.mjs` roda junto do
  build. Nada aqui pode fazer o núcleo sair do bundle.
- **Os testes de `src/local/` rodam em ambiente `node`**, não jsdom.
- **O APK sai de `npm run apk`**, com `webDir` em `dist-app`. Instalar é `adb uninstall` +
  `adb install`, nunca `-r`: o Service Worker guarda o bundle antigo.

## A ordem mudou, e por quê

A spec põe a subida na leva 3 e a descida na leva 4. **Não funciona nessa ordem**, e o motivo só
aparece quando se olha o dado: `sessao_exercicio.id_ex_usuario` aponta para a linha da ficha, e no
aparelho esse id vem da semente local — no servidor é outro. `sincronizar_sessao` recusaria a
subida por chave estrangeira: o exercício que a sessão cita não existe lá.

A saída já estava decidida: **a primeira sincronização não preserva o histórico local** (decisão
dele em 13/09/2026). Então a leva 3 passa a entregar, antes da subida, o **recomeço** — baixar
usuário, catálogo e ficha do servidor e substituir o banco local. Dali em diante as sessões nascem
com ids do servidor, e a subida funciona.

**A leva 4 continua existindo**, com o que sobra e não é pouco: a descida **recorrente** (ficha
editada no navegador aparecendo no app), a regra de não descer com sessão aberta, e o que fazer
quando a ficha muda sob os pés de quem está treinando.

Decidido por ele em 13/09/2026, entre três opções.

## Três armadilhas que o desenho já resolveu

**A hash da senha não desce, e o login do app é local.** A coluna `senha` não é selecionável por
papel nenhum — foi o que a leva 1 garantiu, e não se mexe nisso. Mas o app autentica contra o
SQLite, que precisa da hash. A saída: no recomeço, a pessoa **acabou de digitar** CPF e senha, e a
Edge Function confirmou que estão certos; o app gera a hash local com `criarHashComSal(senha)`, o
mesmo caminho do cadastro. Para quem já existe localmente, a hash que está lá é preservada.

**As sequências locais precisam ser empurradas.** O recomeço insere com os ids do servidor
explícitos. Sem ajustar o contador do SQLite, o primeiro insert local depois disso colide com uma
linha recém-baixada — e o erro parece bug de sincronização, não de sequência.

**401 da sincronização não é sessão expirada.** São duas identidades: o login do app é contra o
SQLite, o token de sincronização é do Supabase. O projeto já caiu numa parecida — o interceptor do
`api.ts` expulsava quem só errou a senha atual, daí a lista `ROTAS_COM_401_DE_FORMULARIO`. Aqui o
problema é resolvido por construção: a camada usa `fetch`, não o `api`, então não há interceptor
no caminho.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `backend/test-dataapi/*.test.js` (criar) | Prova, de fora, que reabrir a Data API não reabriu o buraco |
| `backend/package.json` (modificar) | Script `test:dataapi` |
| `frontend/src/local/schemaLocal.sql` (criar) | O que só existe no aparelho: a tabela do que já subiu |
| `frontend/src/local/semear.js` (modificar) | Aplica o schema local junto do `schema.sql` |
| `frontend/src/local/sincronizacao/cliente.js` (criar) | `fetch` ao PostgREST e à Edge Function; traduz falha de rede, 401 e 403 |
| `frontend/src/local/sincronizacao/identidade.js` (criar) | Troca CPF+senha por token, guarda e lê o token |
| `frontend/src/local/sincronizacao/recomeco.js` (criar) | Baixa usuário, catálogo e ficha; substitui o banco local |
| `frontend/src/local/sincronizacao/subida.js` (criar) | Monta o pacote, chama `sincronizar_sessao`, marca o que subiu |
| `frontend/src/local/sincronizacao/index.js` (criar) | `sincronizar()`, o estado (`local`/`enviando`/`enviado`/`falhou`) e quando roda |
| `frontend/src/pages/aluno/Sincronizacao.tsx` (criar) | A tela: entrar na sincronização, botão manual, o que está pendente |
| `frontend/src/pages/aluno/Historico.tsx` (modificar) | Selo de "não enviado" por sessão |

**Por que uma pasta, e não um arquivo:** são quatro responsabilidades distintas (rede, identidade,
descida inicial, subida) e o conjunto passa de 600 linhas. Arquivo por responsabilidade é o padrão
do `src/local/`, e é o que deixa cada teste focado.

---

### Tarefa 1: Reabrir a Data API, provando que o buraco não voltou

**Arquivos:**
- Criar: `backend/test-dataapi/ajuda.js`
- Criar: `backend/test-dataapi/fechado.test.js`
- Modificar: `backend/package.json`

**Interfaces:**
- Produz: `rest(caminho, { token })` → `{ status, corpo }`, falando com `/rest/v1/`.
- Produz: `npm run test:dataapi`.

**Esta tarefa vem primeiro de propósito.** A spec anterior fechou a Data API porque ela estava
aberta sem políticas; a leva 1 escreveu as políticas; agora ela reabre. Se algo estiver errado, é
melhor descobrir com um teste apontado para fora do que com o app inteiro construído em cima.

- [ ] **Passo 1: o passo dele — reabrir a Data API**

No painel: **Project Settings → API → Exposed schemas**, acrescentar `public`. (Em alguns layouts:
*API Settings → Data API → Exposed schemas*.)

**Avisar e esperar.** Não há ferramenta de MCP para isso, e é mudança na postura de segurança do
banco dele — tem de ser decisão consciente, no momento.

- [ ] **Passo 2: escrever o helper**

`backend/test-dataapi/ajuda.js`:

```js
/**
 * Fala com a Data API do projeto, como o APK vai falar.
 *
 * Suíte à parte porque exige duas coisas que as outras não exigem: rede e a
 * Data API aberta. Enquanto o schema `public` não estiver exposto, ela falha
 * inteira — e é esse o sinal de que a leva 3 ainda não começou.
 */
import { chamarIdentidade, comUsuarioDeTeste } from "../test-identidade/ajuda.js";

export { comUsuarioDeTeste, chamarIdentidade };
export { encerrar, exigirAmbiente } from "../test-identidade/ajuda.js";

const BASE = () => `${process.env.SUPABASE_URL}/rest/v1`;
const CHAVE = () => process.env.SUPABASE_CHAVE_PUBLICA;

/**
 * Uma requisição ao PostgREST. Sem token, vai como `anon`.
 *
 * O corpo volta como texto quando não é JSON: um 401 da plataforma pode vir em
 * HTML, e `resposta.json()` estouraria escondendo o status, que é o que
 * interessa ao teste.
 */
export async function rest(caminho, { token, metodo = "GET", corpo } = {}) {
  const cabecalhos = { apikey: CHAVE(), "content-type": "application/json" };
  if (token) cabecalhos.Authorization = `Bearer ${token}`;

  const resposta = await fetch(`${BASE()}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

  const texto = await resposta.text();
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    dados = texto;
  }
  return { status: resposta.status, corpo: dados };
}

/** O token que a Edge Function emite para uma conta de teste. */
export async function tokenDe({ cpf, senha }) {
  const { corpo } = await chamarIdentidade({ cpf, senha });
  return corpo.token;
}
```

- [ ] **Passo 3: escrever o teste**

`backend/test-dataapi/fechado.test.js`:

```js
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { comUsuarioDeTeste, encerrar, exigirAmbiente, rest, tokenDe } from "./ajuda.js";

describe("a Data API reaberta continua fechada para quem não é dono", () => {
  before(() => exigirAmbiente());
  after(() => encerrar());

  it("o visitante sem token não lê tabela nenhuma", async () => {
    for (const tabela of ["usuario", "treino", "sessao_treino", "exercicio", "pedido_treino"]) {
      const { status, corpo } = await rest(`/${tabela}?select=*`);
      assert.ok(
        status === 401 || (Array.isArray(corpo) && corpo.length === 0),
        `anon leu ${tabela}: ${status} ${JSON.stringify(corpo)}`,
      );
    }
  });

  it("a coluna senha não sai nem para quem tem token", async () => {
    await comUsuarioDeTeste({}, async ({ cpf, senha }) => {
      const token = await tokenDe({ cpf, senha });
      const { status, corpo } = await rest("/usuario?select=senha", { token });
      assert.notEqual(status, 200, `a senha saiu: ${JSON.stringify(corpo)}`);
    });
  });

  it("com token, o aluno lê a própria linha e só ela", async () => {
    await comUsuarioDeTeste({}, async ({ id, cpf, senha }) => {
      const token = await tokenDe({ cpf, senha });
      const { status, corpo } = await rest("/usuario?select=id,nome", { token });
      assert.equal(status, 200, JSON.stringify(corpo));
      assert.deepEqual(
        corpo.map((l) => l.id),
        [id],
        "o token abriu mais do que a própria linha",
      );
    });
  });

  it("o aluno não escreve na ficha pelo PostgREST", async () => {
    await comUsuarioDeTeste({}, async ({ id, cpf, senha }) => {
      const token = await tokenDe({ cpf, senha });
      const { status } = await rest("/treino", {
        token,
        metodo: "POST",
        corpo: { id_aluno: id, id_professor: id },
      });
      assert.ok(status >= 400, "o aluno escreveu ficha pelo PostgREST");
    });
  });

  it("as tabelas sem uso seguem inalcançáveis", async () => {
    await comUsuarioDeTeste({}, async ({ cpf, senha }) => {
      const token = await tokenDe({ cpf, senha });
      for (const tabela of ["admin_user", "regras_usuario", "tentativa_login"]) {
        const { status } = await rest(`/${tabela}?select=*`, { token });
        assert.ok(status >= 400, `${tabela} respondeu ${status}`);
      }
    });
  });
});
```

- [ ] **Passo 4: acrescentar o script e rodar**

```json
"test:dataapi": "node --test --test-concurrency=1 \"test-dataapi/*.test.js\" --disable-warning=ExperimentalWarning"
```

```bash
cd backend && npm run test:dataapi
```

Esperado: PASS nos cinco. **Se qualquer um falhar, parar e fechar a Data API de novo** — é
vulnerabilidade, não teste desatualizado.

- [ ] **Passo 5: commit**

```bash
git add backend/test-dataapi/ backend/package.json
git commit -m "data api reaberta, com o teste que prova que o buraco nao voltou"
```

---

### Tarefa 2: A tabela local do que já subiu

**Arquivos:**
- Criar: `frontend/src/local/schemaLocal.sql`
- Criar: `frontend/src/local/bancoDeTeste.js`
- Modificar: `frontend/src/local/semear.js`
- Criar: `frontend/src/local/schemaLocal.test.js`

**Interfaces:**
- Produz: tabela `sincronizacao_envio (uuid TEXT PRIMARY KEY, enviado_em TEXT NOT NULL)` no banco
  do aparelho, e `aplicarSchemaLocal(bd)` chamado por `semear()`.

**Por que tabela separada, e não uma coluna `sincronizado_em` em `sessao_treino` como a spec
dizia:** duas razões práticas. O SQLite **não tem `ADD COLUMN IF NOT EXISTS`**, então a coluna
exigiria ler `PRAGMA table_info` a cada abertura para decidir se altera. E a coluna moraria numa
tabela que o `schema.sql` — compartilhado com o servidor — define; ou ela vazaria para o servidor,
ou o schema passaria a divergir entre os dois lados. Uma tabela própria, num arquivo que só o app
aplica, deixa a fronteira explícita: **o que está aqui não existe no servidor**.

- [ ] **Passo 1: extrair o helper que abre o banco de teste**

Hoje cada arquivo de teste do `src/local/` tem a sua cópia de `bancoVazio()` — ver
`semear.test.js`. Três arquivos novos desta leva precisam do mesmo, então ele sai para um lugar só
**antes** de duplicar pela quarta vez.

`frontend/src/local/bancoDeTeste.js`:

```js
/**
 * Banco vazio para os testes, com o mesmo contrato que o driver do aparelho
 * oferece — inclusive `BEGIN`/`COMMIT` por `query`.
 *
 * Estava copiado em cada arquivo de teste do `src/local/`; saiu para cá quando
 * a sincronização passou a precisar dele em três lugares novos.
 */
export async function abrirBancoDeTeste() {
  const { criarBancoSqlite } = await import('../../../backend/src/config/sqlite.js')
  return criarBancoSqlite({ arquivo: ':memory:' })
}
```

Trocar as cópias de `semear.test.js` (e das outras que tiverem uma igual) por este import, e rodar
`npm test` para confirmar que nada mudou de resultado.

- [ ] **Passo 2: escrever o teste**

`frontend/src/local/schemaLocal.test.js`:

```js
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { abrirBancoDeTeste } from './bancoDeTeste.js'
import { semear, SEMENTE_PUBLICA } from './semear.js'

describe('schema local do aparelho', () => {
  it('cria a tabela de envios, que o servidor nao tem', async () => {
    const bd = await abrirBancoDeTeste()
    await semear(bd, SEMENTE_PUBLICA)

    const { rows } = await bd.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sincronizacao_envio'",
    )
    expect(rows).toHaveLength(1)
  })

  it('guarda o uuid enviado e nao aceita o mesmo duas vezes', async () => {
    const bd = await abrirBancoDeTeste()
    await semear(bd, SEMENTE_PUBLICA)

    const uuid = '11111111-2222-3333-4444-555555555555'
    await bd.query('INSERT INTO sincronizacao_envio (uuid, enviado_em) VALUES ($1, $2)', [
      uuid,
      new Date().toISOString(),
    ])

    await expect(
      bd.query('INSERT INTO sincronizacao_envio (uuid, enviado_em) VALUES ($1, $2)', [
        uuid,
        new Date().toISOString(),
      ]),
    ).rejects.toThrow()
  })

  it('abrir duas vezes nao quebra', async () => {
    const bd = await abrirBancoDeTeste()
    await semear(bd, SEMENTE_PUBLICA)
    await expect(semear(bd, SEMENTE_PUBLICA)).resolves.not.toThrow()
  })
})
```

- [ ] **Passo 3: rodar e ver falhar**

```bash
cd frontend && npm test -- schemaLocal
```

Esperado: FALHA, `no such table: sincronizacao_envio`.

- [ ] **Passo 4: escrever o schema local**

`frontend/src/local/schemaLocal.sql`:

```sql
-- O que existe SO no aparelho. O servidor nao tem nada disto, e nao deve ter.
--
-- Fica fora do schema.sql, que e compartilhado com o servidor, para a fronteira
-- ser explicita: coluna nova aqui nunca sobe, e coluna nova la nunca precisa de
-- traducao aqui.

-- Marca de "esta sessao ja subiu".
--
-- E atalho, e nao garantia: a garantia e o indice unico de `uuid` no servidor.
-- Se o app morrer entre subir e marcar, a proxima tentativa e reconhecida como
-- repetida (`criada: false`) e a marca se corrige sozinha.
--
-- Tabela, e nao coluna em sessao_treino: o SQLite nao tem ADD COLUMN IF NOT
-- EXISTS, e a coluna teria de morar no schema compartilhado.
CREATE TABLE IF NOT EXISTS sincronizacao_envio (
    uuid        TEXT PRIMARY KEY,
    enviado_em  TEXT NOT NULL
);
```

- [ ] **Passo 5: aplicar junto do schema**

Em `frontend/src/local/semear.js`, no topo:

```js
import schemaLocalSql from './schemaLocal.sql?raw'
```

E dentro de `semear()`, logo depois de `bd.aplicarSql(schemaSql)`:

```js
  // Depois do schema compartilhado e antes de qualquer consulta: o resto da
  // abertura ja pode contar com a tabela de envios.
  bd.aplicarSql(schemaLocalSql)
```

- [ ] **Passo 6: rodar e ver passar**

```bash
cd frontend && npm test
```

- [ ] **Passo 7: commit**

```bash
git add frontend/src/local/schemaLocal.sql frontend/src/local/bancoDeTeste.js frontend/src/local/schemaLocal.test.js \
        frontend/src/local/semear.js
git commit -m "tabela local do que ja subiu, fora do schema compartilhado"
```

---

### Tarefa 3: O cliente do Supabase

**Arquivos:**
- Criar: `frontend/src/local/sincronizacao/cliente.js`
- Criar: `frontend/src/local/sincronizacao/cliente.test.js`

**Interfaces:**
- Produz: `criarCliente({ url, chave, buscar = fetch })` → `{ rest, rpc, funcao }`.
  - `rest(caminho, { token, metodo, corpo })` → dados, ou lança `ErroSincronizacao`.
  - `rpc(nome, argumentos, { token })` → dados.
  - `funcao(nome, corpo)` → dados (sem token; é a Edge Function de identidade).
- Produz: `ErroSincronizacao` com `tipo`: `"rede"` | `"credencial"` | `"politica"` | `"servidor"`.

**Os três tipos de falha não são a mesma coisa, e confundi-los é o bug mais provável desta leva:**

- **`rede`** — sem sinal, portal cativo, servidor fora. É o caso **normal**, não erro: tenta de
  novo depois.
- **`credencial`** (401) — o token venceu ou foi revogado. Pede para entrar de novo **na
  sincronização**, e **nunca** derruba a sessão local do app.
- **`politica`** (403) — política de RLS recusou. É **bug**, não transiente: grita, vai para o log
  e para a tela, e não tenta de novo em silêncio.

- [ ] **Passo 1: escrever o teste**

`frontend/src/local/sincronizacao/cliente.test.js`:

```js
import { describe, expect, it, vi } from 'vitest'
import { criarCliente, ErroSincronizacao } from './cliente.js'

const OPCOES = { url: 'https://projeto.supabase.co', chave: 'chave-publica' }

function respostaFalsa({ status = 200, corpo = [], texto } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => texto ?? JSON.stringify(corpo),
  }
}

describe('cliente do Supabase', () => {
  it('manda a apikey e o token no lugar certo', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaFalsa({ corpo: [{ id: 1 }] }))
    const cliente = criarCliente({ ...OPCOES, buscar })

    const dados = await cliente.rest('/treino?select=*', { token: 'tok' })

    expect(dados).toEqual([{ id: 1 }])
    const [url, config] = buscar.mock.calls[0]
    expect(url).toBe('https://projeto.supabase.co/rest/v1/treino?select=*')
    expect(config.headers.apikey).toBe('chave-publica')
    expect(config.headers.Authorization).toBe('Bearer tok')
  })

  it('falha de rede vira tipo "rede", que e o caso normal', async () => {
    const buscar = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const cliente = criarCliente({ ...OPCOES, buscar })

    const erro = await cliente.rest('/treino').catch((e) => e)
    expect(erro).toBeInstanceOf(ErroSincronizacao)
    expect(erro.tipo).toBe('rede')
  })

  it('401 vira "credencial" — e nunca deve derrubar a sessao do app', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaFalsa({ status: 401, corpo: {} }))
    const cliente = criarCliente({ ...OPCOES, buscar })

    const erro = await cliente.rest('/treino', { token: 'velho' }).catch((e) => e)
    expect(erro.tipo).toBe('credencial')
  })

  it('403 vira "politica", que e bug e nao transiente', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaFalsa({ status: 403, corpo: {} }))
    const cliente = criarCliente({ ...OPCOES, buscar })

    const erro = await cliente.rest('/treino', { token: 'tok' }).catch((e) => e)
    expect(erro.tipo).toBe('politica')
  })

  it('500 vira "servidor"', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaFalsa({ status: 500, corpo: {} }))
    const cliente = criarCliente({ ...OPCOES, buscar })

    const erro = await cliente.rest('/treino').catch((e) => e)
    expect(erro.tipo).toBe('servidor')
  })

  it('resposta que nao e JSON nao estoura em cima do status', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaFalsa({ status: 502, texto: '<html>ops' }))
    const cliente = criarCliente({ ...OPCOES, buscar })

    const erro = await cliente.rest('/treino').catch((e) => e)
    expect(erro.tipo).toBe('servidor')
  })

  it('rpc chama a funcao do banco com o corpo em argumentos', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaFalsa({ corpo: { criada: true } }))
    const cliente = criarCliente({ ...OPCOES, buscar })

    await cliente.rpc('sincronizar_sessao', { pacote: { uuid: 'x' } }, { token: 'tok' })

    const [url, config] = buscar.mock.calls[0]
    expect(url).toBe('https://projeto.supabase.co/rest/v1/rpc/sincronizar_sessao')
    expect(config.method).toBe('POST')
    expect(JSON.parse(config.body)).toEqual({ pacote: { uuid: 'x' } })
  })

  it('funcao vai para /functions/v1 e NAO leva token', async () => {
    const buscar = vi.fn().mockResolvedValue(respostaFalsa({ corpo: { token: 'novo' } }))
    const cliente = criarCliente({ ...OPCOES, buscar })

    await cliente.funcao('identidade', { cpf: '1', senha: '2' })

    const [url, config] = buscar.mock.calls[0]
    expect(url).toBe('https://projeto.supabase.co/functions/v1/identidade')
    expect(config.headers.Authorization).toBeUndefined()
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

- [ ] **Passo 3: escrever o cliente**

`frontend/src/local/sincronizacao/cliente.js`:

```js
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

export function criarCliente({ url, chave, buscar = fetch }) {
  const base = url.replace(/\/$/, '')

  async function pedir(endereco, { token, metodo = 'GET', corpo } = {}) {
    const cabecalhos = { apikey: chave, 'content-type': 'application/json' }
    if (token) cabecalhos.Authorization = `Bearer ${token}`

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
      const mensagem = dados?.message ?? dados?.erro ?? `Servidor respondeu ${resposta.status}`
      throw new ErroSincronizacao(tipo, mensagem, dados)
    }

    return dados
  }

  return {
    rest: (caminho, opcoes) => pedir(`${base}/rest/v1${caminho}`, opcoes),
    rpc: (nome, argumentos, opcoes = {}) =>
      pedir(`${base}/rest/v1/rpc/${nome}`, { ...opcoes, metodo: 'POST', corpo: argumentos }),
    // Sem token: é ela que emite. O `verify_jwt` da função é `false`.
    funcao: (nome, corpo) => pedir(`${base}/functions/v1/${nome}`, { metodo: 'POST', corpo }),
  }
}
```

- [ ] **Passo 4: rodar e ver passar**

- [ ] **Passo 5: provar a distinção que mais importa**

Troque `tipoDoStatus` por `() => 'servidor'`. Os testes de **401 e 403** têm de ficar vermelhos —
é a distinção que impede a sincronização de expulsar quem só está com o token vencido, e de
engolir em silêncio uma política errada. Desfaça.

- [ ] **Passo 6: commit**

```bash
git add frontend/src/local/sincronizacao/cliente.js frontend/src/local/sincronizacao/cliente.test.js
git commit -m "cliente do Supabase: fetch direto, e rede, credencial e politica separados"
```

---

### Tarefa 4: A identidade no aparelho

**Arquivos:**
- Criar: `frontend/src/local/sincronizacao/identidade.js`
- Criar: `frontend/src/local/sincronizacao/identidade.test.js`

**Interfaces:**
- Consome: `criarCliente` da Tarefa 3.
- Produz: `entrar(cliente, { cpf, senha })` → `{ token, expira_em, usuario }`;
  `guardarToken(token, expiraEm)`, `tokenGuardado()` → `{ token, expiraEm } | null`,
  `esquecerToken()`; `tokenValido(agora)`.

**O token vale 30 dias e mora no `localStorage` do WebView.** É o mesmo lugar do token do app, com
chave diferente (`gymsys.sync.token`). Vale a ressalva que já está no `CLAUDE.md`: um XSS o expõe —
e a mitigação continua sendo não ter XSS (React escapa, nada usa `dangerouslySetInnerHTML`).

- [ ] **Passo 1: escrever o teste**

`frontend/src/local/sincronizacao/identidade.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ErroSincronizacao } from './cliente.js'
import {
  entrar,
  esquecerToken,
  guardarToken,
  tokenGuardado,
  tokenValido,
} from './identidade.js'

const AGORA = 1_760_000_000

describe('identidade da sincronizacao', () => {
  beforeEach(() => esquecerToken())

  it('entra e devolve o token da funcao', async () => {
    const cliente = {
      funcao: vi.fn().mockResolvedValue({
        token: 'tok',
        expira_em: AGORA + 100,
        usuario: { id: 7, nome: 'Ana' },
      }),
    }

    const resultado = await entrar(cliente, { cpf: '111.111.111-11', senha: 'senha123' })

    expect(resultado.token).toBe('tok')
    expect(cliente.funcao).toHaveBeenCalledWith('identidade', {
      cpf: '111.111.111-11',
      senha: 'senha123',
    })
  })

  it('guarda e le o token', () => {
    guardarToken('tok', AGORA + 100)
    expect(tokenGuardado()).toEqual({ token: 'tok', expiraEm: AGORA + 100 })
  })

  it('sem token guardado, devolve nulo em vez de estourar', () => {
    expect(tokenGuardado()).toBeNull()
  })

  it('token vencido nao vale', () => {
    guardarToken('tok', AGORA - 1)
    expect(tokenValido(AGORA)).toBe(false)
  })

  it('token que vence em menos de um dia ja nao vale', () => {
    // Renovar com folga evita a sincronização começar e morrer no meio por
    // vencimento — o app tem 30 dias de janela, um dia de margem é barato.
    guardarToken('tok', AGORA + 60 * 60 * 12)
    expect(tokenValido(AGORA)).toBe(false)
  })

  it('token com folga vale', () => {
    guardarToken('tok', AGORA + 60 * 60 * 24 * 10)
    expect(tokenValido(AGORA)).toBe(true)
  })

  it('credencial errada chega como ErroSincronizacao de credencial', async () => {
    const cliente = {
      funcao: vi.fn().mockRejectedValue(
        new ErroSincronizacao('credencial', 'CPF ou senha incorretos'),
      ),
    }

    const erro = await entrar(cliente, { cpf: '1', senha: '2' }).catch((e) => e)
    expect(erro.tipo).toBe('credencial')
    expect(tokenGuardado()).toBeNull()
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

- [ ] **Passo 3: escrever a identidade**

`frontend/src/local/sincronizacao/identidade.js`:

```js
/**
 * A identidade da sincronização — separada da do aplicativo.
 *
 * O app autentica contra o SQLite do aparelho; isto aqui autentica contra o
 * servidor. São duas, e é de propósito: dá para treinar sem nunca ter entrado
 * na sincronização, e o token daqui vencer não derruba ninguém de lá.
 */
const CHAVE = 'gymsys.sync.token'
const CHAVE_EXPIRA = 'gymsys.sync.expira'

/**
 * Um dia de folga antes do vencimento.
 *
 * Sem ela, uma sincronização podia começar com o token vivo e morrer no meio —
 * com metade das sessões enviadas e um erro de credencial na tela. Com 30 dias
 * de validade, um dia de margem não custa nada.
 */
const FOLGA_SEGUNDOS = 60 * 60 * 24

export async function entrar(cliente, { cpf, senha }) {
  const resposta = await cliente.funcao('identidade', { cpf, senha })
  guardarToken(resposta.token, resposta.expira_em)
  return resposta
}

export function guardarToken(token, expiraEm) {
  localStorage.setItem(CHAVE, token)
  localStorage.setItem(CHAVE_EXPIRA, String(expiraEm))
}

export function tokenGuardado() {
  const token = localStorage.getItem(CHAVE)
  const expiraEm = Number(localStorage.getItem(CHAVE_EXPIRA))
  if (!token || !Number.isFinite(expiraEm)) return null
  return { token, expiraEm }
}

export function esquecerToken() {
  localStorage.removeItem(CHAVE)
  localStorage.removeItem(CHAVE_EXPIRA)
}

export function tokenValido(agoraEmSegundos = Math.floor(Date.now() / 1000)) {
  const guardado = tokenGuardado()
  if (!guardado) return false
  return guardado.expiraEm - FOLGA_SEGUNDOS > agoraEmSegundos
}
```

- [ ] **Passo 4: rodar e ver passar**

- [ ] **Passo 5: commit**

```bash
git add frontend/src/local/sincronizacao/identidade.js \
        frontend/src/local/sincronizacao/identidade.test.js
git commit -m "identidade da sincronizacao, separada da do aplicativo"
```

---

### Tarefa 5: O recomeço

**Arquivos:**
- Criar: `frontend/src/local/sincronizacao/recomeco.js`
- Criar: `frontend/src/local/sincronizacao/recomeco.test.js`

**Interfaces:**
- Consome: `cliente` (Tarefa 3), o banco do aparelho, `criarHashComSal` de `src/local/senha.js`.
- Produz: `recomecar(bd, cliente, { token, senha })` → `{ usuario, exercicios, blocos, exercíciosDaFicha }`
  (contagens), depois de substituir o banco local.

**É aqui que a leva ganha sentido, e é a tarefa mais delicada.** Ela **apaga** o que existe
localmente — histórico incluído, por decisão dele de 13/09 — e põe no lugar o que o servidor tem.
Três coisas que não podem ser esquecidas, e cada uma tem teste próprio:

1. **A hash da senha não desce.** A coluna `senha` não é selecionável, e não vai ser. A pessoa
   acabou de digitar a senha para entrar na sincronização, e a Edge Function confirmou; o app gera
   a hash com `criarHashComSal`, o mesmo caminho do cadastro.
2. **As sequências ficam atrás dos ids baixados.** Insere-se com id explícito; sem empurrar o
   contador, o próximo insert local colide.
3. **Tudo numa transação.** Falha no meio não pode deixar o aparelho sem ficha nenhuma. No driver
   do aparelho, `BEGIN`/`COMMIT` são **métodos do plugin**, não SQL solto — a armadilha que o
   `CLAUDE.md` registra.

- [ ] **Passo 1: escrever o teste**

`frontend/src/local/sincronizacao/recomeco.test.js`:

```js
import { describe, expect, it, vi } from 'vitest'
import { abrirBancoDeTeste } from '../bancoDeTeste.js'
import { semear, SEMENTE_PUBLICA } from '../semear.js'
import { verificarSenha } from '../senha.js'
import { recomecar } from './recomeco.js'

/** O que o servidor devolveria: ids que NAO sao os da semente local. */
function servidorFalso() {
  return {
    rest: vi.fn(async (caminho) => {
      if (caminho.startsWith('/usuario')) {
        return [
          {
            id: 501,
            nome: 'Dono do Aparelho',
            cpf: '11111111111',
            email: 'dono@exemplo.local',
            titulo: '111111111111',
            aluno: true,
            professor: true,
            admin: true,
            ativo: true,
          },
        ]
      }
      if (caminho.startsWith('/exercicio')) {
        return [
          { id_exercicio: 901, nome_exercicio: 'SUPINO RETO', tipo: 'PEITORAL' },
          { id_exercicio: 902, nome_exercicio: 'ROSCA DIRETA', tipo: 'BICEPS' },
        ]
      }
      if (caminho.startsWith('/treino')) {
        return [
          {
            id_treino: 701,
            id_aluno: 501,
            id_professor: 501,
            ativo: true,
            criado_em: '2026-09-01T10:00:00Z',
            treino_bloco: [
              {
                id_bloco: 801,
                id_treino: 701,
                letra: 'A',
                nome: 'Peito',
                ordem: 1,
                ativo: true,
              },
            ],
            ex_usuario: [
              {
                id: 601,
                id_treino: 701,
                id_bloco: 801,
                id_user: 501,
                id_exercicio: 901,
                numero_serie: 3,
                repeticoes: '10',
                carga: 20,
                observacao: null,
                ativo: true,
              },
            ],
          },
        ]
      }
      throw new Error(`caminho nao esperado: ${caminho}`)
    }),
  }
}

async function bancoSemeado() {
  const bd = await abrirBancoDeTeste()
  await semear(bd, SEMENTE_PUBLICA)
  return bd
}

describe('recomeco', () => {
  it('troca a ficha local pela do servidor, com os ids de la', async () => {
    const bd = await bancoSemeado()
    await recomecar(bd, servidorFalso(), { token: 'tok', senha: 'senha-digitada' })

    const treinos = await bd.query('SELECT id_treino FROM treino')
    expect(treinos.rows.map((l) => l.id_treino)).toEqual([701])

    const exercicios = await bd.query('SELECT id, id_exercicio FROM ex_usuario')
    expect(exercicios.rows).toEqual([{ id: 601, id_exercicio: 901 }])
  })

  it('o login local continua funcionando depois — a hash e refeita da senha digitada', async () => {
    const bd = await bancoSemeado()
    await recomecar(bd, servidorFalso(), { token: 'tok', senha: 'senha-digitada' })

    const { rows } = await bd.query('SELECT senha FROM usuario WHERE cpf = $1', ['11111111111'])
    expect(rows).toHaveLength(1)
    expect(await verificarSenha(rows[0].senha, 'senha-digitada')).toBe(true)
  })

  it('o proximo insert local nao colide com id baixado', async () => {
    const bd = await bancoSemeado()
    await recomecar(bd, servidorFalso(), { token: 'tok', senha: 'senha-digitada' })

    await bd.query(
      `INSERT INTO sessao_treino (id_treino, id_bloco, id_aluno, iniciado_em)
       VALUES (701, 801, 501, $1)`,
      [new Date().toISOString()],
    )
    const { rows } = await bd.query('SELECT id_sessao FROM sessao_treino')
    expect(rows).toHaveLength(1)

    // E o mesmo vale para usuario, que tambem recebeu id explicito.
    await bd.query(
      `INSERT INTO usuario (cpf, nome, senha, email, titulo)
       VALUES ('99999999999', 'Novo', 'x:y', 'n@e.local', '999999999999')`,
    )
    const usuarios = await bd.query('SELECT id FROM usuario ORDER BY id')
    expect(new Set(usuarios.rows.map((l) => l.id)).size).toBe(usuarios.rows.length)
  })

  it('o historico local e descartado — decisao dele, e precisa estar na tela', async () => {
    const bd = await bancoSemeado()
    const { rows: antes } = await bd.query('SELECT COUNT(*)::int AS n FROM ex_usuario')
    expect(antes[0].n).toBeGreaterThan(0)

    await recomecar(bd, servidorFalso(), { token: 'tok', senha: 'senha-digitada' })

    const { rows } = await bd.query('SELECT COUNT(*)::int AS n FROM sessao_treino')
    expect(rows[0].n).toBe(0)
  })

  it('falha no meio nao deixa o aparelho sem ficha', async () => {
    const bd = await bancoSemeado()
    const cliente = servidorFalso()
    // A ficha vem por último; falhar nela é o pior caso: o catálogo já entrou.
    cliente.rest = vi.fn(async (caminho) => {
      if (caminho.startsWith('/treino')) throw new Error('rede caiu')
      return servidorFalso().rest(caminho)
    })

    await expect(
      recomecar(bd, cliente, { token: 'tok', senha: 'senha-digitada' }),
    ).rejects.toThrow()

    const { rows } = await bd.query('SELECT COUNT(*)::int AS n FROM usuario')
    expect(rows[0].n).toBeGreaterThan(0)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

- [ ] **Passo 3: escrever o recomeço**

`frontend/src/local/sincronizacao/recomeco.js`:

```js
import { criarHashComSal } from '../senha.js'

/**
 * Troca o banco local pelo que o servidor tem.
 *
 * É o que faz a subida ser possível: `sessao_exercicio.id_ex_usuario` aponta
 * para a linha da ficha, e o servidor só aceita a sessão se esse id for o dele.
 * Enquanto a ficha local vier da semente, com ids próprios, nada sobe.
 *
 * **Apaga o histórico local** — decisão dele em 13/09/2026, tomada depois de o
 * teste de campo já ter gerado treinos no aparelho. Quem chama tem de avisar
 * antes, na tela.
 */
export async function recomecar(bd, cliente, { token, senha }) {
  // A rede toda ANTES de tocar no banco: se a ficha não vier, o aparelho fica
  // exatamente como estava, com a ficha velha, em vez de meio recomeçado.
  const [usuarios, exercicios, treinos] = await Promise.all([
    cliente.rest('/usuario?select=id,nome,cpf,email,titulo,aluno,professor,admin,ativo', { token }),
    cliente.rest('/exercicio?select=id_exercicio,nome_exercicio,tipo', { token }),
    cliente.rest(
      '/treino?select=*,treino_bloco(*),ex_usuario(*)&ativo=eq.true',
      { token },
    ),
  ])

  const dono = usuarios[0]
  if (!dono) throw new Error('o servidor não devolveu usuário nenhum para este token')

  // A hash não desce, e não vai descer: a coluna `senha` não é selecionável por
  // papel nenhum. Mas a pessoa acabou de digitar a senha e a Edge Function
  // confirmou que está certa, então dá para refazer a hash aqui, pelo mesmo
  // caminho do cadastro. Sem isto, o login do app (que é local) pararia de
  // funcionar depois do recomeço.
  const hash = await criarHashComSal(senha)

  // `BEGIN`/`COMMIT`/`ROLLBACK` passam por `query` mesmo: os dois drivers os
  // reconhecem e fazem o certo de cada lado — no aparelho eles viram os
  // **métodos** do plugin de SQLite, e no `node:sqlite` dos testes vão diretos,
  // sem `prepare()`. É por isso que não existe um `bd.transacao` aqui.
  await bd.query('BEGIN')
  try {
    // A ordem é a das dependências, de trás para a frente: sessao_serie
    // referencia sessao_exercicio, que referencia sessao_treino...
    for (const tabela of [
      'sessao_serie',
      'sessao_exercicio',
      'sessao_treino',
      'pedido_treino',
      'ex_usuario',
      'treino_bloco',
      'treino',
      'exercicio',
      'usuario',
      'sincronizacao_envio',
    ]) {
      await bd.query(`DELETE FROM ${tabela}`)
    }

    await bd.query(
      `INSERT INTO usuario (id, nome, senha, cpf, email, titulo, aluno, professor, admin, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        dono.id,
        dono.nome,
        hash,
        dono.cpf,
        dono.email,
        dono.titulo,
        dono.aluno,
        dono.professor,
        dono.admin,
        dono.ativo,
      ],
    )

    for (const exercicio of exercicios) {
      await bd.query(
        'INSERT INTO exercicio (id_exercicio, nome_exercicio, tipo) VALUES ($1, $2, $3)',
        [exercicio.id_exercicio, exercicio.nome_exercicio, exercicio.tipo],
      )
    }

    for (const treino of treinos) {
      await bd.query(
        `INSERT INTO treino (id_treino, id_aluno, id_professor, ativo, criado_em)
         VALUES ($1, $2, $3, $4, $5)`,
        [treino.id_treino, treino.id_aluno, treino.id_professor, treino.ativo, treino.criado_em],
      )

      for (const bloco of treino.treino_bloco ?? []) {
        await bd.query(
          `INSERT INTO treino_bloco (id_bloco, id_treino, letra, nome, ordem, ativo)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [bloco.id_bloco, bloco.id_treino, bloco.letra, bloco.nome, bloco.ordem, bloco.ativo],
        )
      }

      for (const exercicio of treino.ex_usuario ?? []) {
        await bd.query(
          `INSERT INTO ex_usuario
             (id, id_treino, id_bloco, id_user, id_exercicio, numero_serie, repeticoes, carga,
              observacao, ativo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            exercicio.id,
            exercicio.id_treino,
            exercicio.id_bloco,
            exercicio.id_user,
            exercicio.id_exercicio,
            exercicio.numero_serie,
            exercicio.repeticoes,
            exercicio.carga,
            exercicio.observacao,
            exercicio.ativo,
          ],
        )
      }
    }

    await empurrarSequencias(bd)
    await bd.query('COMMIT')
  } catch (erro) {
    // Sem isto, uma falha no meio deixaria o aparelho com as tabelas apagadas e
    // sem ficha nenhuma — o pior estado possível, e o que o teste "falha no
    // meio nao deixa o aparelho sem ficha" existe para impedir.
    await bd.query('ROLLBACK')
    throw erro
  }

  return {
    usuario: dono,
    exercicios: exercicios.length,
    blocos: treinos.reduce((total, t) => total + (t.treino_bloco?.length ?? 0), 0),
    exerciciosDaFicha: treinos.reduce((total, t) => total + (t.ex_usuario?.length ?? 0), 0),
  }
}

/**
 * Põe o contador de cada tabela atrás do maior id baixado.
 *
 * Sem isto, o primeiro INSERT local depois do recomeço tenta reusar um id que
 * acabou de chegar do servidor — e o erro ("UNIQUE constraint failed") parece
 * bug de sincronização, não de sequência.
 *
 * `sqlite_sequence` só tem linha para tabela que já gerou id, daí o INSERT OR
 * REPLACE em vez de UPDATE.
 */
async function empurrarSequencias(bd) {
  const tabelas = [
    ['usuario', 'id'],
    ['exercicio', 'id_exercicio'],
    ['treino', 'id_treino'],
    ['treino_bloco', 'id_bloco'],
    ['ex_usuario', 'id'],
    ['sessao_treino', 'id_sessao'],
    ['sessao_exercicio', 'id'],
    ['sessao_serie', 'id'],
    ['pedido_treino', 'id_pedido'],
  ]

  for (const [tabela, coluna] of tabelas) {
    const { rows } = await bd.query(`SELECT COALESCE(MAX(${coluna}), 0) AS maior FROM ${tabela}`)
    await bd.query('INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ($1, $2)', [
      tabela,
      rows[0].maior,
    ])
  }
}
```

- [ ] **Passo 4: rodar e ver passar**

- [ ] **Passo 5: provar as duas armadilhas**

Primeiro: comente a linha do `criarHashComSal` e grave `dono.senha ?? ''`. O teste **"o login local
continua funcionando depois" tem de ficar vermelho**. Desfaça.

Depois: comente a chamada a `empurrarSequencias`. O teste **"o proximo insert local nao colide"
tem de ficar vermelho**. Desfaça.

- [ ] **Passo 6: commit**

```bash
git add frontend/src/local/sincronizacao/recomeco.js \
        frontend/src/local/sincronizacao/recomeco.test.js
git commit -m "recomeco: o banco do aparelho passa a ser o do servidor"
```

---

### Tarefa 6: A subida

**Arquivos:**
- Criar: `frontend/src/local/sincronizacao/subida.js`
- Criar: `frontend/src/local/sincronizacao/subida.test.js`

**Interfaces:**
- Consome: `cliente.rpc` (Tarefa 3), a tabela `sincronizacao_envio` (Tarefa 2).
- Produz: `sessoesPendentes(bd)` → linhas; `montarPacote(bd, idSessao)` → o JSONB;
  `subir(bd, cliente, { token })` → `{ enviadas, repetidas, falhas }`.

- [ ] **Passo 1: escrever o teste**

`frontend/src/local/sincronizacao/subida.test.js`:

```js
import { describe, expect, it, vi } from 'vitest'
import { abrirBancoDeTeste } from '../bancoDeTeste.js'
import { semear, SEMENTE_PUBLICA } from '../semear.js'
import { montarPacote, sessoesPendentes, subir } from './subida.js'

/** Uma sessão finalizada, com um exercício e duas séries. */
async function sessaoFinalizada(bd, { finalizada = true } = {}) {
  const { rows: fichas } = await bd.query(
    'SELECT id, id_treino, id_bloco, id_user FROM ex_usuario LIMIT 1',
  )
  const ficha = fichas[0]

  const { rows } = await bd.query(
    `INSERT INTO sessao_treino (id_treino, id_bloco, id_aluno, iniciado_em, finalizado_em,
                                duracao_segundos, observacao, calorias)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id_sessao`,
    [
      ficha.id_treino,
      ficha.id_bloco,
      ficha.id_user,
      '2026-09-13T10:00:00.000Z',
      finalizada ? '2026-09-13T11:00:00.000Z' : null,
      finalizada ? 3600 : null,
      'pesado',
      300,
    ],
  )
  const idSessao = rows[0].id_sessao

  const { rows: exercicios } = await bd.query(
    `INSERT INTO sessao_exercicio (id_sessao, id_ex_usuario, concluido, concluido_em)
     VALUES ($1, $2, TRUE, $3) RETURNING id`,
    [idSessao, ficha.id, '2026-09-13T10:30:00.000Z'],
  )
  for (const carga of [20, 25]) {
    await bd.query(
      'INSERT INTO sessao_serie (id_sessao_exercicio, carga, repeticoes) VALUES ($1, $2, $3)',
      [exercicios[0].id, carga, '10'],
    )
  }
  return idSessao
}

async function bancoComSessao(opcoes) {
  const bd = await abrirBancoDeTeste()
  await semear(bd, SEMENTE_PUBLICA)
  const idSessao = await sessaoFinalizada(bd, opcoes)
  return { bd, idSessao }
}

describe('subida', () => {
  it('so sessao finalizada entra na fila', async () => {
    const { bd } = await bancoComSessao({ finalizada: false })
    expect(await sessoesPendentes(bd)).toHaveLength(0)
  })

  it('o pacote leva a sessao inteira, com as series', async () => {
    const { bd, idSessao } = await bancoComSessao()
    const pacote = await montarPacote(bd, idSessao)

    expect(pacote.duracao_segundos).toBe(3600)
    expect(pacote.observacao).toBe('pesado')
    expect(pacote.exercicios).toHaveLength(1)
    expect(pacote.exercicios[0].series).toHaveLength(2)
    expect(pacote.exercicios[0].series.map((s) => s.carga)).toEqual([20, 25])
  })

  it('cada linha do pacote leva um uuid, e ele e gravado no aparelho', async () => {
    const { bd, idSessao } = await bancoComSessao()
    const pacote = await montarPacote(bd, idSessao)

    expect(pacote.uuid).toMatch(/^[0-9a-f-]{36}$/i)

    const { rows } = await bd.query('SELECT uuid FROM sessao_treino WHERE id_sessao = $1', [
      idSessao,
    ])
    expect(rows[0].uuid).toBe(pacote.uuid)
  })

  it('montar duas vezes devolve o MESMO uuid', async () => {
    const { bd, idSessao } = await bancoComSessao()
    const primeiro = await montarPacote(bd, idSessao)
    const segundo = await montarPacote(bd, idSessao)

    // Se o uuid mudasse a cada tentativa, a idempotência do servidor não valeria
    // nada: cada retentativa criaria uma sessão nova.
    expect(segundo.uuid).toBe(primeiro.uuid)
  })

  it('subiu: marca e nao tenta de novo', async () => {
    const { bd } = await bancoComSessao()
    const cliente = { rpc: vi.fn().mockResolvedValue({ id_sessao: 999, criada: true }) }

    const resultado = await subir(bd, cliente, { token: 'tok' })
    expect(resultado).toEqual({ enviadas: 1, repetidas: 0, falhas: 0 })

    const segunda = await subir(bd, cliente, { token: 'tok' })
    expect(segunda.enviadas).toBe(0)
    expect(cliente.rpc).toHaveBeenCalledTimes(1)
  })

  it('o servidor dizer "ja existia" tambem marca — e o conserto da marca perdida', async () => {
    const { bd } = await bancoComSessao()
    const cliente = { rpc: vi.fn().mockResolvedValue({ id_sessao: 999, criada: false }) }

    const resultado = await subir(bd, cliente, { token: 'tok' })
    expect(resultado).toEqual({ enviadas: 0, repetidas: 1, falhas: 0 })
    expect(await sessoesPendentes(bd)).toHaveLength(0)
  })

  it('falha de rede nao marca, e a sessao continua pendente', async () => {
    const { bd } = await bancoComSessao()
    const cliente = { rpc: vi.fn().mockRejectedValue(new Error('rede caiu')) }

    const resultado = await subir(bd, cliente, { token: 'tok' })
    expect(resultado.falhas).toBe(1)
    expect(await sessoesPendentes(bd)).toHaveLength(1)
  })

  it('token vencido para tudo, em vez de repetir o 401 por sessao', async () => {
    const { bd } = await bancoComSessao()
    await sessaoFinalizada(bd)

    const { ErroSincronizacao } = await import('./cliente.js')
    const cliente = {
      rpc: vi.fn().mockRejectedValue(new ErroSincronizacao('credencial', 'token velho')),
    }

    await expect(subir(bd, cliente, { token: 'velho' })).rejects.toMatchObject({
      tipo: 'credencial',
    })
    // Uma chamada só: o token vale para todas, insistir seria gastar rede à toa.
    expect(cliente.rpc).toHaveBeenCalledTimes(1)
  })

  it('uma sessao que falha nao impede as outras de subirem', async () => {
    const { bd } = await bancoComSessao()
    await sessaoFinalizada(bd)

    let chamada = 0
    const cliente = {
      rpc: vi.fn(async () => {
        chamada += 1
        if (chamada === 1) throw new Error('rede caiu')
        return { id_sessao: 999, criada: true }
      }),
    }

    const resultado = await subir(bd, cliente, { token: 'tok' })
    expect(resultado).toEqual({ enviadas: 1, repetidas: 0, falhas: 1 })
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

- [ ] **Passo 3: escrever a subida**

`frontend/src/local/sincronizacao/subida.js`:

```js
/**
 * Manda as sessões finalizadas para o servidor.
 *
 * Uma chamada por sessão, em `sincronizar_sessao`: o pacote inteiro numa
 * transação do lado de lá. Três POST separados não serviriam — as linhas filhas
 * referenciam `id_sessao`, que é o SERIAL do servidor e o aparelho não conhece.
 */

/**
 * Sessões finalizadas que ainda não subiram.
 *
 * A marca é local (`sincronizacao_envio`) e é atalho: a garantia de verdade é o
 * índice único de `uuid` no servidor. Uma marca perdida custa uma chamada a
 * mais, que volta como `criada: false`.
 */
export async function sessoesPendentes(bd) {
  const { rows } = await bd.query(
    `SELECT s.id_sessao
       FROM sessao_treino s
       LEFT JOIN sincronizacao_envio e ON e.uuid = s.uuid
      WHERE s.finalizado_em IS NOT NULL
        AND e.uuid IS NULL
      ORDER BY s.id_sessao`,
  )
  return rows
}

/**
 * Monta o pacote e **grava o uuid no aparelho** antes de mandar.
 *
 * Gravar antes não é detalhe: se o uuid nascesse a cada tentativa, uma
 * retentativa depois de uma queda de rede criaria uma sessão nova no servidor,
 * e a idempotência do índice único não valeria nada.
 */
export async function montarPacote(bd, idSessao) {
  const { rows: sessoes } = await bd.query(
    `SELECT id_sessao, id_treino, id_bloco, id_aluno, iniciado_em, finalizado_em,
            duracao_segundos, observacao, calorias, uuid
       FROM sessao_treino WHERE id_sessao = $1`,
    [idSessao],
  )
  const sessao = sessoes[0]
  if (!sessao) throw new Error(`sessão ${idSessao} não existe no aparelho`)

  const uuid = sessao.uuid ?? crypto.randomUUID()
  if (!sessao.uuid) {
    await bd.query('UPDATE sessao_treino SET uuid = $1 WHERE id_sessao = $2', [uuid, idSessao])
  }

  const { rows: exercicios } = await bd.query(
    `SELECT id, id_ex_usuario, concluido, concluido_em, uuid
       FROM sessao_exercicio WHERE id_sessao = $1 ORDER BY id`,
    [idSessao],
  )

  const montados = []
  for (const exercicio of exercicios) {
    const uuidExercicio = exercicio.uuid ?? crypto.randomUUID()
    if (!exercicio.uuid) {
      await bd.query('UPDATE sessao_exercicio SET uuid = $1 WHERE id = $2', [
        uuidExercicio,
        exercicio.id,
      ])
    }

    const { rows: series } = await bd.query(
      `SELECT id, carga, repeticoes, uuid
         FROM sessao_serie WHERE id_sessao_exercicio = $1 ORDER BY id`,
      [exercicio.id],
    )

    const seriesMontadas = []
    for (const serie of series) {
      const uuidSerie = serie.uuid ?? crypto.randomUUID()
      if (!serie.uuid) {
        await bd.query('UPDATE sessao_serie SET uuid = $1 WHERE id = $2', [uuidSerie, serie.id])
      }
      seriesMontadas.push({ uuid: uuidSerie, carga: serie.carga, repeticoes: serie.repeticoes })
    }

    montados.push({
      uuid: uuidExercicio,
      id_ex_usuario: exercicio.id_ex_usuario,
      concluido: exercicio.concluido,
      concluido_em: exercicio.concluido_em,
      series: seriesMontadas,
    })
  }

  return {
    uuid,
    id_treino: sessao.id_treino,
    id_bloco: sessao.id_bloco,
    id_aluno: sessao.id_aluno,
    iniciado_em: sessao.iniciado_em,
    finalizado_em: sessao.finalizado_em,
    duracao_segundos: sessao.duracao_segundos,
    observacao: sessao.observacao,
    calorias: sessao.calorias,
    exercicios: montados,
  }
}

export async function subir(bd, cliente, { token }) {
  const pendentes = await sessoesPendentes(bd)
  let enviadas = 0
  let repetidas = 0
  let falhas = 0

  for (const { id_sessao: idSessao } of pendentes) {
    const pacote = await montarPacote(bd, idSessao)
    try {
      const resposta = await cliente.rpc('sincronizar_sessao', { pacote }, { token })

      await bd.query('INSERT INTO sincronizacao_envio (uuid, enviado_em) VALUES ($1, $2)', [
        pacote.uuid,
        new Date().toISOString(),
      ])

      // `criada: false` quer dizer que o uuid já estava lá: o app morreu entre
      // subir e marcar numa tentativa anterior. Marcar agora conserta.
      if (resposta?.criada) enviadas += 1
      else repetidas += 1
    } catch (erro) {
      // Credencial é a exceção: o token venceu, e ele vale para TODAS as
      // sessões. Insistir nas outras seria gastar rede à toa para colecionar o
      // mesmo 401 — então relança, e quem chamou desliga a sincronização.
      if (erro?.tipo === 'credencial') throw erro

      // O resto não pode segurar a fila: a sessão seguinte pode ser a que sobe.
      falhas += 1
      console.error('[sincronizacao] sessão', idSessao, erro?.tipo ?? '', erro?.message ?? erro)
    }
  }

  return { enviadas, repetidas, falhas }
}
```

- [ ] **Passo 4: rodar e ver passar**

- [ ] **Passo 5: provar a idempotência**

Em `montarPacote`, troque `const uuid = sessao.uuid ?? crypto.randomUUID()` por
`const uuid = crypto.randomUUID()` e grave sempre. O teste **"montar duas vezes devolve o MESMO
uuid" tem de ficar vermelho**. Desfaça.

- [ ] **Passo 6: commit**

```bash
git add frontend/src/local/sincronizacao/subida.js frontend/src/local/sincronizacao/subida.test.js
git commit -m "subida: uma sessao, um pacote, um uuid estavel"
```

---

### Tarefa 7: Quando roda, e o estado

**Arquivos:**
- Criar: `frontend/src/local/sincronizacao/index.js`
- Criar: `frontend/src/local/sincronizacao/index.test.js`

**Interfaces:**
- Produz: `criarSincronizacao({ bd, cliente })` → `{ sincronizar, estado, assinar, entrarNaSincronizacao, sair }`.
- `estado()` → `{ ligada, online, ultima, pendentes, ocupada }`.

**Como o app sabe que está online:** pela **última tentativa real**, e não por `navigator.onLine` —
que no Android mente, dizendo `true` com Wi-Fi conectado e sem saída para a internet, que é
exatamente o caso da academia com portal cativo.

**Quando roda:** ao abrir o app, ao finalizar uma sessão, e no botão manual. **Sem serviço em
segundo plano** — isso é obra própria, com bateria e permissão do Android no meio.

- [ ] **Passo 1: escrever o teste**

`frontend/src/local/sincronizacao/index.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ErroSincronizacao } from './cliente.js'
import { esquecerToken, guardarToken } from './identidade.js'
import { criarSincronizacao } from './index.js'

const DAQUI_A_UM_MES = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30

function bancoFalso(pendentes = 0) {
  return {
    query: vi.fn(async (sql) => {
      if (/COUNT/i.test(sql)) return { rows: [{ n: pendentes }] }
      return { rows: [] }
    }),
  }
}

describe('motor de sincronizacao', () => {
  beforeEach(() => esquecerToken())

  it('sem token, nao tenta rede nenhuma', async () => {
    const cliente = { rpc: vi.fn(), rest: vi.fn() }
    const sinc = criarSincronizacao({ bd: bancoFalso(), cliente })

    const resultado = await sinc.sincronizar()

    expect(resultado.ligada).toBe(false)
    expect(cliente.rpc).not.toHaveBeenCalled()
  })

  it('falha de rede marca offline, sem estourar', async () => {
    guardarToken('tok', DAQUI_A_UM_MES)
    const cliente = {
      rpc: vi.fn().mockRejectedValue(new ErroSincronizacao('rede', 'Sem conexão')),
      rest: vi.fn().mockRejectedValue(new ErroSincronizacao('rede', 'Sem conexão')),
    }
    const sinc = criarSincronizacao({ bd: bancoFalso(1), cliente })

    await expect(sinc.sincronizar()).resolves.toMatchObject({ online: false })
    expect(sinc.estado().online).toBe(false)
  })

  it('sucesso marca online', async () => {
    guardarToken('tok', DAQUI_A_UM_MES)
    const cliente = { rpc: vi.fn().mockResolvedValue({ criada: true }), rest: vi.fn() }
    const sinc = criarSincronizacao({ bd: bancoFalso(0), cliente })

    await sinc.sincronizar()
    expect(sinc.estado().online).toBe(true)
  })

  it('401 nao derruba a sessao do app — so desliga a sincronizacao', async () => {
    guardarToken('tok', DAQUI_A_UM_MES)
    const cliente = {
      rpc: vi.fn().mockRejectedValue(new ErroSincronizacao('credencial', 'token velho')),
      rest: vi.fn().mockRejectedValue(new ErroSincronizacao('credencial', 'token velho')),
    }
    const sinc = criarSincronizacao({ bd: bancoFalso(1), cliente })

    const resultado = await sinc.sincronizar()

    expect(resultado.precisaEntrarDeNovo).toBe(true)
    expect(sinc.estado().ligada).toBe(false)
  })

  it('nao roda duas vezes ao mesmo tempo', async () => {
    guardarToken('tok', DAQUI_A_UM_MES)
    let resolver
    const cliente = {
      rpc: vi.fn(() => new Promise((r) => { resolver = () => r({ criada: true }) })),
      rest: vi.fn(),
    }
    const sinc = criarSincronizacao({ bd: bancoFalso(1), cliente })

    const primeira = sinc.sincronizar()
    const segunda = await sinc.sincronizar()

    expect(segunda.ocupada).toBe(true)
    resolver()
    await primeira
  })

  it('avisa quem assinou quando o estado muda', async () => {
    guardarToken('tok', DAQUI_A_UM_MES)
    const ouvinte = vi.fn()
    const cliente = { rpc: vi.fn().mockResolvedValue({ criada: true }), rest: vi.fn() }
    const sinc = criarSincronizacao({ bd: bancoFalso(0), cliente })

    sinc.assinar(ouvinte)
    await sinc.sincronizar()

    expect(ouvinte).toHaveBeenCalled()
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

- [ ] **Passo 3: escrever o motor**

`frontend/src/local/sincronizacao/index.js`:

```js
import { entrar, esquecerToken, tokenGuardado, tokenValido } from './identidade.js'
import { recomecar } from './recomeco.js'
import { sessoesPendentes, subir } from './subida.js'

/**
 * O motor: decide quando rodar, guarda o estado e avisa a tela.
 *
 * Roda ao abrir o app, ao finalizar uma sessão e no botão manual. **Sem serviço
 * em segundo plano** — isso é obra própria, com bateria e permissão do Android
 * no meio.
 */
export function criarSincronizacao({ bd, cliente }) {
  const ouvintes = new Set()
  let ocupada = false
  let online = null
  let ultima = null

  const avisar = () => ouvintes.forEach((ouvinte) => ouvinte(estado()))

  function estado() {
    return {
      ligada: tokenValido(),
      online,
      ultima,
      ocupada,
    }
  }

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

    ocupada = true
    avisar()
    try {
      const { token } = tokenGuardado()
      const resultado = await subir(bd, cliente, { token })

      // Falha de credencial não vem como exceção daqui: `subir` engole por
      // sessão para uma não segurar a fila. Se nada subiu e havia pendência, a
      // causa precisa ser olhada — por isso o teste de tipo abaixo.
      online = true
      ultima = new Date().toISOString()
      return { ...resultado, online: true }
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
```

- [ ] **Passo 4: rodar e ver passar**

- [ ] **Passo 5: commit**

```bash
git add frontend/src/local/sincronizacao/index.js frontend/src/local/sincronizacao/index.test.js \
        frontend/src/local/sincronizacao/subida.js frontend/src/local/sincronizacao/subida.test.js
git commit -m "motor da sincronizacao: quando roda, e o que fazer com cada falha"
```

---

### Tarefa 8: A tela

**Arquivos:**
- Criar: `frontend/src/pages/aluno/Sincronizacao.tsx`
- Criar: `frontend/src/pages/aluno/Sincronizacao.test.tsx`
- Modificar: `frontend/src/pages/aluno/AlunoLayout.tsx` (ou onde ficam as rotas do aluno)
- Modificar: `frontend/src/pages/aluno/Historico.tsx`

**Interfaces:**
- Consome: `criarSincronizacao` da Tarefa 7.

**O que a tela precisa dizer, e que não é óbvio:**

- **Que entrar na sincronização apaga o histórico local.** É decisão dele, e tem de estar na tela
  **antes** de acontecer, com confirmação — não numa nota de rodapé.
- **A diferença entre "não enviado" e "deu erro".** Sessão que ainda não subiu porque não houve
  rede é o caso normal; erro é outra coisa.
- **Que o app funciona sem isso.** A sincronização é opcional: dá para treinar o mês inteiro sem
  nunca entrar nela.

- [ ] **Passo 1: escrever o teste**

`frontend/src/pages/aluno/Sincronizacao.test.tsx`, com `renderizar()` de `src/test/utils.tsx` e
`src/local/sincronizacao` mockado:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderizar } from '../../test/utils'
import { Sincronizacao } from './Sincronizacao'

const sincronizar = vi.fn()
const entrarNaSincronizacao = vi.fn()

vi.mock('../../local/sincronizacao', () => ({
  sincronizacaoDoApp: () => ({
    estado: () => ({ ligada: false, online: null, ultima: null, ocupada: false }),
    assinar: () => () => {},
    entrarNaSincronizacao,
    sair: vi.fn(),
    sincronizar,
    pendentes: async () => [],
  }),
}))

describe('tela de sincronizacao', () => {
  it('avisa que o historico local vai embora ANTES de entrar', async () => {
    renderizar(<Sincronizacao />)
    await userEvent.click(screen.getByRole('button', { name: /ativar sincroniza/i }))

    expect(screen.getByText(/hist[óo]rico.*apagad|apaga.*hist[óo]rico/i)).toBeInTheDocument()
    expect(entrarNaSincronizacao).not.toHaveBeenCalled()
  })

  it('so entra depois de confirmar', async () => {
    renderizar(<Sincronizacao />)
    await userEvent.click(screen.getByRole('button', { name: /ativar sincroniza/i }))
    await userEvent.type(screen.getByLabelText(/cpf/i), '11111111111')
    await userEvent.type(screen.getByLabelText(/senha/i), 'senha123')
    await userEvent.click(screen.getByRole('button', { name: /confirmar|entrar/i }))

    await waitFor(() => expect(entrarNaSincronizacao).toHaveBeenCalled())
  })
})
```

- [ ] **Passo 2 a 4:** rodar e ver falhar, escrever a tela (usando `Painel`, `Aviso`, `Botao`,
  `Campo` de `src/components/ui/`, e os três estados de `useRequisicao` onde houver carga), rodar e
  ver passar.

- [ ] **Passo 5: o selo no Histórico**

Em `Historico.tsx`, ao lado da data, um `Selo` discreto quando a sessão ainda não subiu. Nada de
alarme: **não enviado é o caso normal**, e o selo some sozinho quando sobe.

- [ ] **Passo 6: commit**

```bash
git add frontend/src/pages/aluno/
git commit -m "tela da sincronizacao, com o aviso do historico antes de entrar"
```

---

### Tarefa 9: O APK, o emulador e a documentação

**Arquivos:**
- Modificar: `frontend/README.md`, `CLAUDE.md`, `ROADMAP.md`
- Criar: `frontend/src/local/sincronizacao/README.md`

- [ ] **Passo 1: conferir que nada regrediu**

```bash
cd backend && npm test && npm run test:sqlite && npm run test:rls && npm run test:identidade \
  && npm run test:dataapi
cd ../frontend && npm test && npm run lint && npm run build
```

- [ ] **Passo 2: gerar o APK e instalar no emulador**

```bash
cd frontend && npm run apk
```

`adb uninstall` + `adb install`, nunca `-r`. Emulador `gymsys` (Pixel 6, API 36).

- [ ] **Passo 3: o roteiro no emulador**

1. Abrir o app, entrar com a conta da semente, **conferir que dá para treinar sem sincronizar**.
2. Ativar a sincronização; conferir que o aviso do histórico aparece **antes**.
3. Entrar; conferir que a ficha que aparece é a **do servidor**.
4. Fazer uma sessão inteira e finalizar.
5. Conferir no site (ou por `execute_sql`) que a sessão apareceu, **com as séries**.
6. **Modo avião**: fazer outra sessão, conferir o selo de "não enviado" e que nada quebra.
7. Voltar a rede, tocar em sincronizar, conferir que a sessão sobe.
8. Sincronizar de novo: **nada duplica**.

- [ ] **Passo 4: documentar**

`frontend/src/local/sincronizacao/README.md`: as duas identidades, os quatro tipos de erro e o que
fazer com cada um, por que `fetch` e não o `api`, e a fronteira do `schemaLocal.sql`.

No `CLAUDE.md`, na seção do app: que a camada **não** entra em `rotas.js`; que 401 da sincronização
nunca derruba a sessão local; que o recomeço refaz a hash da senha digitada, porque a coluna
`senha` não desce; e que as sequências são empurradas depois de baixar.

- [ ] **Passo 5: commit**

---

## Como se sabe que a leva acabou

- Uma sessão feita no aparelho **aparece no site**, com séries e duração.
- Sincronizar duas vezes deixa **uma** linha.
- Em modo avião o app treina normalmente, e a sessão sobe quando a rede volta.
- `npm run test:dataapi` prova que reabrir a Data API não reabriu o buraco.
- As suítes antigas seguem: 259 no backend (nos dois bancos), 53 no RLS, 25 na identidade, e o
  front sem regressão.

## O que esta leva deliberadamente não faz

| | Por quê |
|---|---|
| Descida recorrente da ficha | Leva 4. Aqui a ficha desce **uma vez**, no recomeço |
| Não descer com sessão aberta | Leva 4, junto com a descida recorrente |
| Telas de professor escrevendo no servidor | Leva 5 |
| Serviço em segundo plano | Obra própria: bateria e permissão do Android no meio |
| Preservar o histórico local na primeira sincronização | Decisão dele em 13/09/2026 |
| Refresh token | O token vale 30 dias; renovar é entrar de novo, que exige rede de qualquer forma |
