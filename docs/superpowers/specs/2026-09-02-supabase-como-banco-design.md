# Supabase como banco gerenciado — desenho

Data: 2026-09-02
Motivação declarada pelo dono: **acessar o sistema de fora de casa** e, mais adiante,
**sincronizar entre aparelhos**.

## O que este trabalho é, e o que não é

É **trocar onde o Postgres mora**: sai o container do PC de casa, entra o Postgres gerenciado do
Supabase. A API continua rodando no PC, na rede local, como hoje.

**Revisão de 03/09/2026:** este documento começou querendo também colocar a API na internet, e
chegou a escolher Fly.io. Isso caiu — o Fly é pago e não cabe agora. O dono decidiu manter a API na
rede local por enquanto.

Consequência que fica registrada, porque foi discutida e aceita: **com o banco fora de casa, a
internet vira dependência para o sistema funcionar até dentro da rede local.** Hoje, com tudo no
mesmo PC, uma queda de fibra não afeta nada; depois desta mudança, afeta — e nem as telas abertas
seguem, porque o `autenticar` consulta o banco a cada requisição. O que se ganha em troca é backup
gerenciado e os dados sobrevivendo à morte da máquina.

Também fica registrado que, sozinha, esta mudança **não entrega os dois objetivos que a motivaram**:
acessar de fora continua exigindo tornar a API alcançável (um túnel gratuito como o Cloudflare
Tunnel resolveria, e ficou para depois), e a sincronização do APK é obra própria.

Não é migrar para o Supabase como plataforma. O PostgREST, o Auth e as políticas RLS **não entram**.
A razão está registrada abaixo, porque é a decisão mais importante deste documento.

## Por que o Supabase entra só como banco

O caminho "Supabase completo" foi avaliado e recusado por um motivo estrutural, não por preferência:

**A regra de negócio deste projeto precisa continuar existindo em JavaScript.** O APK roda offline,
sobre SQLite, executando os controllers de verdade — decisão do spike de 20/08, tomada justamente
para não haver duas implementações da mesma regra. Se a lógica migrasse para funções plpgsql e
políticas RLS no Supabase, o app offline precisaria de uma reimplementação em JS, porque **SQLite
não tem plpgsql**. Duas linguagens, dois lugares, combinando para sempre.

Some-se: os 231 testes de backend rodam em `pg-mem`, que **não executa plpgsql** — está no
`CLAUDE.md`, e é por isso que os triggers moram fora do `schema.sql`. Regra em plpgsql é regra que a
suíte não alcança.

E uma perda de segurança concreta: `autenticar` **consulta o banco a cada requisição**, de propósito,
para que desativar alguém derrube o token na hora. RLS confia no JWT assinado e não o revalida — o
token de um usuário desativado continuaria valendo até expirar.

Nada disso torna o Supabase ruim. Torna o Supabase-como-plataforma incompatível com um app
offline-first que compartilha a regra com a web.

## Decisões

| Pergunta | Decisão | Por quê |
|---|---|---|
| O que o Supabase substitui | Só o Postgres | Ver acima |
| Onde a API roda | **No PC de casa, rede local** — como hoje | Hospedagem paga está fora de orçamento. Torná-la alcançável de fora é assunto separado, para depois |
| O que muda no código | Praticamente nada: conexão e SSL | `src/config/db.js` já é fachada e o pool nasce de `carregarConfig().db` |
| Sincronização entre aparelhos | **Fora deste trabalho** | É obra própria, e a mais cara. Este trabalho é pré-requisito dela, não a entrega |
| APK offline | Intocado | Continua com SQLite e os controllers embarcados |
| Testes | Intocados | Continuam em `pg-mem` e SQLite. Nada aqui muda a regra de negócio |

## O projeto real, apurado em 02/09/2026

Levantado pelo MCP do Supabase, com o projeto já criado. Substitui as suposições deste documento:

