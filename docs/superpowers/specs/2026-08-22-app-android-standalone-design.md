# App Android standalone — design

**Data:** 22 de agosto de 2026
**Item do roadmap:** seção 6, "App Android standalone, com o banco dentro"

## Problema

O sistema só funciona com o PC servindo a API. O objetivo, declarado em 20/08/2026, é **um APK para
usar no telefone, offline, com o banco embutido e o usuário já cadastrado — para ver como o sistema
se comporta em campo.**

Não é o PWA com cache de leitura, nem acesso remoto ao PC por Tailscale. Esses resolvem outro
problema: o app real, com o servidor ligado. Aqui o app roda sozinho.

Continuam existindo **as duas versões**: a web sobre PostgreSQL, que é o sistema de verdade, e o APK,
que é o mesmo sistema com outro banco embaixo.

## O que já está provado

Duas rodadas de investigação, e o que cada uma decidiu:

**O spike de 20/08** rodou um controller real do backend dentro de um bundle de browser, sobre
`pg-mem`, com o `schema.sql` e o `seed.sql` de verdade. Listou os 77 exercícios e aplicou a
normalização de nome. Bundle de 180 KB gzipado.

Isso decidiu o que mais importa: **o APK leva as regras verdadeiras**, cobertas pelos 179 testes que
já existem, em vez de uma reimplementação delas no cliente. É a diferença entre testar a tela e
testar o sistema, que é o que o objetivo pede. Essa decisão não se reabre sem motivo novo.

**As sondas de 22/08** mediram o que o spike tinha deixado como incerteza — persistir o banco — e
o resultado mudou o motor escolhido:

| Tentativa no `pg-mem` | Resultado |
|---|---|
| Despejar as tabelas em JSON e recarregar | funciona: 10 KB, com `criado_em` preservado |
| `setval` para reacertar o contador de id | a sequence não existe; nome nenhum a alcança |
| `information_schema.sequences`, `ALTER SEQUENCE` | não existem |
| `ALTER COLUMN id SET DEFAULT funcao()` | o `SERIAL` ignora o novo default |
| `SERIAL` → `INTEGER DEFAULT funcao()` no DDL | o default é avaliado **uma vez** e memoizado |
| `getTable().insert()` preservando o id | insere, mas não move o contador |

Ou seja: dá para salvar e recarregar, mas o contador de id volta a 1 e colide com as linhas
restauradas no primeiro cadastro novo. As saídas seriam queimar o contador com inserções
descartáveis (funciona, e a abertura fica mais lenta conforme o histórico cresce) ou renumerar tudo
traduzindo as chaves estrangeiras (código sensível, cujo erro corrompe o histórico em silêncio).

Nenhuma das duas é boa, e as duas resolvem à mão um problema que um banco de verdade resolve sozinho.

## Decisão central: o APK usa SQLite nativo

O banco embutido é **SQLite nativo**, não o `pg-mem`. A persistência passa a ser do motor: um arquivo
em disco, gravado a cada COMMIT.

O que essa decisão custa é uma camada de tradução de dialeto — e o custo foi medido, não estimado:

- **43 consultas** no total, com 135 parâmetros
- **16 `RETURNING`** (SQLite suporta desde 3.35, de 2021)
- **2 `ILIKE`**, **6 `NOW()`**, **6 casts** (`::int`, `::text`) espalhados por 5 consultas
- **zero** `INTERVAL`, **zero** `ON CONFLICT`

E o `$1` do PostgreSQL corresponde ao `?1` do SQLite, com a mesma numeração — inclusive quando a
mesma consulta usa `$1` duas vezes, o que acontece aqui. A tradução do parâmetro é literalmente
trocar `$` por `?`.

A sonda aplicou o `schema.sql` de verdade, traduzido, e exercitou cada ponto em que o projeto depende
do PostgreSQL:

| Ponto de risco | Resultado |
|---|---|
| DDL inteiro, com os dois índices parciais | funciona |
| `INSERT … RETURNING` | funciona |
| `$1` repetido na mesma consulta | funciona |
| `WHERE ativo = TRUE`, `Boolean(coluna)` | funciona |
| Timestamps sem erro de fuso | resolvido (abaixo) |
| Uma sessão aberta por aluno | **funciona** |
| O `CASE` da troca de login, lendo o valor antigo | funciona |
| `ON DELETE CASCADE`, `COUNT(*)::int` | funcionam |

