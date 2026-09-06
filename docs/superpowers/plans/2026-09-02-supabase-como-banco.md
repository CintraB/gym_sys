# Supabase como banco gerenciado — plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> caixa (`- [ ]`) para acompanhamento.

**Objetivo:** o gym_sys passa a usar o Postgres do Supabase, sem que uma linha de regra de negócio
mude e sem que o app offline seja afetado.

**Arquitetura:** o Supabase entra **só como banco**. O Express continua sendo a API, rodando no PC de
casa na rede local, e os controllers continuam únicos, compartilhados entre a web e o APK offline. A
mudança no código é pequena de propósito — a fachada `db` já isola o pool, e o trabalho é sobre
conexão, SSL e teto de pool.

**Stack:** Node ≥20, Express 4, `pg`, Postgres 17.6 no Supabase (sa-east-1).

**Spec:** `docs/superpowers/specs/2026-09-02-supabase-como-banco-design.md`

## Restrições globais

- **Nenhum controller muda.** Se uma tarefa exigir mexer em `src/controllers/`, pare e reporte: o
  desenho está errado. A fachada `db` existe justamente para isolar isso.
- **Projeto Supabase**: ref `aluowtzsucntaqszpcsy`, região **sa-east-1 (São Paulo)**, plano **Free**,
  instância **t3.nano**, Postgres **17.6**.
- **`max_connections` é 60, com 13 já em uso** pelos serviços do Supabase. Sobram ~47.
- **A API continua no PC de casa, na rede local.** Hospedagem paga está fora de orçamento, e tornar
  a API alcançável de fora é assunto separado, para depois. Se um dia ela sair de casa, tem de ir
  para um provedor com região no Brasil: o `autenticar` consulta o banco a cada requisição, e o
  banco está em São Paulo.
- **Conexão pelo pooler em session mode (porta 5432)**, nunca transaction mode (6543): os
  controllers usam `db.connect()` com `BEGIN … COMMIT`.
- **SSL com `rejectUnauthorized: true`.** Nunca `false` — desligar a verificação do certificado
  reabre exatamente o ataque que o SSL impede.
- **Segredo nenhum no repositório.** Senha do banco, `service_role` key e `TOKEN_SEG` vivem em
  `backend/.env`, que é local e fora do git. O `.env.example` recebe só o nome das variáveis.
- `npm test` no backend (247) e no front (261) continuam limpos ao fim de cada tarefa.
- Backend em ESM, nomes e comentários em pt-BR, comentário explica **por quê**.
- **Não editar arquivo-fonte com `sed -i`** neste Windows.
- Commits em português sem acento, **sem `Co-Authored-By`**, direto na `main`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `backend/src/config/env.js` | Ganha `DB_SSL` e `DB_POOL_MAX`, com fail-fast preservado |
| `backend/src/config/env.test.js` (novo, se não existir) | Testes da configuração nova |
| `backend/src/config/db.js` | Repassa ssl e `max` ao `pg.Pool` |
| `backend/.env.example` | Documenta as variáveis novas |
| `backend/README.md` | Os dois modos de banco: container local e Supabase |
| `deploy/README.md` | Registra que o Postgres local vira opcional |

Nenhum arquivo é criado. O trabalho todo cabe em duas variáveis de configuração, a carga do schema
no Supabase e documentação — o que é o sinal de que o desenho está certo: a fachada `db` já isolava
exatamente isto.

---

### Tarefa 1: `DB_SSL` e `DB_POOL_MAX` na configuração

O `env.js` monta hoje o objeto `db` sem SSL e sem teto de pool. O `pg` não liga SSL sozinho, e o
`max` padrão dele (10) nunca foi uma escolha — vira uma.

**Arquivos:**
- Modificar: `backend/src/config/env.js`
- Criar ou modificar: `backend/test/` — o teste vai onde a suíte já organiza (confira como
  `test/unit.test.js` importa `carregarConfig`)
- Modificar: `backend/.env.example`

**Interfaces:**
- Consome: nada.
- Produz: `carregarConfig().db` passa a conter `ssl` (objeto `{ rejectUnauthorized: true }` ou
  `false`) e `max` (número).

- [x] **Passo 1: escrever os testes que falham**

Os testes precisam manipular `process.env` e restaurá-lo. Siga o padrão do arquivo de teste onde
você colocá-los.

```js
test("DB_SSL ausente ou 'false' deixa a conexão sem SSL", () => {
  // Postgres local em container não tem certificado; ligar SSL por padrão
  // quebraria o desenvolvimento de todo mundo.
  process.env.DB_SSL = "";
  assert.equal(carregarConfig().db.ssl, false);
});

test("DB_SSL=true exige certificado válido", () => {
  process.env.DB_SSL = "true";
  assert.deepEqual(carregarConfig().db.ssl, { rejectUnauthorized: true });
});

test("o teto do pool tem padrão e é ajustável", () => {
  delete process.env.DB_POOL_MAX;
  assert.equal(carregarConfig().db.max, 10);

  process.env.DB_POOL_MAX = "6";
  assert.equal(carregarConfig().db.max, 6);
});
```

