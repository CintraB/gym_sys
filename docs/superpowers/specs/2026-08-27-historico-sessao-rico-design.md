# Histórico de sessão mais rico — design

**Data:** 27 de agosto de 2026
**Item do backlog:** teste de campo 1 (`Brain: gym_sys-teste-campo-1-melhorias.md`), tópico 2 — "histórico
de sessão mais rico". Alavanca a "evolução de carga por exercício" prevista no `ROADMAP.md`, seção 4.2.

## Problema

Hoje a execução de um treino só registra o que já estava prescrito (série/repetição/carga vêm de
`ex_usuario`, fixos desde que o professor montou a ficha) e se cada exercício foi marcado como
concluído. Não existe onde guardar:

- o peso e a repetição **de verdade** usados em cada série — a carga prescrita nunca muda, então a
  ficha de papel continua sendo o único lugar onde a evolução de carga fica registrada;
- uma observação livre da sessão inteira ("hoje rendeu pouco", "dor no ombro") ou as calorias
  gastas, se o aluno quiser anotar.

`sessao_exercicio.concluido_em` já existe e já é devolvido pela API, mas nada usa para mostrar
quanto tempo cada exercício levou nem em que ordem foram feitos de verdade — por isso "tempo por
exercício e ordem" não precisa de mudança de schema, só de front.

## Decisões de arquitetura

### Peso/repetição real vira uma tabela nova, não uma coluna

`sessao_exercicio` ganha uma tabela filha, `sessao_serie` — um lançamento por série realizada, não
uma coluna de valor único. Foi decisão explícita do dono do projeto: ele quer poder relançar peso e
repetição a cada série (mudou a carga no meio do exercício, fez reps diferentes), não só guardar "o
que usei nesse exercício" como valor único.

```sql
CREATE TABLE IF NOT EXISTS sessao_serie (
    id                   SERIAL PRIMARY KEY,
    id_sessao_exercicio  INTEGER NOT NULL REFERENCES sessao_exercicio (id) ON DELETE CASCADE,
    carga                INTEGER NOT NULL,
    repeticoes           VARCHAR(30) NOT NULL,
    criado_em            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sessao_serie_exercicio ON sessao_serie (id_sessao_exercicio);
```

Sem coluna de "número da série": a ordem de lançamento (`id`/`criado_em`) já numera, mesmo padrão
que `sessao_exercicio` e `ex_usuario` já usam em vez de guardar uma posição explícita. `carga`
aceita `0` (exercício sem peso externo) e `repeticoes` é texto livre pelo mesmo motivo do
prescrito — cardio usa `"20 min"` em vez de um número.

O tradutor de SQLite (`backend/src/lib/dialetoSqlite.js`) já converte `SERIAL`, `TIMESTAMPTZ` e
`VARCHAR` de forma genérica, por regex — **não precisa de nenhuma mudança** para a tabela nova.

### Observação e calorias vão em `sessao_treino`, não em tabela própria

```sql
ALTER TABLE sessao_treino ADD COLUMN observacao VARCHAR(200);
ALTER TABLE sessao_treino ADD COLUMN calorias INTEGER;
```

Duas colunas nulas: quem já tem o banco rodando aplica o `ALTER TABLE` direto (`npm run db:psql`) ou
reseta (`npm run db:reset`) — não é caso para uma migração numerada como `migracao-v2.sql`/
`migracao-v7-login.sql`, que existem para mudanças estruturais maiores. `NULL` é o estado de toda
sessão já registrada.

### API

- `POST /alunos/treino/sessao/exercicio/:id/serie` — corpo `{ carga, repeticoes }`. Mesma guarda de
  `alternarExercicio`: só alcança item de uma sessão **aberta** do próprio aluno logado.
- `DELETE /alunos/treino/sessao/exercicio/:id/serie/:idSerie` — apaga um lançamento errado, também
  só com a sessão ainda aberta. Sem edição in-place: apagar e relançar é o fluxo.
- `finalizarSessao` passa a aceitar corpo opcional `{ observacao?, calorias? }`, gravado junto com
  `finalizado_em`/`duracao_segundos` no mesmo `UPDATE`. Continua ignorando qualquer campo de tempo
  vindo do cliente — só esses dois campos novos passam a ser lidos do corpo.
- `carregarSessao` (usada por `sessaoAtual`, `iniciarSessao`, `finalizarSessao`,
  `detalheDaMinhaSessao`) passa a trazer `series: [...]` dentro de cada exercício e
  `observacao`/`calorias` dentro de `sessao`.