### Por que isto é melhor, e não só diferente

**A trava de sessão aberta volta a valer.** O `pg-mem` tem um bug com índice parcial — documentado no
`test/helpers.js`, que precisa executar `DROP INDEX idx_sessao_aberta_por_aluno` para a suíte
funcionar. No caminho `pg-mem`, o APK rodaria **sem** a garantia de "no máximo uma sessão em
andamento por aluno", que existe justamente porque dois toques rápidos em "Iniciar" chegam em
paralelo. No SQLite o índice parcial funciona: a sonda tentou abrir a segunda sessão e levou
`UNIQUE constraint failed`.

**Não é emulador.** O que roda no celular é um SQLite de verdade, com durabilidade real. O Android
mata aplicativo em segundo plano a qualquer momento, e com arquivo nativo cada gravação já está no
disco antes disso acontecer — nenhum treino se perde no meio.

### O que garante que o APK se comporta como a web

Uma só cópia das regras, e a equivalência **medida**: os 179 testes passam a rodar nos dois bancos.

```bash
npm test           # pg-mem — o dialeto do PostgreSQL, que é o do servidor de casa
npm run test:sqlite  # SQLite — o banco do APK
```

Isso é o que separa esta decisão da alternativa descartada, de dar ao app código e testes próprios.
Ali, cada trava futura — as de perfil, a de sessão aberta, a expulsão por troca de login — teria de
ser escrita e testada duas vezes, e o que divergisse apareceria só no celular. Aqui, divergência é
teste vermelho na máquina.

A suíte já está pronta para pegar a divergência mais provável: há dezenas de asserções estritas do
tipo `assert.equal(corpo.usuario.professor, false)`. Se o driver devolvesse o `0` que o SQLite
guarda em vez de `false`, elas ficam vermelhas na hora.

## Arquitetura

### O caminho de uma requisição dentro do APK

Nada nas telas muda, e nada nos controllers muda.

```
Tela React
   ↓  api.get('/professores/alunos')
src/lib/api.ts  ← instância axios, com os interceptors de token e de 401
   ↓  adapter trocado: em vez de emitir HTTP, entrega { método, caminho, corpo, headers }
Roteador mínimo (~40 linhas, no lugar do Express)
   ↓  autenticar → exigirPerfil → controller
Controller do backend, sem uma linha alterada
   ↓  db.query(...)
Fachada db → driver SQLite → arquivo no aparelho
```

**Por que o adapter do axios.** Toda chamada do front já passa por `src/lib/api.ts`, que é uma
instância única. Trocando o adapter, as nove telas e os 64 testes do front continuam intactos, e os
interceptors continuam valendo de graça — inclusive a expulsão de sessão por troca de senha ou de
CPF, que é comportamento de servidor que o app precisa manter.

As alternativas eram um Service Worker fingindo ser a rede, frágil de depurar dentro do WebView e
com ciclo de vida que costuma virar tela preta; ou trocar o axios por uma camada de serviço nas
telas, que é refatorar as nove telas antes de o app existir.

### Onde o código mora

O `frontend` ganha um **segundo modo de build**, não um pacote novo:

```bash
npm run build              # web, como hoje: nada de banco embutido
npm run build:standalone   # o app, com o núcleo dentro
```

Um diretório `frontend/src/local/` traz o roteador, as bordas e a configuração do banco, e o
`resolve.alias` do Vite troca os três arquivos de borda no momento do build. **Nenhum arquivo do
backend é editado para isso** — a substituição acontece na montagem.

O custo aceito: o Vite precisa liberar leitura fora da própria raiz, o import atravessa a fronteira
do pacote por caminho relativo, e o `tsc` do build topa com `.js` do backend (resolvido com `allowJs`
ou uma declaração fina). A alternativa era um terceiro pacote, que duplicaria Vite, Tailwind,
tsconfig e ESLint e traria as telas por caminho relativo de qualquer forma; ou converter o monorepo
em workspaces, que é obra estrutural antes da primeira linha do app.

### As três bordas a portar, e nada além delas

Nenhum controller muda. O que não atravessa para o browser:

