# Notificações de treino — desenho

Data: 2026-09-02
Origem: itens do backlog do teste de campo 1 (`Brain: gym_sys-teste-campo-1-melhorias.md`),
bloco "Depois — dependem de infraestrutura maior".

## O problema

Duas queixas do uso real, anotadas em 24-25/08/2026:

1. **Não há indicador de treino em andamento fora do app.** Quem minimiza o Gym Sys no meio do
   treino não tem nada na tela que lembre que existe uma sessão aberta.
2. **Sessão esquecida aberta.** O caso que originou a ideia é o professor que também treina:
   inicia a sessão, vai dar aula, e horas depois o treino continua "em andamento".

As duas se resolvem na barra de notificação do Android — o único lugar do sistema que o app
alcança estando fechado.

## Decisões tomadas no brainstorming

| Pergunta | Decisão | Por quê |
|---|---|---|
| Cronômetro vivo na notificação? | **Não.** Notificação fixa com a hora de início | O Android transforma `when` em "há 12 min" sozinho. Um cronômetro correndo exigiria foreground service em Java, canal próprio e `FOREGROUND_SERVICE_HEALTH` no Android 14+ — o app deixaria de ser "web dentro do Capacitor" e viraria manutenção a cada atualização do AGP |
| Lembrete dispara para quem? | **Todo treino em andamento** | Restringir a quem tem mais de um perfil criaria um caso que ninguém lembra de conferir. Quem esquece a sessão aberta esquece tendo um perfil ou três |
| Tempo até o lembrete | **2h fixo, constante no código** | Tornar ajustável traz onde guardar a preferência, e no APK isso é mais uma coluna no SQLite ou uma chave em `localStorage` que some na reinstalação. Se 2h se mostrar errado, muda-se o número |
| Ação "Finalizar" na notificação | **Não** | Exigiria acordar o WebView e rodar o controller com o app morto — frágil e caro. O toque abre o app na tela do treino, onde finalizar já funciona |
| Onde a lógica vive | **Módulo de serviço + reconciliação na abertura** | Ver "Arquitetura" abaixo |

## Escopo

**Dentro:**

- Notificação fixa (`ongoing`) enquanto existe sessão aberta, removida ao fechá-la.
- Notificação agendada para 2h após o início, cancelada quando a sessão fecha antes disso.
- Pedido de permissão `POST_NOTIFICATIONS` no momento em que o motivo é óbvio.
- Reconciliação do estado na abertura do app.

**Fora:**

- Qualquer notificação que não seja sobre a sessão de treino (pedido de treino respondido,
  aluno sumido, etc.). São outros gatilhos, e nenhum foi pedido.
- Notificação na versão web. O `Notification` do navegador é outra API, com outro modelo de
  permissão, e o alvo declarado do backlog é o Android.
- Foreground service, e portanto qualquer código Java nosso em `android/`.
- Preferência de usuário para desligar as notificações. Quem não quiser desliga pelo Android,
  por app, como em qualquer outro.

## Arquitetura

### O módulo — `frontend/src/lib/notificacoes.ts`

Fachada sobre `@capacitor/local-notifications`, com três funções e nenhum React dentro:

```ts
anunciarTreino(sessao: SessaoCompleta): Promise<void>
limparTreino(): Promise<void>
sincronizarTreino(sessao: SessaoCompleta | null): Promise<void>
```

`anunciarTreino` posta a notificação fixa **e** agenda o lembrete, numa chamada só — as duas
sempre nascem juntas. `limparTreino` cancela as duas. `sincronizarTreino` é a reconciliação:
recebe o estado real e chama uma ou outra.

**Toda função é no-op fora do aparelho.** `Capacitor.isNativePlatform()` guarda a porta de
entrada, como já faz o `useBotaoVoltarAndroid`. No navegador o módulo carrega e não faz nada.

**Ids fixos**, porque cancelar exige conhecer o id:

```ts
const ID_EM_ANDAMENTO = 1
const ID_LEMBRETE = 2
```

Um treino de cada vez por aluno é regra do banco (`idx_sessao_aberta_por_aluno`), então id fixo
não colide — não há duas sessões abertas para anunciar.

**O lembrete vencido não é reagendado.** O `at` sai de `iniciado_em + 2h`, e a reconciliação
pode encontrar uma sessão aberta há mais tempo que isso — app morto antes de o alarme tocar,
ou aparelho desligado na hora. Nesse caso o lembrete é **descartado**, não disparado no ato:
alguém que abre o app já está olhando para o treino em andamento, e um alarme dizendo "ainda
em andamento" no mesmo segundo só assusta. A notificação fixa é reposta normalmente.

### Dois canais, não um

| Canal | Importância | Som | Para quê |
|---|---|---|---|
| `treino-em-andamento` | `min` | não | É um indicador, não um alerta. Com importância padrão, iniciar o treino faria o celular tocar dentro da academia |
| `lembretes` | `default` | sim | Precisa chamar atenção de quem já esqueceu — silencioso, não serviria para nada |

Criados na primeira vez que se anuncia um treino. Recriar canal existente é no-op no Android, e
`createChannel` depois de criado não altera o que o usuário mudou à mão — de propósito, do lado
do sistema.

### A reconciliação, e por que ela é o ponto que importa

O estado real é "existe sessão aberta?", e ele vive no banco, não na notificação. Se a
notificação só fosse postada no clique de "iniciar", o app ficaria dessincronizado no caso que
**já aconteceu neste projeto**: o Android mata o app em segundo plano sob pressão de memória
(reproduzido em 27/08 com `am force-stop`, e foi o que causou o bug do perfil). Nesse cenário
sobraria uma notificação fixa dizendo "treino em andamento" de um treino já finalizado em outro
aparelho, ou o inverso — sessão aberta sem indicador nenhum.

Por isso `sincronizarTreino` roda **na abertura do app**, montada num hook fino
(`useNotificacaoDeTreino`) dentro do `AppShell`.

**No `AppShell`, e não no `AlunoLayout`**: o `AppShell` é comum às três áreas, e o caso que
originou a ideia é justamente o professor que também treina — se o hook morasse na área do
aluno, abrir o app em `/professor` não reconciliaria nada. O hook consulta
`GET /alunos/treino/sessao` apenas quando `usuario.perfis.aluno` é verdadeiro, e nem isso fora
do aparelho.

### Os pontos de transição

| Momento | Onde | Chamada |
|---|---|---|
| Iniciar treino | `MeuTreino.tsx` — `POST /alunos/treino/sessao` | `anunciarTreino` |
| Finalizar | `MeuTreino.tsx` — `POST .../sessao/finalizar` | `limparTreino` |
| Descartar | `MeuTreino.tsx` — `DELETE /alunos/treino/sessao` | `limparTreino` |
| Finalizar e sair | `AppShell.tsx` — `finalizarEDeslogar` | `limparTreino` |
| Descartar e sair | `AppShell.tsx` — `descartarEDeslogar` | `limparTreino` |
| App abre | `AppShell.tsx` — `useNotificacaoDeTreino` | `sincronizarTreino` |

São cinco pontos porque o logout com treino ativo força a decisão em outro lugar da árvore
(decisão de 26/08). Esquecer um deles deixa a notificação fantasma — o que os testes cobrem.

### A permissão

Android 13+ exige `POST_NOTIFICATIONS` em runtime. O pedido sai **na primeira vez que se inicia
um treino**, logo depois da confirmação "Iniciar treino agora?" — o momento em que o motivo é
óbvio para quem lê o diálogo do sistema. Pedir na abertura do app mostraria um diálogo sem
contexto, que é o que faz as pessoas negarem.