| | |
|---|---|
| Postgres | **17.6** (o container de casa é 16-alpine) |
| Região | **sa-east-1, São Paulo** |
| Instância / plano | **t3.nano / Free** |
| Tabelas em `public` | **nenhuma** — banco virgem, nada a migrar |
| Timezone | UTC, igual ao container de casa |
| `max_connections` | **60**, com **13 já em uso** pelos serviços do Supabase |
| Data API (PostgREST) | **ligada** |
| RLS automático | **já configurado** — ver abaixo |

Três consequências que mudam o desenho:

1. **A região favorece o desenho escolhido.** O banco está em São Paulo e a API roda no PC do dono,
   também no Brasil — a travessia por requisição é curta. Se um dia a API sair de casa, ela precisa
   ir para um provedor com região no Brasil, porque o `autenticar` consulta o banco a cada
   requisição.
2. **O pool precisa de teto explícito.** Sobram ~47 conexões. O `pg` usa `max: 10` por padrão e o
   projeto nunca definiu esse valor — funciona hoje, mas passa a ser um número que alguém precisa
   ter escolhido, não herdado.
3. **O Free pausa o projeto após 7 dias sem uso.** Numa academia em uso diário isso não acontece;
   fica registrado porque o despausar é manual, pelo painel.

## O RLS automático já está montado — e é melhor do que este documento planejava

O projeto tem um **event trigger `ensure_rls`** (ativo) que executa `public.rls_auto_enable()` e
liga RLS em **toda tabela criada no schema `public`**. Quando o `schema.sql` for aplicado, as 11
tabelas nascem com RLS ligado sozinhas.

Isso é superior a ligar tabela por tabela, que era o plano original: não depende de ninguém lembrar,
e vale para qualquer tabela futura. A proteção nº 1 deixa de ser **tarefa** e vira **verificação**.

Um ajuste pendente, apontado pelo próprio advisor do Supabase: `rls_auto_enable()` é
`SECURITY DEFINER` e está executável por `anon` e `authenticated` via
`/rest/v1/rpc/rls_auto_enable`. O risco prático é baixo — ela é `RETURNS event_trigger` e falha
fora do contexto de trigger — mas é ruído no relatório de segurança e sai com um `REVOKE`.

## A armadilha de segurança que define este trabalho

**Todo projeto Supabase expõe o schema `public` pela internet via PostgREST, autenticado pela
`anon key` — que é pública por desenho.** Se as tabelas do gym_sys forem criadas em `public` sem RLS,
qualquer pessoa com a URL do projeto e a anon key lê `usuario`, `treino`, `sessao_treino` — a base
inteira, incluindo CPF e hash de senha. A anon key não é segredo: ela existe para ir no front.

Este projeto **não usa PostgREST**, então não há nada a ganhar com essa exposição — só risco. Duas
proteções, e o desenho aplica **as duas**, porque uma sozinha depende de ninguém errar depois:

1. **RLS ligado em todas as 11 tabelas, sem política nenhuma.** RLS ligado sem política nega tudo.
   A API não é afetada: ela conecta com o papel dono da tabela, que ignora RLS. **Já resolvido pelo
   event trigger `ensure_rls` — vira verificação, não tarefa.**
2. **O PostgREST não enxerga o schema.** Tirar `public` da lista de schemas expostos nas
   configurações da API do projeto.

Um teste de fumaça faz parte da entrega: com a anon key e `curl`, tentar ler `usuario` e receber
recusa. Sem essa verificação, a migração pode terminar com o banco da academia aberto e ninguém
saber.

## Conexão

O Supabase oferece dois caminhos, e a escolha importa porque o projeto usa transações:

- **Pooler em transaction mode (porta 6543)** — não serve. `professorController` e `sessaoController`
  usam `db.connect()` com `BEGIN … COMMIT`, e a edição de treino depende de a transação inteira ver
  a mesma conexão.
- **Pooler em session mode (porta 5432)** — é o certo. Cada conexão do pool do `pg` fica dedicada,
  as transações funcionam, e o pooler protege o Postgres do número de conexões.

A conexão direta (`db.<ref>.supabase.co`) também serve, mas é IPv6 — em rede sem IPv6 exige o add-on
de IPv4, que é pago. Session mode do pooler evita esse detalhe.

