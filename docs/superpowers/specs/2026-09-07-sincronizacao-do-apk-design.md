# Sincronização do APK com o Supabase — desenho

O APK treina offline e sobe depois. É o que o dono quer do aplicativo desde o começo, e o trabalho de
02-06/09/2026 (Supabase como banco) foi o pré-requisito disto, não a entrega.

**Brainstorming:** 07/09/2026. **Spec anterior:** `2026-09-02-supabase-como-banco-design.md`.

## O que este trabalho é, e o que não é

É dar ao APK um **terceiro caminho de dados**: `APK → PostgREST → Supabase`, sem passar pelo PC de
casa. Hoje existem dois mundos que não se falam — a API Express (navegador → Supabase) e o APK
(telas → `adaptadorAxios` → roteador local → SQLite).

Não é reescrever o núcleo embarcado, não é mexer nos controllers, e não é tirar o app do offline. O
aparelho continua sendo a autoridade da regra quando está sem rede.

## Por que pelo PostgREST, e não pela API

Decidido em 03/09/2026, com o custo na mesa e o caminho alternativo (API + túnel gratuito)
apresentado lado a lado. O que pesou: **o PostgREST é o único desenho que não depende do PC de casa
estar ligado.** Essa comparação não deve ser reaberta como novidade.

Ligar o app direto ao Postgres nunca foi opção: o WebView do Android não abre socket TCP para banco.

## O que foi decidido no brainstorming de 07/09

| Pergunta | Decisão |
|---|---|
| De onde vem o token que o RLS confere | **Edge Function** no Supabase autentica CPF + senha contra `usuario` e emite o JWT |
| O que sincroniza | Execução e **pedido de treino** sobem; ficha e catálogo descem |
| Identidade das linhas que sobem | Coluna `uuid`, gerada no aparelho, em **quatro** tabelas |
| O que já está no celular | A primeira sincronização **recomeça** o banco local — reafirmado em 13/09/2026 (ver nota abaixo) |
| Telas de professor no app | Editáveis **quando online**, somente leitura sem rede |
| Por onde a escrita do professor passa | PostgREST, o mesmo caminho da sincronização |
| Como a sincronização detecta o que subir | **Pacote fechado**, identificado por `uuid` |

**Nota de 13/09/2026 — "recomeça o banco local" agora custa alguma coisa.** Quando esta spec foi
escrita, o celular dele não tinha histórico nenhum, e recomeçar era grátis. Depois ele reinstalou o
APK e fez dois treinos de verdade. Perguntado se essas sessões deveriam subir antes do recomeço, ele
**escolheu aceitar perdê-las** — são treinos de teste, e subir exigiria gerar `uuid` retroativo para
linhas que nasceram sem ele. A decisão vale para o histórico que existir no aparelho quando a leva 4
chegar, não só para esses dois: **a primeira sincronização não preserva sessão local.** Isso precisa
estar na tela antes de rodar, não só nesta spec.

Duas correções que o brainstorming trouxe sobre a spec anterior:

- Ela dizia que o backend assinaria o token com o segredo do Supabase. Isso **não funciona** para o
  objetivo: obter o token exigiria falar com a API no PC, que é justamente a dependência que o
  PostgREST existe para remover. A Edge Function resolve.
- O `pedido_treino` também é criado pelo aluno no aparelho, e ficou de fora da lista original. São
  quatro tabelas com `uuid`, não três.

## O spike do scrypt — feito, e passou

A Edge Function só se sustenta se o runtime dela reproduzir o scrypt do backend. Testado em
07/09/2026 no runtime real (`supabase-edge-runtime-1.74.3`, Deno 2.1.4), com uma função descartável:

| | |
|---|---|
| Hash bate com a do Node | **sim**, byte a byte |
| Parâmetros | os padrões do Node: N=16384, r=8, p=1, 64 bytes |
| Sal como **texto** da string hex | reproduzido — e provado: decodificado em bytes dá hash diferente |
| `timingSafeEqual` | disponível e funcionando |
| Custo | **29 ms** por verificação; 76 ms para três |

Consequência: a função confere as senhas que **já existem** no banco. Ninguém precisa redefinir nada.

