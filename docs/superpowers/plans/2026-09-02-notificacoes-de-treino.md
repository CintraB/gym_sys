# Notificações de treino — plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> caixa (`- [ ]`) para acompanhamento.

**Objetivo:** o Android mostra uma notificação fixa enquanto existe treino em andamento, e avisa
quem deixou a sessão aberta por 2h.

**Arquitetura:** um módulo de fachada (`lib/notificacoes.ts`) sobre `@capacitor/local-notifications`,
chamado nos cinco pontos onde a sessão começa ou termina, mais uma reconciliação na abertura do app
montada num hook dentro do `AppShell`. Nada roda em segundo plano: o Android guarda o alarme e a
notificação.

**Stack:** React 18 + TypeScript, Capacitor 8, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-02-notificacoes-de-treino-design.md`

## Restrições globais

- **`@capacitor/local-notifications@^8.3.1`** (peer `@capacitor/core >=8.0.0`; o projeto está em
  `^8.5.0`). Instalar em `frontend/`, que é onde os pacotes vivem.
- **Nada de Java nosso em `android/`.** Sem foreground service. Se algo exigir isso, pare e
  reporte em vez de improvisar.
- **Todo caminho é no-op fora do aparelho**, guardado por `Capacitor.isNativePlatform()`. No
  navegador o módulo carrega e não faz nada — a versão web não ganha notificação.
- **Nomes em português** em funções, variáveis e props, como o resto do projeto.
- **Comentário explica por quê, não o quê.** Vários no projeto marcam armadilha já resolvida.
- **`npm test`, `npx tsc --noEmit` e `npm run lint` limpos** ao fim de cada tarefa. O lint roda com
  `--max-warnings 0`: um aviso é erro.
- **Não editar arquivo-fonte com `sed -i`** — no Windows isso grava por temporário + rename, o
  observador do Vite não percebe e o dev server passa a servir módulo velho.
- Ids das notificações: `ID_EM_ANDAMENTO = 1`, `ID_LEMBRETE = 2`. Um treino aberto por aluno é
  regra do banco (`idx_sessao_aberta_por_aluno`), então id fixo não colide.
- Constante do lembrete: `HORAS_ATE_LEMBRETE = 2`. **O texto da notificação deriva dela** — nunca
  escrever "2 horas" à mão na frase.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `frontend/src/lib/notificacoes.ts` (novo) | Fachada sobre o plugin: permissão, canais, anunciar, limpar, sincronizar. Sem React dentro |
| `frontend/src/lib/notificacoes.test.ts` (novo) | Testes do módulo, com o plugin mockado |
| `frontend/src/lib/useNotificacaoDeTreino.ts` (novo) | Hook fino: reconcilia na abertura, e navega quando a notificação é tocada |
| `frontend/src/lib/useNotificacaoDeTreino.test.tsx` (novo) | Testes do hook |
| `frontend/src/pages/aluno/MeuTreino.tsx` | Três pontos de transição: iniciar, finalizar, descartar |
| `frontend/src/pages/aluno/MeuTreino.test.tsx` | Testes de contrato dos três |
| `frontend/src/components/AppShell.tsx` | Dois pontos (finalizar e sair, descartar e sair) + montagem do hook |
| `frontend/src/components/AppShell.test.tsx` | Testes de contrato dos dois |

---

### Tarefa 1: o módulo, com o guarda de plataforma e `limparTreino`

Começa pelo `limparTreino` porque é a função sem dependência de nada: cancela dois ids. O guarda de
plataforma nasce aqui e vale para o resto.

**Arquivos:**
- Criar: `frontend/src/lib/notificacoes.ts`
- Criar: `frontend/src/lib/notificacoes.test.ts`
- Modificar: `frontend/package.json` (dependência nova)

**Interfaces:**
- Consome: nada.
- Produz: `limparTreino(): Promise<void>`, e as constantes `ID_EM_ANDAMENTO = 1`,
  `ID_LEMBRETE = 2`, `HORAS_ATE_LEMBRETE = 2` (exportadas — os testes das tarefas seguintes as usam).

- [ ] **Passo 1: instalar a dependência**

```bash
cd frontend && npm install @capacitor/local-notifications@^8.3.1
```

Confira que o `package.json` ficou com a linha em `dependencies`, ao lado de `@capacitor/app`.

- [ ] **Passo 2: escrever o teste que falha**

Crie `frontend/src/lib/notificacoes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { isNativePlatform } = vi.hoisted(() => ({ isNativePlatform: vi.fn(() => true) }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform },
}))

const cancel = vi.fn()
const schedule = vi.fn()
const createChannel = vi.fn()
const checkPermissions = vi.fn(async () => ({ display: 'granted' }))
const requestPermissions = vi.fn(async () => ({ display: 'granted' }))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    cancel: (...args: unknown[]) => cancel(...args),
    schedule: (...args: unknown[]) => schedule(...args),
    createChannel: (...args: unknown[]) => createChannel(...args),
    checkPermissions: () => checkPermissions(),
    requestPermissions: () => requestPermissions(),
  },
}))

import { ID_EM_ANDAMENTO, ID_LEMBRETE, limparTreino } from './notificacoes'

