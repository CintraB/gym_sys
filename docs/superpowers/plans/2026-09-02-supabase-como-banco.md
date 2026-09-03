# Supabase como banco gerenciado — plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> caixa (`- [ ]`) para acompanhamento.

**Objetivo:** o gym_sys passa a usar o Postgres do Supabase e a API fica acessível pela internet,
sem que uma linha de regra de negócio mude.

**Arquitetura:** o Supabase entra **só como banco**. O Express continua sendo a API e os controllers
continuam únicos, compartilhados entre a web e o APK offline. A mudança no código é pequena de
propósito — a fachada `db` já isola o pool, e o trabalho é sobre conexão, SSL, teto de pool e deploy.

**Stack:** Node ≥20, Express 4, `pg`, Postgres 17.6 no Supabase (sa-east-1), Fly.io (região `gru`).

**Spec:** `docs/superpowers/specs/2026-09-02-supabase-como-banco-design.md`

## Restrições globais

- **Nenhum controller muda.** Se uma tarefa exigir mexer em `src/controllers/`, pare e reporte: o
  desenho está errado. A fachada `db` existe justamente para isolar isso.
- **Projeto Supabase**: ref `aluowtzsucntaqszpcsy`, região **sa-east-1 (São Paulo)**, plano **Free**,
  instância **t3.nano**, Postgres **17.6**.
- **`max_connections` é 60, com 13 já em uso** pelos serviços do Supabase. Sobram ~47.
- **A API vai para Fly.io na região `gru`.** Render e Railway não têm região no Brasil, e o
  `autenticar` consulta o banco a cada requisição — hospedar fora do país paga a travessia duas
  vezes por chamada.
- **Conexão pelo pooler em session mode (porta 5432)**, nunca transaction mode (6543): os
  controllers usam `db.connect()` com `BEGIN … COMMIT`.
- **SSL com `rejectUnauthorized: true`.** Nunca `false` — desligar a verificação do certificado
  reabre exatamente o ataque que o SSL impede.
- **Segredo nenhum no repositório.** Senha do banco, `service_role` key e `TOKEN_SEG` vivem em
  `backend/.env` (local, fora do git) e nas variáveis do Fly. `.env.example` recebe só o nome das
  variáveis.
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
| `backend/README.md` | Seção de conexão ao Supabase |
| `deploy/fly/Dockerfile` (novo) | Imagem da API |
| `deploy/fly/fly.toml` (novo) | App na região `gru` |
| `deploy/README.md` | Ganha o caminho "nuvem" ao lado do caminho "PC de casa", que continua válido |

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

- [ ] **Passo 1: escrever os testes que falham**

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

- [ ] **Passo 2: rodar e confirmar que falham**

```bash
cd backend && node --test --test-name-pattern "DB_SSL|teto do pool"
```

Esperado: falham, porque `ssl` e `max` não existem no objeto devolvido.

- [ ] **Passo 3: implementar**

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

- [ ] **Passo 4: rodar e confirmar que passam**

```bash
cd backend && node --test --test-name-pattern "DB_SSL|teto do pool"
```

- [ ] **Passo 5: documentar no `.env.example`**

```
# TLS na conexão do banco. "true" para Supabase ou qualquer banco gerenciado;
# vazio para o Postgres em container local, que não tem certificado.
DB_SSL=
# Conexões simultâneas do pool. O Free do Supabase dá 60 no total, e 13 já são
# dos serviços dele.
DB_POOL_MAX=10
```

- [ ] **Passo 6: suíte inteira**

```bash
cd backend && npm test && npm run test:sqlite
```

Esperado: 247 e a suíte SQLite, ambas como antes. Nada aqui toca regra de negócio.

- [ ] **Passo 7: commit**

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

- [ ] **Passo 1: verificar se já funciona**

`obterPool()` faz `new pg.Pool(carregarConfig().db)`, e o `pg.Pool` aceita `ssl` e `max` no mesmo
objeto de configuração. **Provavelmente não há nada a mudar.** Confirme lendo
`backend/src/config/db.js` e a documentação do `pg`.

Se for o caso, esta tarefa vira uma linha de comentário registrando por que os campos novos
atravessam sem tratamento — e o commit é só isso. **Não invente trabalho** para justificar a tarefa.

- [ ] **Passo 2: comentar a passagem**

Acima do `new pg.Pool(...)`:

```js
    // ssl e max vêm no mesmo objeto de config e o pg os entende direto — por
    // isso ligar TLS no Supabase não exigiu tocar aqui.
```

- [ ] **Passo 3: suíte inteira**

```bash
cd backend && npm test && npm run test:sqlite
```

- [ ] **Passo 4: commit**

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

### Tarefa 5: hospedar a API no Fly.io, região `gru`

**Arquivos:**
- Criar: `deploy/fly/Dockerfile`
- Criar: `deploy/fly/fly.toml`
- Modificar: `deploy/README.md`

- [ ] **Passo 1: Dockerfile**