| Peça | Por que não atravessa | Substituto |
|---|---|---|
| `src/lib/senha.js` | `node:crypto` (scrypt) e `node:util` | `scrypt-js`, mantendo o formato `sal:hash` |
| `src/config/env.js` | `dotenv` puxa `path`/`fs` | configuração fixa embutida |
| `src/config/db.js` | `import pg` estático arrasta `net`/`events` | variante com o driver do aparelho |

A fachada `db` expõe `query`, `connect` e `end`. As transações usam `db.connect()` e depois
`cliente.query("BEGIN")` — no SQLite é a mesma conexão, `release()` não faz nada, e `BEGIN`/`COMMIT`/
`ROLLBACK` são comandos válidos. Nenhuma transação do projeto é aninhada, então não há o que emular.

### Onde cada SQLite roda

- **No APK:** plugin nativo do Capacitor, gravando arquivo no aparelho
- **Nos testes:** `node:sqlite`, que já vem no Node 25 da máquina — nada a instalar
- **No navegador:** não roda o modo standalone

A última linha é escolha consciente. O desenvolvimento das telas continua no navegador **no modo web
normal**, com Vite e a API de verdade, que é o ciclo rápido; só o modo com banco embutido exige
emulador ou aparelho. Isso evita uma terceira implementação da fachada (um SQLite em wasm) que
existiria apenas para conveniência de desenvolvimento, e garante que o que se testa do app é
exatamente o que vai rodar no celular.

## Divisão em três levas

Cada uma termina verificada sozinha.

### Leva 1 — o banco do APK, provado sem Android

Só backend. Não depende de Capacitor, nem de Android Studio, nem do front.

- `src/lib/dialetoSqlite.js` — tradutor puro, string para string, testável isolado:
  - Consultas: `$n` → `?n`; `ILIKE` → `LIKE`; `NOW()` → `strftime('%Y-%m-%dT%H:%M:%fZ','now')`;
    os 5 casts removidos
  - DDL: `SERIAL PRIMARY KEY` → `INTEGER PRIMARY KEY AUTOINCREMENT`; `TIMESTAMPTZ` e `TIMESTAMP` →
    `TEXT`; `VARCHAR(n)` → `TEXT`; `SMALLINT` → `INTEGER`; `DEFAULT CURRENT_TIMESTAMP` → o mesmo
    `strftime`
- `src/config/sqlite.js` — objeto compatível com o pool: `query` devolvendo `{ rows }`, `connect()`
  devolvendo a conexão única com `release()` vazio, `PRAGMA foreign_keys = ON`, e três conversões de
  valor (abaixo)
- `test/helpers.js` — `criarApiDeTeste({ banco: 'sqlite' })`, e o script `test:sqlite`

**Por que o `strftime` em vez do `CURRENT_TIMESTAMP` do SQLite:** o padrão do SQLite grava
`"2026-08-22 19:48:04"`, sem `T` e sem `Z`, e `new Date()` disso interpreta como **hora local** — três
horas de erro no Brasil. Isso quebraria a comparação do `iat` do token com `sessoes_invalidadas_em`,
que é o que expulsa sessão depois de trocar senha ou CPF: a expulsão passaria a acontecer na hora
errada. Com `strftime('%Y-%m-%dT%H:%M:%fZ','now')` o valor sai em ISO UTC e a sonda confirmou o
round-trip exato.

**As três conversões de valor, e por que cada uma existe.** O `node:sqlite` aceita `null`, número,
texto e binário — nada além disso, e a forma como ele recusa o resto é desigual:

| Valor | O que acontece sem converter | Conversão |
|---|---|---|
| `boolean` como parâmetro | recusa com erro claro: "cannot be bound" | `true`/`false` → `1`/`0` |
| `Date` como parâmetro | **aceita e grava `null`, em silêncio** | `.toISOString()` |
| `0`/`1` lido de coluna booleana | a API devolve `ativo: 1` | volta a `true`/`false` |

O caso do `Date` é o mais perigoso dos três, e foi medido: `sessaoController` grava `finalizado_em`
passando um `Date`. Sem a conversão, a coluna ficaria nula, a sessão nunca fecharia, e o índice de
"uma sessão aberta por aluno" — o mesmo que este projeto ganha ao trocar de banco — barraria a sessão
seguinte. O aluno descobriria isso no meio do treino, e nada no log diria por quê.