describe('limparTreino', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isNativePlatform.mockReturnValue(true)
  })

  it('cancela a notificação fixa e o lembrete, os dois de uma vez', async () => {
    await limparTreino()

    expect(cancel).toHaveBeenCalledWith({
      notifications: [{ id: ID_EM_ANDAMENTO }, { id: ID_LEMBRETE }],
    })
  })

  // O módulo é importado pela versão web também: no navegador ele tem de
  // carregar e não fazer nada, em vez de estourar sem o plugin nativo.
  it('não toca no plugin fora do aparelho', async () => {
    isNativePlatform.mockReturnValue(false)

    await limparTreino()

    expect(cancel).not.toHaveBeenCalled()
  })
})
```

- [ ] **Passo 3: rodar e confirmar que falha**

```bash
cd frontend && npx vitest run src/lib/notificacoes.test.ts
```

Esperado: FAIL com `Failed to resolve import "./notificacoes"`. Se falhar por outro motivo,
conserte antes de seguir.

- [ ] **Passo 4: implementar o mínimo**

Crie `frontend/src/lib/notificacoes.ts`:

```ts
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

/**
 * Ids fixos. Cancelar exige conhecer o id, e um treino aberto por aluno é
 * regra do banco (idx_sessao_aberta_por_aluno) — não há duas sessões para
 * anunciar, então id fixo não colide.
 */
export const ID_EM_ANDAMENTO = 1
export const ID_LEMBRETE = 2

/** Horas de treino aberto até o lembrete. O texto da notificação deriva daqui. */
export const HORAS_ATE_LEMBRETE = 2

/**
 * Notificação é coisa de aparelho. No navegador o módulo carrega e não faz
 * nada — a versão web não ganha notificação, e chamar o plugin ali quebraria.
 */
const noAparelho = () => Capacitor.isNativePlatform()

export async function limparTreino() {
  if (!noAparelho()) return
  await LocalNotifications.cancel({
    notifications: [{ id: ID_EM_ANDAMENTO }, { id: ID_LEMBRETE }],
  })
}
```

- [ ] **Passo 5: rodar e confirmar que passa**

```bash
cd frontend && npx vitest run src/lib/notificacoes.test.ts
```

Esperado: 2 passando.

- [ ] **Passo 6: suíte inteira, tipos e lint**

```bash
cd frontend && npm test && npx tsc --noEmit && npm run lint
```

Esperado: tudo verde, nenhum aviso.

- [ ] **Passo 7: commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/lib/notificacoes.ts frontend/src/lib/notificacoes.test.ts
git commit -m "adiciona o modulo de notificacoes com limparTreino

Fachada sobre @capacitor/local-notifications. Todo caminho e no-op fora
do aparelho: o modulo e importado pela versao web tambem."
```

---

### Tarefa 2: a permissão, pedida só uma vez

**Arquivos:**
- Modificar: `frontend/src/lib/notificacoes.ts`
- Modificar: `frontend/src/lib/notificacoes.test.ts`

**Interfaces:**
- Consome: `noAparelho()` da Tarefa 1.
- Produz: `garantirPermissao(): Promise<boolean>` — `true` se pode notificar.

- [ ] **Passo 1: escrever os testes que falham**

Acrescente ao fim de `frontend/src/lib/notificacoes.test.ts` (e adicione `garantirPermissao` ao
`import` do topo):

```ts
describe('garantirPermissao', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isNativePlatform.mockReturnValue(true)
  })

  it('não reabre o diálogo de quem já concedeu', async () => {
    checkPermissions.mockResolvedValue({ display: 'granted' })

    const pode = await garantirPermissao()

    expect(pode).toBe(true)
    expect(requestPermissions).not.toHaveBeenCalled()
  })

  it('pede quando ainda não foi decidido', async () => {
    checkPermissions.mockResolvedValue({ display: 'prompt' })
    requestPermissions.mockResolvedValue({ display: 'granted' })

    const pode = await garantirPermissao()

    expect(pode).toBe(true)
    expect(requestPermissions).toHaveBeenCalled()
  })

  // O Android só deixa pedir duas vezes; depois disso o pedido é negado sem
  // mostrar diálogo. Insistir não traria nada e gastaria a chance.
  it('não insiste com quem já negou', async () => {
    checkPermissions.mockResolvedValue({ display: 'denied' })

    const pode = await garantirPermissao()

    expect(pode).toBe(false)
    expect(requestPermissions).not.toHaveBeenCalled()
  })

  it('devolve falso, sem estourar, se o plugin falhar', async () => {
    checkPermissions.mockRejectedValue(new Error('sem plugin'))

    await expect(garantirPermissao()).resolves.toBe(false)
  })
})
```

- [ ] **Passo 2: rodar e confirmar que falham**

```bash
cd frontend && npx vitest run src/lib/notificacoes.test.ts
```

Esperado: os 4 novos falham com `garantirPermissao is not a function`.

- [ ] **Passo 3: implementar**

Acrescente a `frontend/src/lib/notificacoes.ts`:

```ts
/**
 * Garante a permissão de notificar, pedindo no máximo uma vez.
 *
 * O Android 13+ exige POST_NOTIFICATIONS em runtime, e só deixa pedir duas
 * vezes: depois disso o pedido é negado sem diálogo nenhum, e a única saída
 * são as configurações do sistema. Por isso quem já negou não é incomodado de
 * novo — e nada no app depende do retorno para funcionar.
 */
export async function garantirPermissao() {
  if (!noAparelho()) return false
  try {
    const atual = await LocalNotifications.checkPermissions()
    if (atual.display === 'granted') return true
    if (atual.display === 'denied') return false

    const pedido = await LocalNotifications.requestPermissions()
    return pedido.display === 'granted'
  } catch {
    // Notificação é enfeite: se o plugin falhar, o treino continua.
    return false
  }
}
```