```dockerfile
# O backend é ESM puro e não tem etapa de build — só dependências e código.
FROM node:22-alpine

WORKDIR /app

# Instala dependências antes de copiar o código: a camada só refaz quando o
# package-lock muda, e não a cada alteração de controller.
COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ ./

# Atrás do proxy do Fly, HOST_BIND precisa ser 0.0.0.0 para o contêiner receber
# tráfego — o oposto do PC de casa, onde 127.0.0.1 protege a porta 8080.
ENV HOST_BIND=0.0.0.0
ENV PORTA=8080
EXPOSE 8080

CMD ["node", "server.js"]
```

- [ ] **Passo 2: `fly.toml`**

```toml
app = "gym-sys-api"
# São Paulo. O banco está em sa-east-1 e o autenticar consulta o banco a cada
# requisição — hospedar fora do Brasil pagaria a travessia duas vezes por chamada.
primary_region = "gru"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  # Uma máquina só: o teto do pool foi dimensionado para isso, e subir a
  # contagem exige rever DB_POOL_MAX contra as ~47 conexões livres.
  min_machines_running = 0

[[http_service.checks]]
  interval = "30s"
  timeout = "5s"
  grace_period = "10s"
  method = "GET"
  path = "/health"
```

- [ ] **Passo 3: variáveis no Fly**

```bash
fly secrets set DB_HOST=... DB_PORT=5432 DB_USER=... DB_PASSWORD=... \
  DB_NAME=postgres DB_SSL=true DB_POOL_MAX=10 \
  TOKEN_SEG=<segredo NOVO> PROXIES_CONFIAVEIS=1 \
  ENABLE_CORS=<origem do front>
```

Três pontos que não são detalhe:

- **`TOKEN_SEG` novo**, gerado para a nuvem. Não reaproveite o de casa. Consequência esperada: todo
  token existente deixa de valer.
- **`PROXIES_CONFIAVEIS=1` é obrigatório** atrás do proxy do Fly. Sem ele o limitador de login
  enxerga todos os clientes como o mesmo IP — o `CLAUDE.md` já registra isso para o Caddy.
- **`ENABLE_CORS`** passa a importar: com o Caddy, front e API ficavam na mesma origem e CORS era
  desnecessário. Hospedados separados, a origem do front precisa entrar na lista.

- [ ] **Passo 4: subir e verificar**

```bash
fly deploy
curl -s https://gym-sys-api.fly.dev/health
```

- [ ] **Passo 5: provar o fluxo pela internet**

Login e carregar um treino, de fora da sua rede — use o 4G do celular, não o Wi-Fi de casa.

- [ ] **Passo 6: atualizar o `deploy/README.md`**

O caminho do PC de casa (Caddy + systemd) **continua válido e não sai** — vira alternativa. Acrescente
a seção da nuvem, deixando claro qual configuração pertence a qual caminho, principalmente
`HOST_BIND` (127.0.0.1 em casa, 0.0.0.0 no contêiner) e `ENABLE_CORS` (vazio em casa, preenchido na
nuvem).

- [ ] **Passo 7: commit**

```bash
git add deploy/
git commit -m "adiciona o caminho de deploy na nuvem, com a API em Sao Paulo

Fly.io na regiao gru porque o banco esta em sa-east-1 e o autenticar
consulta o banco a cada requisicao. O caminho do PC de casa continua
valido, agora como alternativa."
```

---

### Tarefa 6: apontar o front e o APK para a API nova

**Arquivos:** `frontend/.env` (local), `frontend/.env.example`, `frontend/README.md`.

- [ ] **Passo 1: `VITE_API_URL`**

```
VITE_API_URL=https://gym-sys-api.fly.dev
```

- [ ] **Passo 2: build e conferência**

```bash
cd frontend && npm run build && npm run dev
```

Entrar, carregar treino, iniciar e finalizar uma sessão.

- [ ] **Passo 3: o APK — e o que NÃO muda nele**

O APK standalone **não fala com a API**: ele roda o núcleo embarcado sobre SQLite. `VITE_API_URL` não
o afeta, e o `capacitor.config.ts` continua como está.

Gere e confira que ele continua funcionando **com a internet desligada** — é a prova de que nada
deste trabalho vazou para o app offline:

```bash
cd frontend && npm run apk
```

- [ ] **Passo 4: `.env.example` e README**

Documente que `VITE_API_URL` agora aponta para a nuvem, e que o APK segue offline.

- [ ] **Passo 5: commit**

```bash
git add frontend/.env.example frontend/README.md
git commit -m "aponta o front para a API na nuvem"
```

---

## Depois das seis tarefas

- **Sincronização entre aparelhos** é a obra seguinte, e a mais cara. A decisão de desenho já está
  tomada na spec: dono por tipo de dado — sessão de treino é do aluno e só cresce (o aparelho ganha,
  o servidor acrescenta); ficha de treino é escrita pelo professor (o servidor ganha).
- **O cookie `httpOnly`** entra em jogo aqui. O `CLAUDE.md` registra que ele só fazia sentido depois
  que o deploy estivesse de pé, porque front e API em origens diferentes exigiriam
  `SameSite=None; Secure` e traria CSRF junto. Com a API hospedada, vale reavaliar.
- **O `deploy/` de casa continua no repositório.** Se um dia o Free do Supabase apertar, o caminho de
  volta está escrito.