**Armadilha descoberta no caminho:** `Buffer` **não é global** no Edge runtime, ao contrário do Node
— precisa `import { Buffer } from "node:buffer"`. Foi o que fez a primeira versão do spike falhar.

A função `teste-scrypt-descartavel` ficou no projeto e **foi removida por ele em 12/09/2026** pelo
painel — o MCP não tem ferramenta de remoção. A lista de Edge Functions do projeto está vazia.

## Arquitetura

Quatro peças entram. O que não está aqui não muda: controllers, API Express, front web, e o modo
offline de treinar.

| Peça | Onde | O que faz |
|---|---|---|
| Função de identidade | Edge Function | CPF + senha → JWT assinado com o segredo do projeto |
| Políticas RLS | Postgres | Reimplementam em SQL a autorização de `exigirPerfil` e das consultas |
| Camada de sincronização | `frontend/src/local/sincronizacao.js` (novo) | Monta pacotes, fala com o PostgREST, aplica o que desce |
| Transporte de rede | `frontend/src/local/adaptadorAxios.js` | Ganha uma segunda saída: rede, além do roteador local |

A camada de sincronização **não é um controller** e não entra em `src/local/rotas.js`. É uma peça ao
lado do núcleo. O teste que confere a tabela de rotas contra `backend/src/routes/` continua valendo
como está.

**Como o app sabe que está online.** Não por `navigator.onLine`, que no Android mente — diz `true`
com Wi-Fi conectado e sem saída para a internet, que é o caso da academia com portal cativo. O sinal
é a **última tentativa real**: se a última chamada ao PostgREST respondeu, está online; se falhou por
rede, está offline até a próxima tentativa dar certo. As telas de professor consultam esse estado, e
uma tentativa que falha as devolve para somente leitura em vez de mostrar erro.

## Identidade e o token

O app faz `POST` para a função com CPF e senha. Ela busca `usuario` pelo CPF, confere o scrypt, e
devolve um JWT com `sub` (o id do usuário) e `role: 'authenticated'`, assinado com o **JWT secret do
projeto** — o que o RLS verifica em `auth.jwt()`.

- **A função não exige JWT** (`verify_jwt: false`): ela é quem emite o token. A proteção dela é a
  `apikey` e nunca revelar se o erro foi CPF inexistente ou senha errada — a API já se comporta
  assim.
- **O limite de tentativas é uma tabela no Postgres** — decidido por ele em 13/09/2026, entre as
  duas opções que esta seção deixara em aberto. A API tem `LIMITE_LOGIN_*` no `express-rate-limit`,
  que guarda contagem em memória do processo; Edge Function é sem estado e sem limitador embutido,
  e deixar a porta nova sem trava de tentativas não passou. A função registra a tentativa e recusa
  depois de N falhas numa janela.

  **Consequência de escopo:** a tabela é SQL, então ela **nasce na leva 1** junto com o resto do
  esquema, mesmo só passando a ser usada na leva 2. Sai da leva 1 já com política e grant próprios:
  ninguém além da função precisa lê-la.
- **Usuário inativo não recebe token**, mesma regra de `authController:24`.
- **O corte de sessão continua valendo.** O `iat` do token é comparado com
  `usuario.sessoes_invalidadas_em` — não na função, e sim no RLS, a cada acesso (ver abaixo). Sem
  isso, o app seria a única porta onde token roubado sobrevive à troca de senha.
- **Validade de 30 dias**, contra os 7 do token da API — confirmado por ele em 13/09/2026. Ficar mais de um mês sem rede significa não
  sincronizar até logar de novo, e logar de novo exige rede — não afeta treinar, que é local. O dano
  de um token roubado é ler e escrever as sessões daquele aluno, e o corte de sessão é a alavanca de
  revogação.

## As políticas RLS

O pedaço mais pesado. Quatro coisas o moldam, e três são armadilhas.

**A recursão.** Política em `usuario` que consulta `usuario` estoura. As funções auxiliares são
`SECURITY DEFINER` com `search_path = ''`, e o `EXECUTE` é revogado de `PUBLIC`, ficando só
`authenticated` — a lição de 06/09, quando `revoke ... from anon, authenticated` rodou sem erro e sem
efeito porque o grant era para `PUBLIC`.