- [ ] **Passo 4: rodar e confirmar que passam**

```bash
cd frontend && npx vitest run src/lib/notificacoes.test.ts
```

Esperado: 6 passando.

- [ ] **Passo 5: suíte inteira, tipos e lint**

```bash
cd frontend && npm test && npx tsc --noEmit && npm run lint
```

- [ ] **Passo 6: commit**

```bash
git add frontend/src/lib/notificacoes.ts frontend/src/lib/notificacoes.test.ts
git commit -m "pede a permissao de notificar no maximo uma vez

O Android 13+ exige POST_NOTIFICATIONS em runtime e so deixa pedir duas
vezes. Quem ja negou nao e incomodado de novo, e nada no app depende do
retorno para funcionar."
```

---

### Tarefa 3: `anunciarTreino` — a notificação fixa e o lembrete

O coração do trabalho. As duas notificações nascem juntas, numa chamada só.

**Arquivos:**
- Modificar: `frontend/src/lib/notificacoes.ts`
- Modificar: `frontend/src/lib/notificacoes.test.ts`

**Interfaces:**
- Consome: `garantirPermissao()`, `noAparelho()`, as três constantes.
- Produz: `anunciarTreino(sessao: SessaoCompleta): Promise<void>`.

O tipo `SessaoCompleta` está em `frontend/src/types.ts`: `{ sessao: Sessao, exercicios: [] }`, e o
que interessa em `sessao` é `iniciado_em: string`, `bloco_letra: string | null`,
`bloco_nome: string | null`.

- [ ] **Passo 1: escrever os testes que falham**

Acrescente ao `notificacoes.test.ts` (e ponha `anunciarTreino` e `HORAS_ATE_LEMBRETE` no import):

```ts
function sessaoFalsa(iniciadoEm: string, letra: string | null = 'A', nome: string | null = 'Peito e Tríceps') {
  return {
    sessao: {
      id_sessao: 1,
      id_treino: 1,
      id_bloco: 1,
      id_aluno: 2,
      iniciado_em: iniciadoEm,
      finalizado_em: null,
      duracao_segundos: null,
      nome_professor: 'Cristhian Cintra',
      bloco_letra: letra,
      bloco_nome: nome,
      observacao: null,
      calorias: null,
    },
    exercicios: [],
  }
}

/** Acha uma das notificações agendadas pelo id, no que foi passado ao schedule. */
function agendada(id: number) {
  const chamada = schedule.mock.calls.at(-1)?.[0] as
    | { notifications: Array<Record<string, unknown>> }
    | undefined
  return chamada?.notifications.find((n) => n.id === id)
}

describe('anunciarTreino', () => {
  const AGORA = new Date('2026-09-02T20:00:00Z')

  beforeEach(() => {
    vi.clearAllMocks()
    isNativePlatform.mockReturnValue(true)
    checkPermissions.mockResolvedValue({ display: 'granted' })
    vi.useFakeTimers()
    vi.setSystemTime(AGORA)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('posta a notificação fixa e agenda o lembrete de uma vez só', async () => {
    await anunciarTreino(sessaoFalsa(AGORA.toISOString()))

    expect(schedule).toHaveBeenCalledTimes(1)
    expect(agendada(ID_EM_ANDAMENTO)).toBeDefined()
    expect(agendada(ID_LEMBRETE)).toBeDefined()
  })

  // Sem ongoing a pessoa desliza o indicador para fora sem querer, e ele some
  // até o app reabrir.
  it('a fixa não desliza para fora e não faz som', async () => {
    await anunciarTreino(sessaoFalsa(AGORA.toISOString()))

    expect(agendada(ID_EM_ANDAMENTO)).toMatchObject({
      ongoing: true,
      autoCancel: false,
      channelId: 'treino-em-andamento',
    })
  })

  it('nomeia o bloco no título e leva a hora de início no corpo', async () => {
    await anunciarTreino(sessaoFalsa('2026-09-02T19:32:00Z'))

    const fixa = agendada(ID_EM_ANDAMENTO)
    expect(fixa?.title).toBe('Treino A em andamento')
    expect(fixa?.body).toContain('Peito e Tríceps')
    // A hora sai formatada no fuso local; basta provar que o horário está lá.
    expect(fixa?.body).toMatch(/\d{2}:\d{2}/)
  })

  it('funciona com bloco sem nome', async () => {
    await anunciarTreino(sessaoFalsa(AGORA.toISOString(), 'B', null))

    expect(agendada(ID_EM_ANDAMENTO)?.title).toBe('Treino B em andamento')
  })

  // O at sai de iniciado_em, não de Date.now(): reabrir o app não pode empurrar
  // o lembrete duas horas para frente toda vez.
  it('agenda o lembrete a partir do início da sessão, não de agora', async () => {
    const inicio = new Date('2026-09-02T19:00:00Z')
    vi.setSystemTime(new Date('2026-09-02T20:00:00Z'))

    await anunciarTreino(sessaoFalsa(inicio.toISOString()))

    const esperado = new Date(inicio.getTime() + HORAS_ATE_LEMBRETE * 60 * 60 * 1000)
    expect(agendada(ID_LEMBRETE)).toMatchObject({
      schedule: { at: esperado },
      channelId: 'lembretes',
    })
  })

  // Quem abre o app já está olhando para o treino em andamento: tocar o alarme
  // no mesmo segundo só assusta.
  it('descarta o lembrete já vencido, mas repõe a notificação fixa', async () => {
    vi.setSystemTime(new Date('2026-09-02T23:00:00Z'))

    await anunciarTreino(sessaoFalsa('2026-09-02T19:00:00Z'))

    expect(agendada(ID_LEMBRETE)).toBeUndefined()
    expect(agendada(ID_EM_ANDAMENTO)).toBeDefined()
  })

  it('o texto do lembrete acompanha a constante, em vez de repeti-la à mão', async () => {
    await anunciarTreino(sessaoFalsa(AGORA.toISOString()))

    expect(agendada(ID_LEMBRETE)?.body).toContain(String(HORAS_ATE_LEMBRETE))
  })

  it('cria os dois canais, com o indicador em importância mínima', async () => {
    await anunciarTreino(sessaoFalsa(AGORA.toISOString()))

    expect(createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'treino-em-andamento', importance: 1 }),
    )
    expect(createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'lembretes', importance: 3 }),
    )
  })

  it('sem permissão, não agenda nada — e não estoura', async () => {
    checkPermissions.mockResolvedValue({ display: 'denied' })

    await expect(anunciarTreino(sessaoFalsa(AGORA.toISOString()))).resolves.toBeUndefined()
    expect(schedule).not.toHaveBeenCalled()
  })

  it('não toca no plugin fora do aparelho', async () => {
    isNativePlatform.mockReturnValue(false)

    await anunciarTreino(sessaoFalsa(AGORA.toISOString()))

    expect(schedule).not.toHaveBeenCalled()
  })
})
```