Negada, o app segue inteiro: o treino inicia, a execução funciona, nada quebra e **nada
insiste**. O Android só permite pedir duas vezes de qualquer forma; depois disso o pedido é
negado sem mostrar diálogo, e a única saída é as configurações do sistema.

`checkPermissions` antes de `requestPermissions`, para não reabrir o diálogo a cada treino de
quem já concedeu.

### O toque

`extra: { rota: '/aluno' }` na notificação, e um listener de `localNotificationActionPerformed`
que navega para lá. Sem isso o toque só traz o app à frente, na tela em que ele estava — que
pode ser qualquer uma.

## Conteúdo das notificações

**Em andamento** (fixa, sem som):

```
Treino A em andamento
Peito e Tríceps · toque para voltar
```

O subtítulo cai para só "toque para voltar" quando o bloco não tem nome — `rotularBloco` já
trata isso e é reaproveitado.

**Lembrete** (2h depois, com som):

```
Treino ainda em andamento
Você começou há 2 horas. Finalize ou descarte quando puder.
```

O "2 horas" é **derivado da constante**, não escrito à mão no texto: mudar `HORAS_ATE_LEMBRETE`
sem mudar a frase faria a notificação mentir, e é o tipo de detalhe que ninguém confere depois.
Um teste cobre isso.

O texto não acusa ("você esqueceu"): pode ser um treino longo de verdade.

## Testes

Vitest, ao lado do código, com `@capacitor/local-notifications` e `@capacitor/core` mockados —
o mesmo desenho de `useBotaoVoltarAndroid.test.tsx`, que já prova esse caminho.

`notificacoes.test.ts`:

- anunciar posta a fixa **e** agenda o lembrete para 2h à frente
- o lembrete é agendado com `at` calculado a partir de `iniciado_em` da sessão, não de `Date.now()` —
  reabrir o app não empurra o lembrete para frente
- lembrete já vencido é descartado, e não disparado no ato, mas a notificação fixa é reposta
- o texto do lembrete acompanha a constante: mudá-la muda a frase
- limpar cancela as duas
- sincronizar com sessão nula limpa; com sessão anuncia
- fora do aparelho nada é chamado (o guarda de `isNativePlatform`)
- permissão negada não impede o resto do fluxo

`useNotificacaoDeTreino.test.tsx`:

- só consulta a sessão quando o usuário tem o perfil de aluno
- não consulta nada fora do aparelho

Nas telas, o que se testa é o **contrato**, não o plugin: que finalizar, descartar e as duas
saídas do logout chamam `limparTreino`. É o esquecimento de um desses cinco pontos que gera a
notificação fantasma, e é o que um teste pega e uma revisão não.

## O que só o aparelho responde

Fica registrado porque neste projeto **todo bug de Android apareceu no aparelho, não no teste**:

- Se a notificação `ongoing` do canal `min` realmente aparece sem som e não desliza.
- Se o diálogo de permissão sai no momento certo, depois da confirmação e não em cima dela.
- Se o toque abre em `/aluno` mesmo com o app morto.
- Se o lembrete de 2h dispara com o app fechado (encurtar a constante para 2 minutos durante o
  teste, e lembrar de devolvê-la).
- **`npx cap sync android` antes do `npm run apk`** — plugin novo não entra no APK sem isso.
- **`adb uninstall` + `adb install`**, nunca `-r`: o Service Worker guarda o bundle antigo.

## Dependência nova

`@capacitor/local-notifications@^8.3.1` (peer `@capacitor/core >=8.0.0`; o projeto está em
`^8.5.0`). É a segunda dependência de Capacitor do projeto, depois de `@capacitor/app`, e segue
o mesmo padrão: importada só onde o guarda de plataforma protege.

O `AndroidManifest.xml` ganha `POST_NOTIFICATIONS` — o plugin declara sozinho no merge do
manifesto, mas convém conferir depois do `cap sync`, porque é a permissão de que tudo depende.