**Os perfis não vêm do JWT — vêm do banco.** É a decisão mais importante desta seção. Carimbar
`aluno/professor/admin` como claims quebraria uma propriedade que o projeto tem de propósito: hoje
`autenticar` consulta o banco a cada requisição, para que desativar ou rebaixar alguém derrube o
acesso na hora. Com claims num token de 30 dias, um professor rebaixado seguiria professor por 30
dias.

**Uma função, não verificação espalhada.** `auth_id_valido()` devolve o id do usuário quando o token
é legítimo — existe, está `ativo`, e o `iat` é posterior a `sessoes_invalidadas_em` — e `NULL` caso
contrário. Marcada `STABLE`, é avaliada uma vez por comando, não por linha. Toda política lê
`id_aluno = auth_id_valido()`. `auth_e_professor()` e `auth_e_admin()` cobrem o resto, lendo do banco.

**RLS não basta: falta o `GRANT`.** A auditoria de 06/09 mostrou que `anon`, `authenticated` e
`service_role` não têm `SELECT` em nada — essa é a primeira das três camadas que hoje protegem o
banco. Ela precisa ser aberta tabela por tabela, e **por coluna onde importa**: `usuario` não expõe
a coluna `senha` nem para o próprio dono.

O `anon` continua sem nada.

| Tabela | Aluno | Professor (online) |
|---|---|---|
| `usuario` | lê a própria linha, sem `senha` | lê alunos, cria e edita aluno |
| `exercicio` | lê tudo (é catálogo) | lê tudo, acrescenta |
| `treino`, `treino_bloco`, `ex_usuario` | lê o próprio | lê e escreve o do aluno |
| `pedido_treino` | lê e **cria** o próprio | lê abertos, fecha |
| `sessao_treino`, `sessao_exercicio`, `sessao_serie` | lê e **cria** o próprio | lê dos alunos |
| `admin_user`, `regras_usuario` | nada | nada |

As duas últimas seguem sem política e sem grant, de propósito: o app nunca as toca.

**A mudança de premissa, escrita para não ser esquecida:** o aluno passa a inserir sessão direto no
banco, sem os controllers, e poderia gravar duração absurda ou carga impossível. Aceitável na escala
de uma academia — é o que a spec anterior registrou como "o app vira a autoridade da regra e o
Postgres vira armazenamento com guarda-corpo". O que o RLS garante é que ele só escreve **na própria
linha**: não adultera sessão de outro aluno nem escreve ficha.

## O motor de sincronização

### A subida: uma chamada, transacional

Três `POST` no PostgREST não servem. As linhas filhas referenciam `id_sessao`, que é o `SERIAL` do
servidor, e o aparelho não o conhece — sairia um vaivém de "insere, lê o id que voltou, insere os
filhos", com meia sessão gravada se a rede cair no meio.

Em vez disso, `sincronizar_sessao(pacote jsonb)`: uma função no Postgres que recebe o pacote inteiro
e insere numa transação. **`SECURITY INVOKER`** — as políticas RLS continuam valendo dentro dela. A
função não é uma porta que escapa do RLS; é só a forma de mandar o pacote junto. `uuid` já existente
retorna sem fazer nada.

Só sessão **finalizada** sobe, o que a torna imutável: nada que subiu muda depois. Ganho colateral —
o servidor tem índice único de "uma sessão aberta por aluno" (`idx_sessao_aberta_por_aluno`), e subir
só sessão finalizada nunca briga com ele.

O `uuid` nasce no aparelho com `crypto.randomUUID()`. O app marca localmente o que subiu numa coluna
`sincronizado_em` na própria `sessao_treino`, mas isso é atalho: **a garantia é o índice único**. Se o
app morrer entre inserir e marcar, a próxima tentativa é recusada como duplicada e ele corrige a
marca. Essa coluna é **local**: não sobe, e o servidor não a tem.

A coluna `uuid` (com índice único) e a `sincronizado_em` entram por `db/migracao-v8-uuid.sql`, e no
`schema.sql`, que é a fonte da verdade. O `uuid` é `NOT NULL` nas linhas novas mas precisa aceitar
nulo nas existentes — o banco do Supabase já tem sessões gravadas, e a migração roda sobre elas.