Acrescente `afterEach` ao import do `vitest` no topo do arquivo.

- [ ] **Passo 2: rodar e confirmar que falham**

```bash
cd frontend && npx vitest run src/lib/notificacoes.test.ts
```

Esperado: os 10 novos falham com `anunciarTreino is not a function`.

- [ ] **Passo 3: implementar**

Acrescente a `frontend/src/lib/notificacoes.ts` (o import de tipo vai no topo do arquivo):

```ts
import type { SessaoCompleta } from '../types'

const CANAL_EM_ANDAMENTO = 'treino-em-andamento'
const CANAL_LEMBRETES = 'lembretes'

/**
 * Dois canais, não um.
 *
 * O indicador é informação, não alerta: com importância padrão, iniciar o
 * treino faria o celular tocar dentro da academia. O lembrete é o oposto —
 * precisa chamar quem já esqueceu, e silencioso não serviria para nada.
 *
 * Recriar canal existente é no-op no Android, e createChannel não desfaz o que
 * a pessoa mudou à mão nas configurações.
 */
async function garantirCanais() {
  await LocalNotifications.createChannel({
    id: CANAL_EM_ANDAMENTO,
    name: 'Treino em andamento',
    description: 'Indicador fixo enquanto há um treino aberto',
    importance: 1,
  })
  await LocalNotifications.createChannel({
    id: CANAL_LEMBRETES,
    name: 'Lembretes',
    description: 'Avisos sobre treino esquecido em andamento',
    importance: 3,
  })
}

const horaDe = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export async function anunciarTreino({ sessao }: SessaoCompleta) {
  if (!noAparelho()) return
  if (!(await garantirPermissao())) return

  await garantirCanais()

  const titulo = sessao.bloco_letra
    ? `Treino ${sessao.bloco_letra} em andamento`
    : 'Treino em andamento'

  // A hora vai no corpo porque o plugin não expõe o campo `when` do Android:
  // sem ela, a notificação reposta pela reconciliação diria "agora" para um
  // treino de duas horas.
  const inicio = `começou às ${horaDe(sessao.iniciado_em)}`
  const corpo = sessao.bloco_nome ? `${sessao.bloco_nome} · ${inicio}` : `${inicio} · toque para voltar`

  const notificacoes: Parameters<typeof LocalNotifications.schedule>[0]['notifications'] = [
    {
      id: ID_EM_ANDAMENTO,
      title: titulo,
      body: corpo,
      channelId: CANAL_EM_ANDAMENTO,
      ongoing: true,
      autoCancel: false,
      extra: { rota: '/aluno' },
    },
  ]

  const quandoLembrar = new Date(
    new Date(sessao.iniciado_em).getTime() + HORAS_ATE_LEMBRETE * 60 * 60 * 1000,
  )

  // Lembrete vencido é descartado, não disparado no ato: quem abre o app já
  // está olhando para o treino em andamento.
  if (quandoLembrar.getTime() > Date.now()) {
    notificacoes.push({
      id: ID_LEMBRETE,
      title: 'Treino ainda em andamento',
      // O número sai da constante: escrito à mão, mudar a constante faria a
      // notificação mentir, e ninguém confere isso depois.
      body: `Você começou há ${HORAS_ATE_LEMBRETE} horas. Finalize ou descarte quando puder.`,
      channelId: CANAL_LEMBRETES,
      schedule: { at: quandoLembrar },
      extra: { rota: '/aluno' },
    })
  }

  await LocalNotifications.schedule({ notifications: notificacoes })
}
```

- [ ] **Passo 4: rodar e confirmar que passam**

```bash
cd frontend && npx vitest run src/lib/notificacoes.test.ts
```

Esperado: 16 passando.