- [x] **Passo 2: rodar e confirmar que falham**

```bash
cd backend && node --test --test-name-pattern "DB_SSL|teto do pool"
```

Esperado: falham, porque `ssl` e `max` não existem no objeto devolvido.

- [x] **Passo 3: implementar**

Em `backend/src/config/env.js`, dentro do objeto `db`:

```js
    db: {
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: Number(process.env.DB_PORT),

      // O Supabase exige TLS; o Postgres em container local não tem
      // certificado. Por isso é opcional, e desligado por padrão.
      //
      // rejectUnauthorized fica TRUE de propósito: aceitar certificado não
      // verificado devolve a conexão ao estado em que um intermediário pode se
      // passar pelo banco — que é o ataque que o TLS existe para impedir.
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : false,

      // Teto explícito porque o plano Free do Supabase dá 60 conexões, e 13 já
      // ficam com os serviços dele. Duas instâncias da API a 10 cada ainda
      // cabem; sem teto declarado, ninguém percebe quando deixar de caber.
      max: Number(process.env.DB_POOL_MAX ?? 10),
    },
```

**Não** acrescente `DB_SSL` nem `DB_POOL_MAX` à lista `OBRIGATORIAS`: as duas têm padrão, e torná-las
obrigatórias quebraria todo `.env` existente.

- [x] **Passo 4: rodar e confirmar que passam**

```bash
cd backend && node --test --test-name-pattern "DB_SSL|teto do pool"
```

- [x] **Passo 5: documentar no `.env.example`**

```
# TLS na conexão do banco. "true" para Supabase ou qualquer banco gerenciado;
# vazio para o Postgres em container local, que não tem certificado.
DB_SSL=
# Conexões simultâneas do pool. O Free do Supabase dá 60 no total, e 13 já são
# dos serviços dele.
DB_POOL_MAX=10
```

- [x] **Passo 6: suíte inteira**

```bash
cd backend && npm test && npm run test:sqlite
```

Esperado: 247 e a suíte SQLite, ambas como antes. Nada aqui toca regra de negócio.

- [x] **Passo 7: commit**

```bash
git add backend/src/config/env.js backend/.env.example backend/test
git commit -m "aceita TLS e teto de pool na configuracao do banco

O Supabase exige TLS e o plano Free da 60 conexoes, 13 ja ocupadas pelos
servicos dele. As duas variaveis tem padrao para nao quebrar .env existente."
```

---

### Tarefa 2: o pool repassa ssl e max

**Arquivos:**
- Modificar: `backend/src/config/db.js`

**Interfaces:**
- Consome: `carregarConfig().db` da Tarefa 1.
- Produz: nada novo — o pool passa a nascer com os dois campos.

- [x] **Passo 1: verificar se já funciona**

`obterPool()` faz `new pg.Pool(carregarConfig().db)`, e o `pg.Pool` aceita `ssl` e `max` no mesmo
objeto de configuração. **Provavelmente não há nada a mudar.** Confirme lendo
`backend/src/config/db.js` e a documentação do `pg`.

Se for o caso, esta tarefa vira uma linha de comentário registrando por que os campos novos
atravessam sem tratamento — e o commit é só isso. **Não invente trabalho** para justificar a tarefa.

- [x] **Passo 2: comentar a passagem**

Acima do `new pg.Pool(...)`:

```js
    // ssl e max vêm no mesmo objeto de config e o pg os entende direto — por
    // isso ligar TLS no Supabase não exigiu tocar aqui.
```

- [x] **Passo 3: suíte inteira**

```bash
cd backend && npm test && npm run test:sqlite
```

- [x] **Passo 4: commit**

```bash
git add backend/src/config/db.js
git commit -m "registra que ssl e max atravessam a fachada sem tratamento"
```

---

### Tarefa 3: aplicar o schema no Supabase e fechar a porta

**Esta tarefa escreve num banco de verdade.** O banco está vazio hoje, então não há dado a perder —
mas confirme isso antes de aplicar qualquer coisa, e **pare se encontrar tabela**.

**Arquivos:** nenhum de código. Trabalho no projeto Supabase.

- [ ] **Passo 1: confirmar que o banco continua vazio**

Pelo MCP do Supabase (`list_tables` no schema `public`) ou pelo Table Editor. Esperado: nenhuma
tabela. **Se houver alguma, pare e reporte** — alguém aplicou algo no meio do caminho e o plano
precisa ser revisto.

- [ ] **Passo 2: aplicar os três arquivos, nesta ordem**