O `pedido_treino` sobe pelo mesmo princípio, e é o único dado de mão dupla: sobe como inserção, e
volta fechado pelo professor.

### A descida: substituição, sem cursor

`atualizado_em > último_carimbo` não tem de onde sair: `treino` só tem `criado_em`, e `treino_bloco`
**não tem timestamp nenhum**. Acrescentá-los seria migração e trigger para resolver um problema que o
tamanho do dado dispensa — uma ficha é um treino, ~4 blocos e ~30 exercícios; o catálogo tem 79
linhas.

Então a descida **baixa a ficha inteira e substitui a local**. Sem cursor, sem deriva, sempre
correta. É também o que faz "a primeira sincronização recomeça o banco local" ser o caso normal, e
não um caminho especial.

### Quando roda

Ao abrir o app, ao finalizar uma sessão, e num botão manual. **Sem serviço em segundo plano** — isso
é o item 4/8 do teste de campo, obra própria, com bateria e permissão do Android no meio.

### O papel da semente muda

Ela deixa de ser "a ficha do app" e passa a ser só o primeiro acesso, antes da primeira
sincronização. Isso também resolve a incoerência de ela carregar uma senha fixa de 8 caracteres.

## Quando dá errado

- **Sem rede** é o caso normal, não erro. Cada sessão ganha estado visível: local, enviando, enviado,
  falhou. "Não sincronizado" e "deu erro" precisam ser distinguíveis.
- **401 do PostgREST não derruba a sessão local.** A armadilha mais fácil de cair, e o projeto já
  caiu numa parecida: o interceptor do `api.ts` tratava 401 como sessão morta e expulsava quem só
  errou a senha atual — daí a lista `ROTAS_COM_401_DE_FORMULARIO`. São **duas identidades**: o login
  local é contra o SQLite, o token de sincronização é do Supabase. 401 na sincronização significa
  "não consigo subir agora", nunca "saia do app".
- **403 é bug, não transiente.** Política errada tem de gritar, não tentar de novo em silêncio. 403
  vai para o log e para a tela; 401 e falha de rede são retentativa.
- **A descida espera a sessão terminar.** Substituir a ficha apaga linhas de `ex_usuario` que uma
  sessão aberta referencia. Com sessão aberta, a descida não roda.
- **A substituição é atômica no aparelho**, e aqui vale a quarta adaptação do driver que o
  `CLAUDE.md` registra: no plugin de SQLite do Android, toda escrita usa `transaction: false` e
  `BEGIN`/`COMMIT` são **métodos do plugin**, não SQL solto. Sem isso, falha no meio deixa o app sem
  ficha nenhuma.
- **Colisão de `uuid` não é erro** — é o caminho da idempotência.

## Como se prova

**A suíte atual não consegue testar nada disso.** O `pg-mem` não executa plpgsql — é por isso que
`triggers.sql` já mora fora do `schema.sql` — e RLS com funções `SECURITY DEFINER` é plpgsql e
semântica de Postgres de verdade.

A saída é o `docker-compose.yml`, que a spec anterior documentou como opcional. **Para este trabalho
ele deixa de ser opcional:** passa a ser o banco de teste do SQL. Uma suíte nova
(`npm run test:rls`) aplica schema, políticas e funções no container e faz asserções conectando como
`authenticated` com JWT forjado. Postgres real, local, sem rede, sem gastar o projeto do Supabase.

No estilo do `seguranca.test.js` — vermelho ali é vulnerabilidade, não teste desatualizado:

- Aluno não lê sessão nem ficha de outro aluno.
- Aluno não escreve em `treino`, `treino_bloco` nem `ex_usuario`.
- A coluna `senha` não sai para ninguém, nem para o próprio dono.
- **Professor rebaixado perde acesso na hora** — prova de que os perfis vêm do banco.
- **Token emitido antes de uma troca de senha é recusado** — o corte de sessão valendo no PostgREST.
- Usuário inativo não lê nada, mesmo com token válido.
- `admin_user` e `regras_usuario` seguem inalcançáveis.
- `sincronizar_sessao` com o `uuid` de outro aluno é recusada — a função não escapa do RLS.
- O mesmo pacote subido duas vezes resulta em uma sessão só.