- [ ] **Passo 5: suíte inteira, tipos e lint**

```bash
cd frontend && npm test && npx tsc --noEmit && npm run lint
```

- [ ] **Passo 6: commit**

```bash
git add frontend/src/lib/notificacoes.ts frontend/src/lib/notificacoes.test.ts
git commit -m "anuncia o treino em andamento e agenda o lembrete de 2h

As duas notificacoes nascem juntas. O lembrete sai de iniciado_em, e nao
de agora, senao reabrir o app o empurraria duas horas para frente toda
vez; ja vencido, e descartado em vez de tocar no mesmo segundo em que a
pessoa abre o app.

A hora de inicio vai no corpo do texto porque o plugin nao expoe o campo
when do Android."
```

---

### Tarefa 4: `sincronizarTreino` e o hook de reconciliação

**Arquivos:**
- Modificar: `frontend/src/lib/notificacoes.ts`
- Modificar: `frontend/src/lib/notificacoes.test.ts`
- Criar: `frontend/src/lib/useNotificacaoDeTreino.ts`
- Criar: `frontend/src/lib/useNotificacaoDeTreino.test.tsx`

**Interfaces:**
- Consome: `anunciarTreino`, `limparTreino`, `noAparelho`.
- Produz: `sincronizarTreino(sessao: SessaoCompleta | null): Promise<void>` e o hook
  `useNotificacaoDeTreino(): void`.

- [ ] **Passo 1: teste de `sincronizarTreino`**

Acrescente ao `notificacoes.test.ts` (e ao import):

```ts
describe('sincronizarTreino', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isNativePlatform.mockReturnValue(true)
    checkPermissions.mockResolvedValue({ display: 'granted' })
  })

  it('sem sessão aberta, apaga o que tiver sobrado', async () => {
    await sincronizarTreino(null)

    expect(cancel).toHaveBeenCalled()
    expect(schedule).not.toHaveBeenCalled()
  })

  it('com sessão aberta, repõe o indicador', async () => {
    await sincronizarTreino(sessaoFalsa(new Date().toISOString()))

    expect(schedule).toHaveBeenCalled()
  })
})
```

- [ ] **Passo 2: rodar e confirmar que falham**

```bash
cd frontend && npx vitest run src/lib/notificacoes.test.ts
```

Esperado: os 2 novos falham com `sincronizarTreino is not a function`.

- [ ] **Passo 3: implementar `sincronizarTreino`**

```ts
/**
 * Alinha a barra de notificação com o estado real do banco.
 *
 * Existe porque o Android mata o app em segundo plano sob pressão de memória —
 * já aconteceu neste projeto, e foi o que causou o bug do perfil em 27/08.
 * Sem esta reconciliação sobraria um indicador dizendo "treino em andamento"
 * de um treino já finalizado, ou uma sessão aberta sem indicador nenhum.
 */
export async function sincronizarTreino(sessao: SessaoCompleta | null) {
  if (!noAparelho()) return
  if (sessao) await anunciarTreino(sessao)
  else await limparTreino()
}
```

- [ ] **Passo 4: rodar e confirmar que passam**

```bash
cd frontend && npx vitest run src/lib/notificacoes.test.ts
```

Esperado: 18 passando.

- [ ] **Passo 5: teste do hook**

Crie `frontend/src/lib/useNotificacaoDeTreino.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../auth/contexto'
import { ALUNO, PROFESSOR } from '../test/utils'
import type { Usuario } from '../types'

const { isNativePlatform } = vi.hoisted(() => ({ isNativePlatform: vi.fn(() => true) }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }))

const addListener = vi.fn(async () => ({ remove: vi.fn() }))
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: { addListener: (...a: unknown[]) => addListener(...a) },
}))

const sincronizarTreino = vi.fn()
vi.mock('./notificacoes', () => ({ sincronizarTreino: (...a: unknown[]) => sincronizarTreino(...a) }))

vi.mock('./api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  mensagemDeErro: (_e: unknown, padrao = 'erro') => padrao,
  registrarExpiracaoDeSessao: vi.fn(),
  tokenArmazenado: { ler: () => null, gravar: vi.fn(), limpar: vi.fn() },
}))

import { api } from './api'
import { useNotificacaoDeTreino } from './useNotificacaoDeTreino'

const get = vi.mocked(api.get)

function Harness() {
  useNotificacaoDeTreino()
  return null
}

function montar(usuario: Usuario | null) {
  const valor = {
    usuario,
    carregando: false,
    entrar: async () => usuario as Usuario,
    sair: () => {},
    atualizarUsuario: () => {},
  }
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthContext.Provider value={valor}>
        <Harness />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('useNotificacaoDeTreino', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isNativePlatform.mockReturnValue(true)
    get.mockResolvedValue({ data: null } as never)
  })

  it('reconcilia com a sessão do servidor na abertura', async () => {
    montar(ALUNO)

    await waitFor(() => expect(get).toHaveBeenCalledWith('/alunos/treino/sessao'))
    await waitFor(() => expect(sincronizarTreino).toHaveBeenCalledWith(null))
  })

  // Quem só dá aula não tem sessão de treino: a chamada seria 403 a cada
  // abertura do app.
  it('não consulta nada para quem não é aluno', async () => {
    montar(PROFESSOR)

    await waitFor(() => expect(addListener).not.toHaveBeenCalled())
    expect(get).not.toHaveBeenCalled()
  })

  it('não faz nada no navegador', async () => {
    isNativePlatform.mockReturnValue(false)

    montar(ALUNO)

    await waitFor(() => expect(get).not.toHaveBeenCalled())
  })
})
```