1. `backend/db/schema.sql`
2. `backend/db/seed.sql`
3. `backend/db/triggers.sql`

A ordem não é decorativa: é a mesma que o `docker-compose.yml` garante pelo prefixo numérico. Os
arquivos `migracao-v*.sql` **não entram** — eles atualizam bancos antigos, e este nasce novo.

O MCP do Supabase precisa estar **sem `read_only=true`** para isso, ou aplique pelo editor SQL do
painel. Se refizer o MCP sem read-only, é decisão consciente: registre no relatório.

- [ ] **Passo 3: verificar que as 11 tabelas nasceram com RLS**

O event trigger `ensure_rls` deve ter ligado sozinho:

```sql
select relname, relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by relname;
```

Esperado: **11 linhas, todas com `relrowsecurity = true`**. Qualquer `false` é uma tabela aberta para
a internet — ligue com `alter table <nome> enable row level security` e investigue por que o trigger
não pegou.

- [ ] **Passo 4: tirar `public` dos schemas expostos**

No painel: Settings → API → *Exposed schemas* → remover `public`. É a segunda camada: o RLS já nega
tudo, mas as duas juntas significam que religar uma não abre o banco sozinha.

> **Isto será revertido de propósito mais adiante, e não é contradição.** A obra seguinte —
> sincronização do APK — foi decidida em 03/09/2026 como **APK escrevendo direto no PostgREST**, o
> que exige a Data API aberta. A ordem é essa por segurança: entre esta migração e aquela obra existe
> uma janela em que as tabelas estariam alcançáveis **sem políticas RLS de verdade**, só com o
> "nega tudo" automático. Fechar agora e reabrir depois, com as políticas prontas, é o caminho que
> nunca deixa o banco exposto no meio. Quem reabrir sem ter escrito as políticas está criando o
> buraco que este passo evita.

- [ ] **Passo 5: revogar o EXECUTE da função do trigger**

O advisor de segurança do Supabase aponta `public.rls_auto_enable()` como executável por `anon` e
`authenticated`:

```sql
revoke execute on function public.rls_auto_enable() from anon, authenticated;
```

- [ ] **Passo 6: o teste de fumaça — é o passo que prova tudo**

Com a **anon key** do projeto (Settings → API), de fora:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://aluowtzsucntaqszpcsy.supabase.co/rest/v1/usuario?select=*" \
  -H "apikey: <ANON_KEY>"