Do lado do app, com a rede falsa que o `adaptadorAxios.test.js` já usa: pacote montado corretamente,
retentativa após falha de rede, 401 não derrubando a sessão local, e descida recusada com sessão
aberta.

## Cinco levas, cinco planos

Esta spec não cabe num plano só — mesma situação do app Android, que virou três levas. **A ordem não
é preferência: é segurança.** A Data API só reabre na leva 3, quando as políticas e a identidade já
existem. Reabrir antes recria exatamente o buraco que a spec anterior fechou.

| Leva | O que entrega | Como se prova sozinha |
|---|---|---|
| **1. O SQL** | `migracao-v8-uuid.sql`, funções auxiliares, políticas RLS, `sincronizar_sessao`, a tabela de tentativas de login, suíte `npm run test:rls` | A suíte nova passa no container local. Nada do app muda. **A Data API continua fechada.** |
| **2. A identidade** | A Edge Function de verdade, usando a tabela de tentativas criada na leva 1 | Ela emite token que as políticas da leva 1 aceitam, e recusa inativo, senha errada e CPF inexistente do mesmo jeito |
| **3. A subida** | Transporte de rede no APK, camada de sincronização, pacote fechado, estados na tela. **Reabre a Data API** | Sessão feita em modo avião aparece no site depois da rede voltar. Subir duas vezes dá uma linha só |
| **4. A descida** | Substituição da ficha, esperar sessão terminar, primeira sincronização recomeçando o banco local | Ficha editada no navegador aparece no app. Com sessão aberta, a descida não roda |
| **5. Professor online** | Telas de professor escrevendo no servidor quando online, somente leitura sem rede | Pedido feito no app aparece no site; ficha montada no app com rede vale, e sem rede a tela não deixa editar |

Cada leva tem plano próprio. As levas 1 e 2 não tocam o aplicativo, então até a leva 3 o APK
instalado continua o de hoje, funcionando como sempre.

## Fora de escopo

| | Por quê |
|---|---|
| Ficha montada offline no app subindo | O dono escolheu montar no navegador; escrita de professor no app é online e cai direto no servidor, com id do servidor — por isso `treino`/`treino_bloco`/`ex_usuario` **não** precisam de `uuid` |
| Sessão feita no navegador descendo para o app | Limitação aceita na v1. O dono treina pelo celular, então na prática os históricos coincidem |
| Serviço em segundo plano | Itens 4/8 do teste de campo, obra própria |
| Adotar o Auth do Supabase | Duplicaria identidade e trocaria o login de CPF por e-mail |
| Storage e Realtime | Nada no projeto precisa |
| Mexer em controller ou na API Express | O caminho novo é paralelo, não substitui |

## Como se sabe que deu certo

- A suíte atual segue passando sem alteração — 260 no backend (nos dois bancos) e 261 no front.
- A suíte nova de RLS passa inteira no container local.
- O APK, **em modo avião**, continua treinando: entrar, carregar ficha, iniciar, finalizar. Nada do
  núcleo embarcado foi afetado.
- Com a rede de volta, a sessão feita offline aparece no histórico do site.
- Subir a mesma sessão duas vezes resulta em uma linha só.
- Uma ficha editada no navegador aparece no app na sincronização seguinte.
- Um pedido feito no app aparece na tela de pedidos do site.
- Com a **anon key**, `curl` no PostgREST não lê tabela nenhuma — a camada de grant continua de pé.
- Com o token de um aluno, `curl` não lê a sessão de outro aluno.
- Trocar a senha no site faz o app parar de sincronizar até logar de novo.

## Riscos conhecidos

- **Duas portas de escrita no mesmo dado** (API Express e PostgREST). Mitigado pela regra de dono por
  tipo de dado e por só sessão finalizada subir.
- **A autorização passa a existir em dois lugares** — `exigirPerfil` e as políticas RLS. Divergir é
  possível; a suíte de RLS existe para pegar isso.
- **A Data API reabre.** A spec anterior a fechou de propósito, e a ordem é essa por segurança: nunca
  existir banco alcançável sem política. Reabrir **antes** das políticas prontas recria exatamente o
  buraco que aquele passo evitou.