- [ ] **Passo 6: rodar e confirmar que falha**

```bash
cd frontend && npx vitest run src/lib/useNotificacaoDeTreino.test.tsx
```

Esperado: FAIL com `Failed to resolve import "./useNotificacaoDeTreino"`.

- [ ] **Passo 7: implementar o hook**

Crie `frontend/src/lib/useNotificacaoDeTreino.ts`:

```ts
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { api } from './api'
import { sincronizarTreino } from './notificacoes'
import { useAuth } from '../auth/useAuth'
import type { SessaoCompleta } from '../types'

/**
 * Alinha a barra de notificação com o banco quando o app abre, e leva para a
 * tela do treino quando a notificação é tocada.
 *
 * Mora no AppShell, e não no AlunoLayout, porque o caso que originou a ideia é
 * o professor que também treina: abrir o app em /professor precisa reconciliar
 * do mesmo jeito.
 */
export function useNotificacaoDeTreino() {
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const ehAluno = Boolean(usuario?.perfis.aluno)

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !ehAluno) return

    let cancelado = false

    api
      .get<SessaoCompleta | null>('/alunos/treino/sessao')
      .then(({ data }) => {
        if (!cancelado) return sincronizarTreino(data)
      })
      // Notificação é enfeite: falha de rede aqui não pode aparecer na tela.
      .catch(() => {})

    const promessa = LocalNotifications.addListener('localNotificationActionPerformed', (evento) => {
      const rota = evento.notification.extra?.rota
      // Sem isso o toque só traz o app à frente, na tela em que ele estava.
      if (typeof rota === 'string') navigate(rota)
    })

    return () => {
      cancelado = true
      promessa.then((ouvinte) => ouvinte.remove()).catch(() => {})
    }
  }, [ehAluno, navigate])
}
```

- [ ] **Passo 8: rodar e confirmar que passa**

```bash
cd frontend && npx vitest run src/lib/useNotificacaoDeTreino.test.tsx
```

Esperado: 3 passando.

- [ ] **Passo 9: suíte inteira, tipos e lint**

```bash
cd frontend && npm test && npx tsc --noEmit && npm run lint
```

- [ ] **Passo 10: commit**

```bash
git add frontend/src/lib/notificacoes.ts frontend/src/lib/notificacoes.test.ts frontend/src/lib/useNotificacaoDeTreino.ts frontend/src/lib/useNotificacaoDeTreino.test.tsx
git commit -m "reconcilia a notificacao com o banco quando o app abre

O Android mata o app em segundo plano, e sem isso sobraria um indicador
de treino ja finalizado ou uma sessao aberta sem indicador nenhum.

O hook mora no AppShell, e nao no AlunoLayout: o caso que originou a
ideia e o professor que tambem treina e abre o app em /professor."
```

---

### Tarefa 5: os cinco pontos de transição

É aqui que a notificação fantasma nasce, se um ponto for esquecido. Por isso o que se testa nas
telas é o **contrato** — que a tela chama a função —, não o plugin.

**Arquivos:**
- Modificar: `frontend/src/pages/aluno/MeuTreino.tsx` (iniciar, finalizar, descartar)
- Modificar: `frontend/src/pages/aluno/MeuTreino.test.tsx`
- Modificar: `frontend/src/components/AppShell.tsx` (as duas saídas do logout + montar o hook)
- Modificar: `frontend/src/components/AppShell.test.tsx`

**Interfaces:**
- Consome: `anunciarTreino`, `limparTreino` (Tarefas 1 e 3), `useNotificacaoDeTreino` (Tarefa 4).
- Produz: nada novo.

- [ ] **Passo 1: escrever os testes que falham**

Em `frontend/src/pages/aluno/MeuTreino.test.tsx`, acrescente o mock ao lado dos que já existem
(logo abaixo do `vi.mock('../../lib/api', …)`):

```ts
const anunciarTreino = vi.fn()
const limparTreino = vi.fn()
vi.mock('../../lib/notificacoes', () => ({
  anunciarTreino: (...a: unknown[]) => anunciarTreino(...a),
  limparTreino: (...a: unknown[]) => limparTreino(...a),
  sincronizarTreino: vi.fn(),
}))
```

E este bloco ao fim do arquivo. O preparo é o dos testes que já existem ali (`responder`,
`SESSAO_ATIVA`, `renderizar` — todos já definidos no topo do arquivo):