**SSL é obrigatório** e hoje não existe no código: `env.js` monta o objeto `db` sem campo de SSL, e o
`pg` não liga sozinho. Entra `DB_SSL` (booleano), que quando ligado passa
`ssl: { rejectUnauthorized: true }` ao pool. Não usar `rejectUnauthorized: false`: desligar a
verificação do certificado devolve a conexão a um estado em que um intermediário pode se passar pelo
banco — justamente o que o SSL existe para impedir.

## Schema e migrações

`db/schema.sql` continua sendo a fonte da verdade. A carga inicial no Supabase são os três arquivos,
**na ordem** que o `docker-compose.yml` já garante hoje pelo prefixo numérico: schema, seed,
triggers. Aplicar `migracao-v2.sql` antes do schema quebra — é a razão de o compose montar arquivo a
arquivo em vez da pasta.

Diferença que a mudança traz: hoje o schema só roda quando o volume do container é criado, e alterar
depois exige `npm run db:reset`. No Supabase não há "recriar o volume" — as alterações passam a ser
migrações aplicadas de fato, pelo editor SQL do painel ou pela CLI. Este trabalho não constrói um
sistema de migração; registra que o arquivo `db/migracao-vN.sql` continua sendo o formato, agora
aplicado à mão.

## O que muda na hospedagem da API

O `deploy/` de hoje (Caddy + systemd) é para o PC de casa e **continua válido** — não é apagado, vira
o caminho alternativo. O provedor de Node acrescenta:

- **`PROXIES_CONFIAVEIS=1` deixa de ser opcional.** Atrás do proxy do provedor, sem ele o limitador de
  login enxerga todos os clientes como o mesmo IP — o `CLAUDE.md` já registra isso para o Caddy, e
  vale igual aqui.
- **`ENABLE_CORS` passa a importar de verdade.** Com o Caddy, front e API ficavam na mesma origem e
  CORS era desnecessário. Hospedados separados, a origem do front precisa entrar na lista.
- **`TOKEN_SEG` novo.** O segredo do JWT não viaja do `.env` local para o provedor: gerar outro lá.
  Consequência esperada e desejável: todos os tokens existentes deixam de valer.
- O APK aponta para a nova URL — `VITE_API_URL` no build do app, e o `capacitor.config.ts` continua
  como está.

## O que fica fora, explicitamente

- **Sincronização entre aparelhos.** Obra seguinte, e a intenção do dono está registrada:
  ele quer o APK **offline-first com sincronização** para o Supabase — treina sem rede, sobe depois.
  O desenho dela tem uma pergunta em aberto que decide tudo, e que **não é decidida aqui**: o APK
  sincroniza **através da API Express** (regra de negócio num lugar só, mas só sincroniza quando o
  celular estiver na rede onde a API vive) ou **direto pelo PostgREST** (sincroniza de qualquer
  lugar, mas exige reabrir a Data API, montar RLS de verdade e adotar o Auth do Supabase — boa parte
  do caminho que este documento descartou). Nenhum caminho é possível ligando o app direto ao
  Postgres: o WebView do Android não abre socket TCP para banco.

  A regra de conflito já está decidida, e vale para os dois caminhos: **dono por tipo de dado** —
  sessão de treino pertence ao aluno e só cresce, então o aparelho ganha e o servidor acrescenta;
  ficha de treino é escrita pelo professor, então o servidor ganha. Nesse recorte, conflito real
  quase não existe.
- Auth, RLS e PostgREST do Supabase.
- Storage e Realtime.
- Qualquer mudança em controller, rota ou regra de negócio. **Se este trabalho precisar mexer num
  controller, alguma coisa está errada no desenho** — o ponto todo é que a fachada `db` já isola isso.

## Como se sabe que deu certo

- A suíte inteira continua passando sem alteração (231 no backend, 261 no front) — nada aqui toca a
  regra de negócio.
- A API responde pela internet, e o login funciona de fora da rede de casa.
- Com a anon key, `curl` no PostgREST **não** lê nenhuma tabela.
- O APK, apontado para a nova URL, entra e carrega o treino.
- O modo offline do APK continua funcionando com a internet desligada — a prova de que nada do
  núcleo embarcado foi afetado.