```

Esperado: **401 ou 404**. Um **200 com dados é falha grave** — o banco da academia está aberto para
qualquer um. Nesse caso pare tudo e reporte.

Repita para `treino` e `sessao_treino`.

- [ ] **Passo 7: rodar o advisor de segurança de novo**

Deve voltar limpo, ou só com avisos que você conscientemente aceitou. Registre o resultado.

- [ ] **Passo 8: registrar no relatório** (não há commit: nada de código mudou)

O que foi aplicado, o resultado da consulta de RLS, e o código HTTP de cada curl.

---

### Tarefa 4: apontar o backend local para o Supabase e provar que roda

Antes de hospedar, prove que a API fala com o Supabase a partir da sua máquina. Erro de conexão é
muito mais fácil de diagnosticar aqui do que dentro de um contêiner remoto.

**Arquivos:** `backend/.env` (local, fora do git).

- [ ] **Passo 1: pegar os dados do pooler em session mode**

No painel: Connect → *Session pooler*. Anote host, porta (**5432**), usuário e database. **Não** use
o Transaction pooler (6543): os controllers usam transações com `db.connect()`.

- [ ] **Passo 2: preencher o `.env`**

```
DB_HOST=<host do session pooler>
DB_PORT=5432
DB_USER=<usuário do pooler>
DB_PASSWORD=<senha do banco>
DB_NAME=postgres
DB_SSL=true
DB_POOL_MAX=10
```

Guarde o `.env` de casa antes de sobrescrever — você vai querer voltar para o Postgres local.

- [ ] **Passo 3: subir e exercitar**

```bash
cd backend && npm run dev
```

Depois, noutro terminal:

```bash
curl -s http://localhost:8080/health
```

- [ ] **Passo 4: criar a primeira conta**

```bash
cd backend && npm run criar-professor -- --cpf <cpf> --nome "<nome>" --senha "<senha>" --email <email>
```

Use uma conta de teste, não dados reais — o repositório tem convenção sobre isso.

- [ ] **Passo 5: exercitar o caminho que usa transação**

Login, cadastrar um treino com dois blocos, editar esse treino, iniciar uma sessão e finalizar. É o
caminho que mais depende de `BEGIN … COMMIT` — se o pooler estivesse em transaction mode, é aqui que
quebraria.

- [ ] **Passo 6: registrar no relatório**

Latência sentida, qualquer erro de SSL ou de conexão, e o resultado do fluxo do passo 5.

---

### Tarefa 5: o container do Postgres sai de cena, e a documentação explica os dois modos

Com o banco no Supabase, `npm run db:up` deixa de ser necessário no dia a dia — mas o
`docker-compose.yml` **não sai do repositório**: ele continua sendo o caminho de volta se o Free do
Supabase apertar, e é o que a suíte local usa quando alguém quer um banco de verdade sem rede.

**Arquivos:**
- Modificar: `backend/README.md`
- Modificar: `deploy/README.md`

- [ ] **Passo 1: documentar os dois modos no `backend/README.md`**

Uma seção curta, sem rodeios: com `DB_SSL=true` e o host do pooler, a API fala com o Supabase e
**não se roda `npm run db:up`**; com o host local e `DB_SSL` vazio, sobe-se o container como sempre.
Deixe explícito que quem decide é o `.env`, e que trocar de modo é trocar o `.env`.

- [ ] **Passo 2: registrar a consequência que foi discutida e aceita**

Uma linha, porque é o tipo de coisa que se esquece e depois assusta: **com o banco no Supabase, a
API precisa de internet mesmo servindo só a rede local.** Queda de fibra derruba o sistema dentro de
casa — e nem as telas já abertas seguem funcionando, porque `autenticar` consulta o banco a cada
requisição.

- [ ] **Passo 3: `deploy/README.md`**

O guia do PC de casa continua valendo inteiro (Caddy + systemd). Acrescente que o Postgres local
vira opcional quando o banco está no Supabase, e que `PROXIES_CONFIAVEIS=1` e `HOST_BIND=127.0.0.1`
continuam obrigatórios atrás do Caddy — isso não muda.

- [ ] **Passo 4: commit**

```bash
git add backend/README.md deploy/README.md
git commit -m "documenta os dois modos de banco, local e Supabase"
```

---

### Tarefa 6: provar que o front e o APK não foram afetados

Esta tarefa não muda nada — ela **prova** que nada mudou. É o passo que pega um vazamento acidental
do trabalho para o lado do app offline.

**Arquivos:** nenhum.

- [ ] **Passo 1: o front continua apontando para o mesmo lugar**

`VITE_API_URL` segue com o endereço do PC na rede local. A API trocou de banco, não de endereço — o
front não sabe e não precisa saber. Confirme que o `.env` do front está intocado.

- [ ] **Passo 2: exercitar a web**

Com a API rodando contra o Supabase: entrar, carregar treino, iniciar sessão, lançar uma série,
finalizar, abrir o histórico e ver a sessão lá.

- [ ] **Passo 3: o APK, com a internet desligada**

```bash
cd frontend && npm run apk
```

Instale com `adb uninstall` + `adb install` (nunca `-r`: o Service Worker guarda o bundle antigo),
**ligue o modo avião** e use o app: entrar, carregar o treino, iniciar e finalizar uma sessão.

Tudo tem de funcionar. O APK roda o núcleo embarcado sobre SQLite e não fala com a API nem com o
Supabase — se algo aqui falhar, este trabalho vazou para o app offline e precisa ser investigado
antes de seguir.

- [ ] **Passo 4: as duas suítes**

```bash
cd backend && npm test && npm run test:sqlite
cd ../frontend && npm test
```

Esperado: 247 e 261, como antes. **Nenhum número deveria mudar** — nada aqui toca regra de negócio.

- [ ] **Passo 5: registrar no relatório**

O que foi exercitado na web, o resultado do teste em modo avião, e os números das duas suítes.

## Depois das seis tarefas

- **Sincronização entre aparelhos** é a obra seguinte, e a mais cara. É o que o dono realmente quer
  do APK: treinar offline e subir depois. A regra de conflito já está decidida na spec — dono por
  tipo de dado —, mas a primeira pergunta do desenho continua aberta: o APK sincroniza **através da
  API** (regra num lugar só, mas só sincroniza na rede onde a API vive) ou **direto pelo PostgREST**
  (de qualquer lugar, mas exige reabrir a Data API, montar RLS de verdade e adotar o Auth do
  Supabase). Ligar o app direto ao Postgres não é opção: o WebView do Android não abre socket TCP
  para banco.
- **Tornar a API alcançável de fora**, que era metade do objetivo original e ficou de fora por
  custo. Um túnel gratuito como o Cloudflare Tunnel resolveria sem abrir porta no roteador e sem
  hospedagem paga — e destrava tanto o acesso remoto quanto a sincronização do APK pela API.
- **O cookie `httpOnly`** continua esperando o deploy com Caddy, como o `CLAUDE.md` registra: só faz
  sentido quando front e API estiverem na mesma origem.
- **O `deploy/` de casa continua no repositório**, e agora também o `docker-compose.yml`. Se um dia
  o Free do Supabase apertar, o caminho de volta está escrito.