- `listarSessoesDe` (a lista resumida do histórico) **não muda** — os campos novos só aparecem no
  detalhe de uma sessão, a lista não precisa do peso extra de payload.
- `src/local/rotas.js` ganha as duas rotas novas de série, senão elas respondem 404 dentro do APK.

**Validação do lançamento de série**: `carga` inteiro não-negativo (`0` é válido — exercício sem
peso externo); `repeticoes` string não vazia depois de `trim()`. Mesmo padrão de erro que o resto do
controller — `erroRequisicao` para o corpo inválido, `erroNaoEncontrado` quando o item não pertence
a uma sessão aberta do próprio aluno.

### Frontend — três telas, sem tocar na visão do professor

A visão do professor (`Frequencia.tsx`) só mostra a lista resumida hoje, sem detalhe por exercício —
fica fora deste trabalho.

**Execução (`MeuTreino.tsx`, `LinhaExecucao`)** — cada exercício ganha uma seta que expande um
formulário embaixo dele: carga (número) + repetições (texto livre), botão "Adicionar". As séries já
lançadas aparecem numa lista compacta acima do formulário, cada uma com um ícone de apagar (só
enquanto a sessão segue aberta). Um exercício expandido por vez — acordeão, não lista tudo aberto de
uma vez no celular. Marcar "concluído" continua uma ação independente de lançar série.

**Finalizar (painel de resumo)** — acima dos botões "Finalizar e salvar"/"Descartar treino", dois
campos opcionais: observação (texto livre) e calorias gastas (número). Vão no corpo do
`POST .../finalizar` só quando preenchidos; "Descartar" ignora os dois.

**Histórico (`DetalheSessao`, dentro de `Historico.tsx`)** — cada exercício que tem lançamento
ganha: a lista de séries realizadas (ex: "20kg×10 · 22kg×8") e um selo de ordem + tempo desde o
exercício concluído anterior, calculado a partir de `concluido_em` no front (sem coluna nova pra
isso). **A ordem visual da lista não muda** — continua a ordem do bloco prescrito, para comparar
fácil com o plano; o selo de ordem mostra a posição real da execução sem reordenar a tela.
Observação e calorias da sessão aparecem perto do cabeçalho (tempo/data), quando preenchidas.

## Testes

- Backend: uma suíte nova para `POST`/`DELETE` de série (guarda de sessão aberta e de dono, e a
  validação de `repeticoes` não vazio) e testes cobrindo `observacao`/`calorias` no `finalizarSessao`
  e no retorno de `carregarSessao`. `npm test` (pg-mem) e `npm run test:sqlite` — os dois têm que
  passar, sem trecho de código dependendo de qual banco está rodando.
- O teste que confere `src/local/rotas.js` contra `backend/src/routes/` nos dois sentidos já existe
  e vai pegar sozinho se as duas rotas novas ficarem de fora da tabela do APK.
- Frontend: teste para o fluxo de adicionar/apagar série na execução, para os campos novos do painel
  de finalizar, e para a exibição de séries/ordem/tempo/observação/calorias no detalhe do histórico.
  Mock em `lib/api.ts`, no padrão já usado no resto da suíte.

## Fora de escopo

- **Editar um lançamento de série já feito** — só apagar e relançar. Editar in-place é ideia
  separada no backlog ("editar treino finalizado no histórico"), que ainda depende de decisão sobre
  se números registrados podem mudar e se fica rastro de quem editou.
- **Visão do professor** para o detalhe por exercício — hoje ele só vê a lista resumida; abrir o
  detalhe pra ele é extensão natural, mas não foi pedida aqui.
- **Reordenar a lista do histórico** pela execução real em vez do bloco prescrito — decisão
  explícita de manter a ordem do prescrito.
- **Evolução de carga ao longo do tempo** (gráfico/tela dedicada) — é o que este trabalho alimenta,
  mas a tela em si é outro item do `ROADMAP.md` (seção 4.2), não faz parte desta leva.

## Critério de pronto

- `npm test` e `npm run test:sqlite` no backend passam, com saída limpa
- `npm test`, `npm run lint` e `npm run build` no frontend continuam passando
- `npx tsc --noEmit` limpo
- O teste cruzado de `src/local/rotas.js` continua verde com as rotas novas
- Fluxo conferido de ponta a ponta no emulador Android: lançar série durante a execução, finalizar
  com observação/calorias, ver os três no detalhe do histórico
- `backend/README.md` atualizado com as rotas novas