**Por que a conversão de booleano na leitura:** o SQLite guarda `0`/`1`. Sem converter, a API do app devolveria
`ativo: 1`, e o `EditarUsuario.tsx` compara `perfis.aluno !== usuario.aluno` — `false !== 0` é
verdadeiro, então a tela acharia que os perfis mudaram a cada abertura e dispararia a rota de perfis
sem necessidade.

**Como o driver sabe quais colunas são booleanas:** na abertura, um `PRAGMA table_info` por tabela
monta o conjunto de nomes de coluna declarados `BOOLEAN` no schema — `aluno`, `professor`, `admin`,
`ativo`, `concluido`, `ver`, `alterar`, `apagar`. A conversão acontece por nome, na leitura de cada
linha. O conjunto sai do schema em vez de ser digitado à mão para não envelhecer quando uma flag nova
aparecer.

O limite disso, e vale escrito: consulta que renomeie uma coluna booleana com `AS` outro nome escapa
da conversão. Hoje nenhuma das 43 faz isso, e a suíte dupla acusa se alguma passar a fazer.

**Pronto quando:** `npm test` e `npm run test:sqlite` passam os 179, e no SQLite sem o `DROP INDEX`
que o `pg-mem` exige.

### Leva 2 — o núcleo portável

- As três bordas (`senha.js` com `scrypt-js`, `env.js` fixo, `db.js` do aparelho)
- O roteador mínimo, mapeando método + caminho para controller, com `autenticar` e `exigirPerfil`
- O adapter do axios, e o `resolve.alias` do build standalone
- Testes em Node para o roteador e para o adapter: as rotas certas, os 401 e 403 nos lugares certos,
  e o erro do controller virando resposta em vez de exceção solta

**Pronto quando:** o núcleo atende as rotas fora do Express, provado por teste, e o build
`standalone` sai sem arrastar `pg`, `dotenv` nem `node:crypto`.

### Leva 3 — Capacitor e APK

- Capacitor, plugin de SQLite nativo, e o build para Android
- O seed inicial: sua conta com os três perfis, alunos de exemplo e um treino montado
- Instalação no aparelho e uso em campo

**Pronto quando:** o APK instala, abre offline, faz login, executa um treino e o histórico continua lá
depois de fechar e reabrir o aplicativo.

## Divergências aceitas

**Busca por nome com acento em maiúscula.** O `LIKE` do SQLite ignora maiúsculas só em ASCII. Buscar
`jos%`, `JOS%` ou `José%` encontra "José Antônio"; **`JOSÉ%` não encontra**, enquanto o `ILIKE` do
PostgreSQL encontraria. Afeta a busca de alunos por nome no APK. Fica registrado em vez de resolvido:
a correção seria uma coluna normalizada ou uma função de colação, e nenhuma das duas se justifica
antes de o app estar em uso.

**Os dois bancos não conversam.** O APK e a instância de casa são dois bancos separados. Juntá-los é
outra arquitetura — ids locais contra ids do servidor, fila de escrita, resolução de conflito. Só
encarar se, depois de usar em campo, isso virar necessidade real.

## Riscos abertos

**O custo do scrypt no celular.** `scrypt-js` é JS puro, e scrypt é lento de propósito. Num Android
modesto o login pode demorar. Só dá para medir no aparelho, na leva 3. Se doer, a saída é baixar o
custo — ao preço de o hash divergir do servidor, o que a suíte dupla vai apontar.

**O tradutor cobrindo o que a suíte não exercita.** A garantia de equivalência vale para o que os 179
testes cobrem. Consulta que nenhum teste toca pode divergir em silêncio. O mitigador é a própria
suíte de segurança, que já cobre os caminhos que mais importam, e o uso em campo, que é o objetivo.

## Fora do escopo

- Sincronizar APK e servidor
- PWA com cache de leitura, e acesso remoto por Tailscale (resolvem o outro problema, e o Tailscale
  segue valendo pelo item 1.3 do roadmap)
- Publicar nas lojas (seção 7 do roadmap)
- Um SQLite em wasm para rodar o modo standalone no navegador
