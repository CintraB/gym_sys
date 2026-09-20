# A sincronização do APK

Faz o aparelho e o servidor conversarem: a ficha desce, as sessões sobem. Entrou na leva 3 da
sincronização, em 13/09/2026.

Não é um controller e **não entra em `rotas.js`** — é uma peça ao lado do núcleo. O teste que
confere a tabela de rotas contra `backend/src/routes/` continua valendo como está.

## As duas identidades

| | Contra quem | Onde mora | O que acontece se vencer |
|---|---|---|---|
| **Sessão do app** | O SQLite do aparelho | `gymsys.token` | Vai para a tela de login |
| **Sincronização** | O servidor (Supabase) | `gymsys.sync.token` | Pede para ativar de novo, **e mais nada** |

Dá para treinar o mês inteiro sem nunca ter ativado a sincronização. É por isso que um 401 daqui
**nunca** pode derrubar a sessão de lá — e o projeto já caiu numa parecida, quando o interceptor do
`api.ts` expulsava quem só tinha errado a senha atual (daí a lista `ROTAS_COM_401_DE_FORMULARIO`).

Aqui o problema é resolvido por construção: o `cliente.js` usa `fetch`, não a instância do axios —
que está com o adapter local instalado e traria o interceptor junto.

## O contato diário, e por que ele existe

O motor toca o servidor **uma vez por dia** mesmo sem nada para subir — uma leitura da própria
linha em `usuario`, que é o mínimo que a RLS deixa passar.

Não é enfeite: o plano gratuito do Supabase pausa o projeto com "atividade insuficiente" na
semana, e **isso aconteceu em 19/09/2026 com o app funcionando perfeitamente**. Quatro treinos
subiram nos seis dias anteriores, cada um em poucos segundos; nos dias sem treino o app não fazia
requisição nenhuma, porque sem pendência ele nem acordava a rede. Pouco demais para o critério
deles.

Três detalhes que sustentam isso:

- **A janela é de 20 h, não 24.** Quem abre o app sempre no mesmo horário ficaria a poucos minutos
  de completar as 24 h e pularia o dia, abrindo buracos justamente na semana que decide a pausa.
- **Subir um treino conta como o contato do dia.** No dia de treino a atividade sai de graça, e a
  abertura seguinte não gasta requisição para dizer "oi".
- **Falha de rede não gasta o dia.** A marca é gravada depois da resposta, então servidor fora do
  ar não empurra a próxima tentativa para 20 h adiante.

Quem dispara na abertura é o `main.tsx`, que chama `sincronizar()` direto antes do primeiro render
— e não o `sincronizarSeHouver` do `gatilho.ts`, que é o caminho das telas (hoje só `MeuTreino`, ao
finalizar um treino). Procurar pelo gatilho e concluir que a abertura não sincronizava foi um erro
de leitura cometido em 20/09/2026; a chamada está lá desde a leva 3.

## O selo diz três coisas, e "conectado" é a menos provável

`online` nasce `null` — *não verificado* —, e só uma tentativa de verdade o resolve. A tela tratava
`null` como "conectado", então o app afirmava estar em dia com o servidor sem nunca ter falado com
ele: foi assim que seis dias de projeto pausado passaram sem nada mudar na tela.

Junto do selo vai a data do último contato, em tempo relativo (`há 6 dias`). É ela que denuncia
sozinha um "tudo enviado" velho, sem depender de alarme nenhum.

## Os quatro tipos de falha

`ErroSincronizacao.tipo` decide o que fazer, e confundi-los é o bug mais provável desta pasta:

| Tipo | O que é | O que fazer |
|---|---|---|
| `rede` | Sem sinal, portal cativo, servidor fora | **Caso normal.** Marca offline e tenta depois |
| `credencial` | 401: token vencido ou revogado | Desliga a sincronização, pede para ativar de novo |
| `politica` | 403: uma política de RLS recusou | **É bug.** Grita no log e na tela; não tenta de novo |
| `servidor` | 5xx e o resto | Conta como falha da sessão e segue para a próxima |

## Os arquivos

| Arquivo | O quê |
|---|---|
| `cliente.js` | `fetch` ao PostgREST e à Edge Function, e a tradução dos quatro tipos acima |
| `identidade.js` | CPF + senha → token de 30 dias, guardado com um dia de folga antes do vencimento |
| `recomeco.js` | Baixa usuário, catálogo e ficha e **substitui** o banco local |
| `subida.js` | Monta o pacote de cada sessão finalizada e chama `sincronizar_sessao` |
| `index.js` | O motor: quando roda, o estado, e o que fazer com cada falha |
| `doApp.js` | A instância que o aplicativo usa, ligada ao banco do aparelho |
| `gatilho.ts` | O que as telas chamam. No build web some por tree-shaking |

## Quatro coisas que custaram para descobrir

**A ficha precisa vir do servidor antes de qualquer sessão subir.** `sessao_exercicio.id_ex_usuario`
aponta para a linha da ficha, e no aparelho esse id vinha da semente local — no servidor é outro. A
subida era recusada por chave estrangeira. É por isso que o recomeço existe, e por isso a leva 3
entrega os dois.

**A hash da senha não desce, e o login do app é local.** A coluna `senha` não é selecionável por
papel nenhum, e não vai ser. O recomeço refaz a hash a partir da senha que a pessoa acabou de
digitar — que a Edge Function confirmou estar certa — pelo mesmo caminho do cadastro.

**Não é preciso empurrar sequência no SQLite.** A intuição vinda do Postgres manda chamar `setval`
depois de inserir com id explícito (é o que `backend/test-rls/cenario.js` faz). Aqui o
`AUTOINCREMENT` atualiza o `sqlite_sequence` sozinho, e a primeira versão do `recomeco.js`
carregava uma função que não fazia nada.

**O schema `public` não é o padrão da Data API deste projeto.** A lista de *Exposed schemas* começa
em `graphql_public`, e sem `Accept-Profile: public` toda consulta volta 404 "Could not find the
table 'graphql_public.usuario'" — que parece tabela inexistente e manda quem investiga para o lado
errado.

## Como isso é provado

- **Sem rede:** `npx vitest run src/local/sincronizacao/` — 49 testes, com cliente falso e SQLite
  em memória.
- **Contra o servidor de verdade:** `npm run test:dataapi`, no `backend/`. É o que prova que o
  **formato** do pacote é o que `sincronizar_sessao` espera — nenhum teste com cliente falso diz
  isso, e um nome de campo errado passaria por todos eles para só aparecer no aparelho.