```ts
describe('MeuTreino — barra de notificação', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('anuncia o treino ao iniciar', async () => {
    responder()
    // A sessão criada é o que vai para a notificação, então a resposta do POST
    // precisa parecer uma: com { data: {} } o teste passaria sem provar nada.
    post.mockResolvedValue({ data: SESSAO_ATIVA } as never)
    const usuario = userEvent.setup()
    renderizar(<MeuTreino />, { usuario: ALUNO })

    await screen
      .findByRole('button', { name: /iniciar treino/i })
      .then((botao) => usuario.click(botao))
    await usuario.click(await screen.findByRole('button', { name: /^iniciar$/i }))

    await waitFor(() => expect(anunciarTreino).toHaveBeenCalledWith(SESSAO_ATIVA))
  })

  it('limpa a notificação ao finalizar', async () => {
    responder({ '/alunos/treino/sessao': SESSAO_ATIVA })
    post.mockResolvedValue({
      data: { sessao: SESSAO_ATIVA.sessao, exercicios: SESSAO_ATIVA.exercicios },
    } as never)
    const usuario = userEvent.setup()
    renderizar(<MeuTreino />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: /finalizar treino/i }))
    await usuario.click(screen.getByRole('button', { name: /finalizar e salvar/i }))

    await waitFor(() => expect(limparTreino).toHaveBeenCalled())
  })

  it('limpa a notificação ao descartar', async () => {
    responder({ '/alunos/treino/sessao': SESSAO_ATIVA })
    del.mockResolvedValue({ data: {} } as never)
    const usuario = userEvent.setup()
    renderizar(<MeuTreino />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: /finalizar treino/i }))
    await usuario.click(await screen.findByRole('button', { name: /descartar treino/i }))
    const dialogo = await screen.findByRole('alertdialog')
    await usuario.click(within(dialogo).getByRole('button', { name: /^descartar$/i }))

    await waitFor(() => expect(limparTreino).toHaveBeenCalled())
  })
})
```

**Atenção ao teste que já existe**, `só inicia o treino depois de confirmar`: o `beforeEach` dele
usa `post.mockResolvedValue({ data: {} })`. Depois da mudança, `iniciar` passa esse `data` para
`anunciarTreino` — que aqui está mockado, então nada quebra, mas troque para
`{ data: SESSAO_ATIVA }` mesmo assim: um mock que não parece o retorno real é armadilha para o
próximo que mexer.

Em `frontend/src/components/AppShell.test.tsx`, o mesmo bloco de mock de `../lib/notificacoes`
(ajustando o caminho para um nível só: `'../lib/notificacoes'`) e mais dois casos dentro do
`describe('AppShell — sair com treino em andamento')` que já existe:

```ts
  it('limpa a notificação ao finalizar e sair', async () => {
    get.mockResolvedValue({ data: SESSAO_ATIVA } as never)
    const usuario = userEvent.setup()
    renderizar(
      <AppShell itens={ITENS}>
        <div>conteúdo</div>
      </AppShell>,
      { usuario: ALUNO, sair: vi.fn() },
    )

    await clicarSair(usuario)
    const painel = await screen.findByRole('dialog', { name: /treino em andamento/i })
    await usuario.click(within(painel).getByRole('button', { name: /finalizar e sair/i }))

    await waitFor(() => expect(limparTreino).toHaveBeenCalled())
  })

  it('limpa a notificação ao descartar e sair', async () => {
    get.mockResolvedValue({ data: SESSAO_ATIVA } as never)
    const usuario = userEvent.setup()
    renderizar(
      <AppShell itens={ITENS}>
        <div>conteúdo</div>
      </AppShell>,
      { usuario: ALUNO, sair: vi.fn() },
    )

    await clicarSair(usuario)
    const painel = await screen.findByRole('dialog', { name: /treino em andamento/i })
    await usuario.click(within(painel).getByRole('button', { name: /descartar e sair/i }))

    await waitFor(() => expect(limparTreino).toHaveBeenCalled())
  })
```

**O `AppShell.test.tsx` precisa de mais dois mocks**, e esta é a armadilha desta tarefa: a partir
daqui o `AppShell` monta `useNotificacaoDeTreino`, e o hook importa o Capacitor no topo do módulo.
Mockar só `../lib/notificacoes` não basta — o hook real roda e vai atrás do plugin. Acrescente
junto dos outros mocks do arquivo:

```ts
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: { addListener: vi.fn(async () => ({ remove: vi.fn() })) },
}))
```

Com `isNativePlatform` falso o hook não consulta nada, que é exatamente o comportamento do
navegador — e os testes de logout que já existem seguem contando só as chamadas que eles esperam.

- [ ] **Passo 2: rodar e confirmar que falham**

```bash
cd frontend && npx vitest run src/pages/aluno/MeuTreino.test.tsx src/components/AppShell.test.tsx
```

Esperado: os 5 novos falham porque as telas ainda não chamam nada.

- [ ] **Passo 3: ligar os três pontos do `MeuTreino`**

No import, junto dos outros de `../../lib/`:

```ts
import { anunciarTreino, limparTreino } from '../../lib/notificacoes'
```

Em `iniciar` — o `POST` já devolve a sessão criada (`carregarSessao` no `sessaoController`), então
basta capturar a resposta:

```ts
      const { data } = await api.post<SessaoCompleta>(
        '/alunos/treino/sessao',
        idBloco ? { id_bloco: idBloco } : {},
      )
      await anunciarTreino(data)
      aoIniciar()
```

Em `finalizar`, logo depois do `setResumo(data)`:

```ts
      await limparTreino()
```

Em `descartar`, entre o `api.delete` e o `aoMudar()`:

```ts
      await limparTreino()
```

- [ ] **Passo 4: ligar os dois pontos do `AppShell` e montar o hook**

```ts
import { limparTreino } from '../lib/notificacoes'
import { useNotificacaoDeTreino } from '../lib/useNotificacaoDeTreino'
```

Dentro do componente, ao lado do `useEffect` de `salvarUltimaRota`:

```ts
  useNotificacaoDeTreino()
```

E nas duas funções:

```ts
  async function finalizarEDeslogar() {
    await api.post('/alunos/treino/sessao/finalizar')
    await limparTreino()
    setSessaoAtiva(null)
    sair()
  }

  async function descartarEDeslogar() {
    await api.delete('/alunos/treino/sessao')
    await limparTreino()
    setSessaoAtiva(null)
    sair()
  }
```

- [ ] **Passo 5: rodar e confirmar que passam**

```bash
cd frontend && npx vitest run src/pages/aluno/MeuTreino.test.tsx src/components/AppShell.test.tsx
```

Esperado: tudo verde, inclusive os testes que já existiam nos dois arquivos.

- [ ] **Passo 6: suíte inteira, tipos, lint e os dois builds**

```bash
cd frontend && npm test && npx tsc --noEmit && npm run lint && npm run build && npm run build:standalone
```

O `build:standalone` termina com "Bundle do app conferido: nucleo presente, nada de Node dentro".
Se essa linha não aparecer, pare: o núcleo saiu do bundle.

- [ ] **Passo 7: commit**

```bash
git add frontend/src/pages/aluno/MeuTreino.tsx frontend/src/pages/aluno/MeuTreino.test.tsx frontend/src/components/AppShell.tsx frontend/src/components/AppShell.test.tsx
git commit -m "liga a notificacao aos cinco pontos onde a sessao comeca ou termina

Iniciar, finalizar e descartar na tela do treino; finalizar e sair e
descartar e sair no logout, que decide em outro lugar da arvore. Esquecer
um deles deixa a notificacao fantasma, e e isso que os testes cobrem."
```

---

### Tarefa 6: o APK e a verificação no aparelho

Nada aqui é automatizável, e é onde **todo bug de Android deste projeto apareceu**. Não pule.

**Arquivos:** nenhum de código. Possivelmente `android/` regenerado pelo `cap sync`.

- [ ] **Passo 1: sincronizar o plugin novo com o projeto Android**

```bash
cd frontend && npx cap sync android
```

Sem isso o plugin não entra no APK, e as chamadas falham em silêncio no aparelho.

- [ ] **Passo 2: conferir a permissão no manifesto**

```bash
grep -r "POST_NOTIFICATIONS" frontend/android/
```

O plugin declara a permissão sozinho no merge do manifesto. Se não aparecer, pare e reporte —
é a permissão de que tudo depende.

- [ ] **Passo 3: encurtar o lembrete para poder testá-lo**

Em `frontend/src/lib/notificacoes.ts`, troque `HORAS_ATE_LEMBRETE = 2` por `2 / 60` (dois
minutos). **Anote para devolver no Passo 7** — é a pegadinha óbvia deste passo.

- [ ] **Passo 4: gerar e instalar**

```bash
cd frontend && npm run apk
adb uninstall com.cintra.gymsys
adb install <caminho do APK que o script imprimiu>
```

`adb install -r` **não basta**: o Service Worker guarda o bundle antigo em cache e o JS novo não
carrega. É achado da sessão de 26-27/08.

- [ ] **Passo 5: o roteiro no aparelho**

- [ ] Entrar como aluno e iniciar um treino → o diálogo de permissão aparece **depois** da
      confirmação "Iniciar treino agora?", não em cima dela
- [ ] Conceder → a notificação fixa aparece, **sem som**, com "Treino A em andamento" e a hora
- [ ] Tentar deslizar a notificação para fora → ela **não sai**
- [ ] Minimizar e esperar dois minutos → o lembrete toca, **com som**
- [ ] Tocar a notificação → o app abre em `/aluno`
- [ ] Finalizar o treino → **as duas** somem da barra
- [ ] Iniciar outro treino, matar o app com `adb shell am force-stop com.cintra.gymsys`,
      reabrir → o indicador continua correto (é a reconciliação)
- [ ] Iniciar um treino, finalizar por "Sair" → escolher "Finalizar e sair" limpa a barra;
      repetir com "Descartar e sair"
- [ ] Negar a permissão numa instalação limpa → o treino inicia e funciona inteiro, sem
      notificação e sem erro na tela

- [ ] **Passo 6: conferir que o JS novo carregou, se algo parecer velho**

No CDP, comparar `document.querySelector('script[src]').src` com o hash em `dist-app/assets/`.
Divergiu, o cache do Service Worker venceu: desinstalar e instalar de novo.

- [ ] **Passo 7: devolver a constante e commitar**

```bash
# HORAS_ATE_LEMBRETE volta a 2
cd frontend && npm test && npx tsc --noEmit && npm run lint
git add frontend/android frontend/src/lib/notificacoes.ts
git commit -m "sincroniza o plugin de notificacoes com o projeto Android"
```

- [ ] **Passo 8: marcar o backlog**

Em `Brain: 02-Notas/gym_sys-teste-campo-1-melhorias.md`, marcar os dois itens do bloco "Depois —
dependem de infraestrutura maior" que este trabalho fecha, registrando o que o aparelho mostrou —
inclusive o que **não** funcionou como esperado, que é o que vale para a próxima vez.

---

## Depois das seis tarefas

- Sobra no bloco "dependem de infraestrutura maior" o **autosave de formulários**, que a spec
  deixou de fora de propósito: é transversal a várias telas e o próprio backlog diz para tratá-lo
  por caso concreto de perda, não como feature isolada.
- O item pendente da tarefa anterior segue valendo: conferir no aparelho se o teclado do Android
  cobre a lista do `SelecaoBuscavel`. Como o APK vai ser gerado aqui de todo jeito, aproveite a
  mesma instalação.
