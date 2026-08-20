# Testes de frontend — plano de implementação

> **Para quem executa:** use `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para tocar tarefa a tarefa. Os passos usam `- [ ]` para
> acompanhamento.

**Objetivo:** dar ao `frontend/` uma primeira suíte de testes que pegue erro de renderização em
qualquer página e cubra a lógica de exibição e os hooks.

**Arquitetura:** Vitest rodando sobre o `vite.config.ts` que já existe, com jsdom e Testing
Library. Os testes ficam ao lado do código. A API é substituída por `vi.mock` sobre
`src/lib/api.ts`, que é o único ponto de saída HTTP do app.

**Stack:** vitest, @testing-library/react, @testing-library/user-event,
@testing-library/jest-dom, jsdom.

**Spec:** `docs/superpowers/specs/2026-08-19-testes-frontend-design.md`

## Restrições globais

- **Idioma:** nomes de teste, variáveis e comentários em **pt-BR**, como o resto do projeto
  (`renderizar`, `carregando`, `aoFechar`).
- **Sem `globals: true` no Vitest.** Cada arquivo importa `{ describe, it, expect, vi }` de
  `'vitest'`. Isso evita mexer no `eslint.config.js` e no `types` do `tsconfig.json` — o projeto
  roda ESLint com `--max-warnings 0`, e global não declarado vira erro.
- **Não atualizar o Vite.** O projeto está no Vite 5. Se o vitest mais novo exigir Vite 6, instalar
  a última versão de vitest da linha compatível com Vite 5 (`vitest@^2`).
- **Comentário explica o porquê, não o quê** — convenção do projeto.
- **Nada de `console.error` em teste que passa.** Saída suja é falha.
- **Não commitar `CLAUDE.md` nem `CREDENCIAIS-LOCAIS.md`** — são locais.
- Commits em português, no imperativo, **sem `Co-Authored-By`**, direto na `main`, **sem push**.

## Método: como provar um teste aqui

O código de produção já existe, então **todo teste desta suíte passa de primeira**. Teste que nunca
falhou não provou nada. Para cada teste, ou cada grupo coeso de testes:

1. Escrever e ver passar.
2. **Quebrar de propósito** a linha de produção que ele protege.
3. Confirmar o vermelho, e que a mensagem é a esperada.
4. Desfazer a quebra e confirmar o verde.

O passo 2 não é opcional. Cada tarefa abaixo diz exatamente o que quebrar.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `frontend/vite.config.ts` | ganha a seção `test` (jsdom, setup, include) |
| `frontend/package.json` | ganha `test` e `test:watch` e as devDependencies |
| `frontend/src/test/setup.ts` | matchers do jest-dom, `cleanup` entre testes |
| `frontend/src/test/utils.tsx` | `renderizar()` e as fixtures `PROFESSOR` / `ALUNO` |
| `frontend/src/lib/formato.test.ts` | as quinze funções puras |
| `frontend/src/lib/useRequisicao.test.tsx` | estados, `recarregar`, `definirDados` |
| `frontend/src/lib/useCronometro.test.ts` | deriva do timestamp, não acumula |
| `frontend/src/lib/useDebounce.test.ts` | só o último valor atravessa |
| `frontend/src/auth/RotaProtegida.test.tsx` | os quatro caminhos de autorização |
| `frontend/src/pages/paginas.test.tsx` | smoke render das nove páginas |

---

## Tarefa 1: infraestrutura de teste, com um teste-âncora

Entrega `npm test` funcionando. O teste-âncora é mínimo de propósito: serve para provar que a
infra roda, não para cobrir `formato.ts` — isso é a Tarefa 2.

**Arquivos:**
- Modificar: `frontend/package.json`
- Modificar: `frontend/vite.config.ts`
- Criar: `frontend/src/test/setup.ts`
- Criar: `frontend/src/test/utils.tsx`
- Criar: `frontend/src/lib/formato.test.ts` (só o âncora)

**Interfaces produzidas** (as tarefas seguintes dependem destes nomes exatos):

```ts
// src/test/utils.tsx
export const PROFESSOR: Usuario
export const ALUNO: Usuario
export function renderizar(
  ui: ReactElement,
  opcoes?: {
    rota?: string        // entrada inicial do MemoryRouter. Padrão '/'
    caminho?: string     // padrão de rota, para quem usa useParams. Ex: '/professor/alunos/:id/frequencia'
    usuario?: Usuario | null
    carregando?: boolean
  },
): RenderResult
```

- [ ] **Passo 1: instalar as dependências**

```bash
cd frontend
npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

- [ ] **Passo 2: confirmar que o Vite não foi atualizado**

```bash
npm ls vite
```

Esperado: uma única versão, `vite@5.x`. Se aparecer `vite@6` ou um conflito de versões, desfazer com
`npm install -D vitest@^2` e conferir de novo. **Não atualizar o Vite.**

- [ ] **Passo 3: criar `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Sem isso, o DOM de um teste sobrevive para o seguinte e um getByText passa
// a encontrar dois elementos iguais.
afterEach(cleanup)
```

- [ ] **Passo 4: criar `src/test/utils.tsx`**

```tsx
import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../auth/contexto'
import type { Usuario } from '../types'

export const PROFESSOR: Usuario = {
  id: 1,
  nome: 'Cristhian Cintra',
  cpf: '11111111111',
  email: 'professor@teste.com',
  titulo: '111111111111',
  cargo: 'professor',
  perfis: { aluno: false, professor: true },
  ativo: true,
}

export const ALUNO: Usuario = {
  id: 2,
  nome: 'Ana Souza',
  cpf: '22222222222',
  email: 'ana@teste.com',
  titulo: '222222222222',
  cargo: 'aluno',
  perfis: { aluno: true, professor: false },
  ativo: true,
}

interface Opcoes {
  rota?: string
  /** Padrão de rota. Só é preciso para telas que leem useParams. */
  caminho?: string
  usuario?: Usuario | null
  carregando?: boolean
}

/**
 * Renderiza com router e sessão já resolvida.
 *
 * O contexto é injetado direto, sem o AuthProvider real, porque ele busca /me
 * na montagem — usá-lo obrigaria todo teste a esperar uma requisição que não
 * é o assunto dele.
 */
export function renderizar(
  ui: ReactElement,
  { rota = '/', caminho, usuario = PROFESSOR, carregando = false }: Opcoes = {},
) {
  const valor = {
    usuario,
    carregando,
    entrar: async () => usuario as Usuario,
    sair: () => {},
  }

  return render(
    <MemoryRouter initialEntries={[rota]}>
      <AuthContext.Provider value={valor}>
        {caminho ? (
          <Routes>
            <Route path={caminho} element={ui} />
          </Routes>
        ) : (
          ui
        )}
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}
```

- [ ] **Passo 5: adicionar a seção `test` ao `vite.config.ts`**

Trocar a primeira linha do arquivo, de:

```ts
import { defineConfig } from 'vite'
```

para:

```ts
import { defineConfig } from 'vitest/config'
```

E acrescentar, dentro do objeto passado ao `defineConfig`, ao lado de `plugins`, `server` e
`preview`:

```ts
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // globals fica desligado: os testes importam describe/it/expect de
    // 'vitest'. Com globals ligado, o ESLint (que roda com --max-warnings 0)
    // acusaria cada um como variável não declarada.
    globals: false,
    css: false,
  },
```

- [ ] **Passo 6: adicionar os scripts ao `package.json`**

Na seção `scripts`, ao lado de `dev`, `build`, `lint` e `preview`:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Passo 7: escrever o teste-âncora**

Criar `src/lib/formato.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mascararCpf } from './formato'

describe('mascararCpf', () => {
  it('formata onze dígitos', () => {
    expect(mascararCpf('12345678901')).toBe('123.456.789-01')
  })
})
```

- [ ] **Passo 8: rodar**

Run: `npm test`
Esperado: 1 teste, 1 passando, saída limpa.

Se o `vite-plugin-pwa` reclamar durante os testes, desligá-lo em modo teste no `vite.config.ts`
trocando o array `plugins` por uma função que recebe o modo — o plugin não tem papel algum em
jsdom:

```ts
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'test' ? [] : [VitePWA({ /* … igual ao que já está … */ })])],
  // … server, preview, test
}))
```

- [ ] **Passo 9: provar que o âncora pega**

Em `src/lib/formato.ts`, na função `mascararCpf`, trocar `.slice(0, 11)` por `.slice(0, 10)`.

Run: `npm test`
Esperado: FALHA, com `expected '123.456.789-0' to be '123.456.789-01'`.

Desfazer a alteração e rodar de novo. Esperado: PASSA.

- [ ] **Passo 10: confirmar que lint e build seguem passando**

Run: `npm run lint && npm run build`
Esperado: os dois sem erro. Se o `tsc` reclamar dos arquivos de teste, **não** exclua `src/test` do
`tsconfig.json` — os testes devem ser verificados. Resolva o tipo que estiver faltando.

- [ ] **Passo 11: commit**

```bash
cd ..
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/src/test frontend/src/lib/formato.test.ts
git commit -F - <<'EOF'
Monta a infraestrutura de teste do frontend

Vitest sobre o vite.config que ja existe, com jsdom e Testing Library.
Reaproveitar o config evita um segundo pipeline de build para manter em
sincronia com o primeiro.

globals fica desligado de proposito: o lint roda com --max-warnings 0, e
describe/it/expect como global nao declarada viraria erro. Cada arquivo
importa de 'vitest'.

O helper renderizar() injeta o AuthContext direto em vez de usar o
AuthProvider real, que busca /me na montagem — sem isso todo teste teria
de esperar uma requisicao que nao e o assunto dele.
EOF
```

---

## Tarefa 2: `formato.ts` por inteiro

**Arquivos:**
- Modificar: `frontend/src/lib/formato.test.ts` (substitui o âncora)

**Interfaces consumidas:** nenhuma além do próprio módulo.

- [ ] **Passo 1: escrever a suíte completa**

Substituir o conteúdo de `src/lib/formato.test.ts` por:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  contar,
  descreverSerie,
  descreverSerieCurta,
  formatarCarga,
  formatarCronometro,
  formatarDuracao,
  iniciais,
  mascararCpf,
  mascararTitulo,
  primeiroNome,
  rotularBloco,
  somenteDigitos,
  tempoRelativo,
} from './formato'

describe('somenteDigitos', () => {
  it('descarta tudo que não é dígito', () => {
    expect(somenteDigitos('123.456.789-01')).toBe('12345678901')
  })
})

describe('mascararCpf', () => {
  it('formata onze dígitos', () => {
    expect(mascararCpf('12345678901')).toBe('123.456.789-01')
  })

  it('formata parcialmente enquanto se digita', () => {
    expect(mascararCpf('123')).toBe('123')
    expect(mascararCpf('1234')).toBe('123.4')
    expect(mascararCpf('1234567')).toBe('123.456.7')
  })

  it('ignora o que passa de onze dígitos', () => {
    expect(mascararCpf('123456789012345')).toBe('123.456.789-01')
  })
})

describe('mascararTitulo', () => {
  it('agrupa de quatro em quatro', () => {
    expect(mascararTitulo('123456789012')).toBe('1234 5678 9012')
  })

  it('ignora o que passa de doze dígitos', () => {
    expect(mascararTitulo('1234567890123456')).toBe('1234 5678 9012')
  })
})

describe('tempoRelativo', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const fixarHoje = (iso: string) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(iso))
  }

  it('diz hoje e ontem', () => {
    fixarHoje('2026-08-19T12:00:00Z')
    expect(tempoRelativo('2026-08-19T09:00:00Z')).toBe('hoje')
    expect(tempoRelativo('2026-08-18T09:00:00Z')).toBe('ontem')
  })

  it('conta em dias abaixo de um mês', () => {
    fixarHoje('2026-08-19T12:00:00Z')
    expect(tempoRelativo('2026-08-14T12:00:00Z')).toBe('há 5 dias')
  })

  it('vira meses a partir de trinta dias', () => {
    fixarHoje('2026-08-19T12:00:00Z')
    expect(tempoRelativo('2026-07-19T12:00:00Z')).toBe('há 1 mês')
    expect(tempoRelativo('2026-06-01T12:00:00Z')).toBe('há 2 meses')
  })
})

describe('formatarCarga', () => {
  it('acrescenta a unidade', () => {
    expect(formatarCarga(20)).toBe('20 kg')
    expect(formatarCarga('45')).toBe('45 kg')
  })

  // Cardio é gravado com carga 0: mostrar "0 kg" numa esteira é ruído.
  it('devolve null quando não há carga', () => {
    expect(formatarCarga(0)).toBeNull()
    expect(formatarCarga(null)).toBeNull()
    expect(formatarCarga('')).toBeNull()
    expect(formatarCarga('abc')).toBeNull()
  })
})

describe('descreverSerie', () => {
  it('junta séries, repetições e carga', () => {
    expect(descreverSerie(4, '10 a 15', 20)).toBe('4 séries · 10 a 15 reps · 20 kg')
  })

  // Cardio: 0 séries, repetições vazias, carga 0. Sem o corte, viraria
  // "0 séries ·  reps · 0 kg".
  it('some inteira no cardio', () => {
    expect(descreverSerie(0, '', 0)).toBe('')
  })

  it('omite só a parte que falta', () => {
    expect(descreverSerie(3, '12', null)).toBe('3 séries · 12 reps')
  })
})

describe('descreverSerieCurta', () => {
  it('usa o formato 4x10 a 15', () => {
    expect(descreverSerieCurta(4, '10 a 15', 20)).toBe('4x10 a 15 · 20 kg')
  })

  it('cai para "séries" quando não há repetições', () => {
    expect(descreverSerieCurta(3, '', 10)).toBe('3 séries · 10 kg')
  })

  it('some inteira no cardio', () => {
    expect(descreverSerieCurta(0, '', 0)).toBe('')
  })
})

describe('formatarDuracao', () => {
  it('passa a hora quando cruza os sessenta minutos', () => {
    expect(formatarDuracao(3725)).toBe('1h02')
  })

  it('usa minutos e segundos abaixo disso', () => {
    expect(formatarDuracao(125)).toBe('2 min')
    expect(formatarDuracao(45)).toBe('45s')
  })

  it('devolve travessão quando não há duração', () => {
    expect(formatarDuracao(null)).toBe('—')
    expect(formatarDuracao(Number.NaN)).toBe('—')
  })
})

describe('formatarCronometro', () => {
  it('omite a hora enquanto não passa de sessenta minutos', () => {
    expect(formatarCronometro(312)).toBe('05:12')
  })

  it('mostra a hora depois disso', () => {
    expect(formatarCronometro(3912)).toBe('1:05:12')
  })

  it('não desce abaixo de zero', () => {
    expect(formatarCronometro(-10)).toBe('00:00')
  })
})

describe('contar', () => {
  it('concorda o plural', () => {
    expect(contar(1, 'exercício')).toBe('1 exercício')
    expect(contar(3, 'exercício')).toBe('3 exercícios')
    expect(contar(0, 'exercício')).toBe('0 exercícios')
  })

  it('aceita plural irregular', () => {
    expect(contar(2, 'sessão', 'sessões')).toBe('2 sessões')
  })
})

describe('rotularBloco', () => {
  it('junta letra e nome quando há nome', () => {
    expect(rotularBloco('A', 'Peito e Tríceps')).toBe('A — Peito e Tríceps')
  })

  it('cai para "Treino A" sem nome', () => {
    expect(rotularBloco('A', null)).toBe('Treino A')
  })

  it('devolve só "Treino" sem letra', () => {
    expect(rotularBloco(null, 'Peito')).toBe('Treino')
  })
})

describe('primeiroNome', () => {
  it('pega a primeira palavra', () => {
    expect(primeiroNome('  Ana Maria Souza ')).toBe('Ana')
  })
})

describe('iniciais', () => {
  it('usa a primeira e a última palavra', () => {
    expect(iniciais('Ana Maria Souza')).toBe('AS')
  })

  it('usa só uma letra quando o nome é uma palavra', () => {
    expect(iniciais('Ana')).toBe('A')
  })

  it('não quebra com nome vazio', () => {
    expect(iniciais('')).toBe('')
  })
})
```

- [ ] **Passo 2: rodar**

Run: `npm test`
Esperado: todos passando. **Se algum falhar, o teste está errado sobre o comportamento atual — leia
`formato.ts` e corrija o teste, não a implementação.** Esta tarefa documenta o que existe; mudar
comportamento não é o escopo dela.

- [ ] **Passo 3: provar que a suíte pega**

Fazer uma quebra por vez em `src/lib/formato.ts`, rodando `npm test` entre cada uma e desfazendo em
seguida:

| Quebra | Teste que deve ficar vermelho |
|---|---|
| Em `formatarCarga`, remover `|| numero === 0` da condição | "devolve null quando não há carga" |
| Em `descreverSerie`, trocar `if (numeroSerie > 0)` por `if (numeroSerie >= 0)` | "some inteira no cardio" |
| Em `formatarDuracao`, trocar `padStart(2, '0')` por `String(minutos)` | "passa a hora quando cruza os sessenta minutos" |
| Em `contar`, trocar `quantidade === 1` por `quantidade <= 1` | "concorda o plural" |

Esperado, a cada quebra: o teste da direita vermelho, e só ele (ou ele e vizinhos que dependem da
mesma função). Ao desfazer: tudo verde.

- [ ] **Passo 4: commit**

```bash
cd ..
git add frontend/src/lib/formato.test.ts
git commit -F - <<'EOF'
Cobre formato.ts com testes

Quinze funcoes que decidem o que o usuario le — carga, series, duracao,
cronometro — e que ate agora nao tinham rede nenhuma.

Os casos de cardio sao os que mais importam: series 0, repeticoes vazias
e carga 0 precisam sumir da descricao em vez de virar "0 series ·  reps
· 0 kg". Foi por isso que descreverSerie ganhou os cortes que tem.
EOF
```

---

## Tarefa 3: os hooks

**Arquivos:**
- Criar: `frontend/src/lib/useRequisicao.test.tsx`
- Criar: `frontend/src/lib/useCronometro.test.ts`
- Criar: `frontend/src/lib/useDebounce.test.ts`

**Interfaces consumidas:**
- `useRequisicao(buscar, deps)` → `{ dados, carregando, erro, recarregar, definirDados }`
- `useCronometro(inicio: string | null | undefined)` → `number`
- `useDebounce<T>(valor: T, atrasoMs = 300)` → `T`

- [ ] **Passo 1: escrever `useRequisicao.test.tsx`**

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useRequisicao } from './useRequisicao'

describe('useRequisicao', () => {
  it('começa carregando e entrega os dados', async () => {
    const { result } = renderHook(() => useRequisicao(async () => ['a', 'b'], []))

    expect(result.current.carregando).toBe(true)
    expect(result.current.dados).toBeNull()

    await waitFor(() => expect(result.current.carregando).toBe(false))
    expect(result.current.dados).toEqual(['a', 'b'])
    expect(result.current.erro).toBeNull()
  })

  // O motivo do hook existir: antes cada tela fazia try/catch e engolia a
  // falha num console.error, deixando a tela em branco sem explicação.
  it('expõe a falha no estado, em vez de engoli-la', async () => {
    const { result } = renderHook(() =>
      useRequisicao(async () => {
        throw new Error('caiu')
      }, []),
    )

    await waitFor(() => expect(result.current.carregando).toBe(false))
    expect(result.current.erro).toBeTruthy()
    expect(result.current.dados).toBeNull()
  })

  it('recarregar refaz a busca', async () => {
    const buscar = vi.fn().mockResolvedValueOnce('primeiro').mockResolvedValueOnce('segundo')
    const { result } = renderHook(() => useRequisicao(buscar, []))

    await waitFor(() => expect(result.current.dados).toBe('primeiro'))

    await act(async () => {
      await result.current.recarregar()
    })

    expect(result.current.dados).toBe('segundo')
    expect(buscar).toHaveBeenCalledTimes(2)
  })

  it('definirDados altera sem nova requisição', async () => {
    const buscar = vi.fn().mockResolvedValue(['a'])
    const { result } = renderHook(() => useRequisicao(buscar, []))

    await waitFor(() => expect(result.current.dados).toEqual(['a']))

    act(() => {
      result.current.definirDados(['a', 'b'])
    })

    expect(result.current.dados).toEqual(['a', 'b'])
    expect(buscar).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Passo 2: escrever `useCronometro.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCronometro } from './useCronometro'

describe('useCronometro', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-19T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('já começa no tempo decorrido desde o início', () => {
    const { result } = renderHook(() => useCronometro('2026-08-19T11:59:30Z'))
    expect(result.current).toBe(30)
  })

  it('zera quando não há início', () => {
    const { result } = renderHook(() => useCronometro(null))
    expect(result.current).toBe(0)
  })

  // O tempo é sempre derivado do timestamp do servidor. Um contador local
  // atrasaria com a aba em segundo plano, quando o navegador estrangula os
  // timers — e o aluno veria menos tempo do que treinou.
  it('acompanha o relógio, não a quantidade de ticks', () => {
    const { result } = renderHook(() => useCronometro('2026-08-19T12:00:00Z'))
    expect(result.current).toBe(0)

    act(() => {
      // Um único tick de intervalo, mas dez minutos de relógio: é o que
      // acontece quando a aba fica em segundo plano.
      vi.setSystemTime(new Date('2026-08-19T12:10:00Z'))
      vi.advanceTimersByTime(1000)
    })

    expect(result.current).toBe(600)
  })
})
```

- [ ] **Passo 3: escrever `useDebounce.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebounce } from './useDebounce'

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('devolve o valor inicial de imediato', () => {
    const { result } = renderHook(() => useDebounce('a', 300))
    expect(result.current).toBe('a')
  })

  // Sem isso, a busca de alunos dispararia uma requisição por tecla.
  it('deixa passar só o último valor de uma rajada', () => {
    const { result, rerender } = renderHook(({ valor }) => useDebounce(valor, 300), {
      initialProps: { valor: 'a' },
    })

    rerender({ valor: 'an' })
    rerender({ valor: 'ana' })

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('ana')
  })
})
```

- [ ] **Passo 4: rodar**

Run: `npm test`
Esperado: tudo passando, saída limpa.

Se `useRequisicao` logar no console durante o teste de erro, isso é ruído: conferir se
`useRequisicao.ts` faz `console.error`. Ele **não** deve — o hook existe justamente para não
engolir erro no console. Se fizer, é achado, não ajuste de teste: relatar antes de mexer.

- [ ] **Passo 5: provar que os testes pegam**

Uma quebra por vez, rodando e desfazendo:

| Arquivo | Quebra | Teste que deve ficar vermelho |
|---|---|---|
| `useRequisicao.ts` | no `.catch` do `useEffect`, trocar `setErro(...)` por `console.error(e)` | "expõe a falha no estado" |
| `useRequisicao.ts` | trocar `recarregar: carregar` por `recarregar: () => {}` | "recarregar refaz a busca" |
| `useCronometro.ts` | trocar o corpo de `calcular` por `setSegundos((s) => s + 1)` | "acompanha o relógio, não a quantidade de ticks" |
| `useDebounce.ts` | remover o `return () => clearTimeout(id)` | "deixa passar só o último valor de uma rajada" |

- [ ] **Passo 6: commit**

```bash
cd ..
git add frontend/src/lib/useRequisicao.test.tsx frontend/src/lib/useCronometro.test.ts frontend/src/lib/useDebounce.test.ts
git commit -F - <<'EOF'
Cobre os hooks de requisicao, cronometro e debounce

O caso que mais importa em useRequisicao e o erro aparecer no estado: o
hook existe porque antes cada tela engolia a falha num console.error e
deixava a tela em branco sem explicacao.

Em useCronometro o teste avanca o relogio dez minutos com um unico tick
de intervalo — e o que acontece com a aba em segundo plano, quando o
navegador estrangula os timers. Contador local marcaria 1 segundo.
EOF
```

---

## Tarefa 4: `RotaProtegida`

**Arquivos:**
- Criar: `frontend/src/auth/RotaProtegida.test.tsx`

**Interfaces consumidas:** `renderizar`, `PROFESSOR`, `ALUNO` de `../test/utils`.

- [ ] **Passo 1: escrever o teste**

```tsx
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { RotaProtegida } from './RotaProtegida'
import { ALUNO, PROFESSOR, renderizar } from '../test/utils'

const Protegida = ({ cargo }: { cargo: 'professor' | 'aluno' }) => (
  <Routes>
    <Route
      path="/professor"
      element={
        <RotaProtegida cargo={cargo}>
          <p>área do professor</p>
        </RotaProtegida>
      }
    />
    <Route path="/aluno" element={<p>área do aluno</p>} />
    <Route path="/entrar" element={<p>tela de login</p>} />
  </Routes>
)

describe('RotaProtegida', () => {
  it('espera a sessão resolver antes de decidir', () => {
    renderizar(<Protegida cargo="professor" />, {
      rota: '/professor',
      usuario: null,
      carregando: true,
    })

    // Redirecionar durante o carregamento jogaria para o login quem só
    // ainda não teve o token revalidado contra /me.
    expect(screen.queryByText('tela de login')).not.toBeInTheDocument()
    expect(screen.queryByText('área do professor')).not.toBeInTheDocument()
  })

  it('manda para o login quem não está autenticado', () => {
    renderizar(<Protegida cargo="professor" />, { rota: '/professor', usuario: null })
    expect(screen.getByText('tela de login')).toBeInTheDocument()
  })

  it('deixa passar quem tem o perfil', () => {
    renderizar(<Protegida cargo="professor" />, { rota: '/professor', usuario: PROFESSOR })
    expect(screen.getByText('área do professor')).toBeInTheDocument()
  })

  it('desvia para a própria área quem tem o perfil errado', () => {
    renderizar(<Protegida cargo="professor" />, { rota: '/professor', usuario: ALUNO })
    expect(screen.getByText('área do aluno')).toBeInTheDocument()
  })

  // A checagem é pela capacidade, não pelo cargo principal: quem dá aula e
  // também treina precisa alcançar as duas áreas.
  it('deixa passar quem acumula os dois perfis', () => {
    const dosDois = { ...ALUNO, perfis: { aluno: true, professor: true } }
    renderizar(<Protegida cargo="professor" />, { rota: '/professor', usuario: dosDois })
    expect(screen.getByText('área do professor')).toBeInTheDocument()
  })
})
```

- [ ] **Passo 2: rodar**

Run: `npm test`
Esperado: cinco testes novos passando.

- [ ] **Passo 3: provar que pegam**

Uma quebra por vez em `src/auth/RotaProtegida.tsx`:

| Quebra | Teste que deve ficar vermelho |
|---|---|
| Remover o bloco `if (carregando)` | "espera a sessão resolver antes de decidir" |
| Trocar `if (!usuario.perfis[cargo])` por `if (usuario.cargo !== cargo)` | "deixa passar quem acumula os dois perfis" |
| Remover o bloco `if (!usuario)` | "manda para o login quem não está autenticado" |

- [ ] **Passo 4: commit**

```bash
cd ..
git add frontend/src/auth/RotaProtegida.test.tsx
git commit -F - <<'EOF'
Cobre a autorizacao de rota

Dois casos carregam o peso: nao redirecionar enquanto a sessao carrega
(senao quem so esta esperando a revalidacao do token contra /me cai no
login), e deixar passar quem acumula os dois perfis — a checagem e pela
capacidade, nao pelo cargo principal.
EOF
```

---

## Tarefa 5: smoke render das nove páginas

Esta é a tarefa que responde ao bug que motivou tudo: a tela preta com o build passando.

**Arquivos:**
- Criar: `frontend/src/pages/paginas.test.tsx`

**Interfaces consumidas:** `renderizar`, `PROFESSOR`, `ALUNO` de `../test/utils`.

Chamadas de API por página, para montar o mock:

| Página | Chamadas |
|---|---|
| `Login` | nenhuma na montagem |
| `professor/Dashboard` | `/professores/resumo`, `/professores/treino/pedidos` |
| `professor/Alunos` | `/professores/alunos` |
| `professor/Frequencia` | `/professores/aluno/:id/sessoes` (usa `useParams`) |
| `professor/MontarTreino` | `/professores/alunos`, `/professores/exercicios` |
| `professor/Pedidos` | `/professores/treino/pedidos` |
| `aluno/MeuTreino` | `/alunos/meutreino`, `/alunos/treino/sessao`, `/alunos/pedidotreino` |
| `aluno/Historico` | `/alunos/sessoes` |
| `aluno/Perfil` | nenhuma — lê só do contexto |

- [ ] **Passo 1: escrever o teste**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { ALUNO, PROFESSOR, renderizar } from '../test/utils'

// Único ponto de saída HTTP do app — é regra do projeto que nenhuma tela
// monte URL por conta própria, e é o que torna este mock suficiente.
vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  mensagemDeErro: (_erro: unknown, padrao = 'Algo deu errado. Tente de novo.') => padrao,
  registrarExpiracaoDeSessao: vi.fn(),
  tokenArmazenado: { ler: () => null, gravar: vi.fn(), limpar: vi.fn() },
}))

const { api } = await import('../lib/api')
const get = vi.mocked(api.get)

import Login from './Login'
import Dashboard from './professor/Dashboard'
import Alunos from './professor/Alunos'
import Frequencia from './professor/Frequencia'
import MontarTreino from './professor/MontarTreino'
import Pedidos from './professor/Pedidos'
import MeuTreino from './aluno/MeuTreino'
import Historico from './aluno/Historico'
import Perfil from './aluno/Perfil'

/** Resposta vazia que serve para qualquer rota, seja lista ou objeto. */
const VAZIO: Record<string, unknown> = {
  '/professores/resumo': { alunos_ativos: 0, treinos_ativos: 0, pedidos_abertos: 0, inativos: 0 },
  '/alunos/meutreino': { treino: null, blocos: [] },
  '/alunos/treino/sessao': null,
  '/alunos/pedidotreino': null,
}

function responderVazio() {
  get.mockImplementation((url: string) =>
    Promise.resolve({ data: url in VAZIO ? VAZIO[url] : [] } as never),
  )
}

const PAGINAS = [
  { nome: 'Login', elemento: <Login />, usuario: null, titulo: /entre para ver seus treinos/i },
  { nome: 'Dashboard', elemento: <Dashboard />, usuario: PROFESSOR, titulo: /olá/i },
  { nome: 'Alunos', elemento: <Alunos />, usuario: PROFESSOR, titulo: /alunos/i },
  { nome: 'MontarTreino', elemento: <MontarTreino />, usuario: PROFESSOR, titulo: /montar treino/i },
  { nome: 'Pedidos', elemento: <Pedidos />, usuario: PROFESSOR, titulo: /pedidos/i },
  { nome: 'MeuTreino', elemento: <MeuTreino />, usuario: ALUNO, titulo: /treino/i },
  { nome: 'Historico', elemento: <Historico />, usuario: ALUNO, titulo: /histórico/i },
  { nome: 'Perfil', elemento: <Perfil />, usuario: ALUNO, titulo: /perfil/i },
]

describe('smoke render das páginas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    responderVazio()
  })

  // O bug que motivou esta suíte: trocar de área deixava a tela preta, e o
  // build passava. Nada renderizava componente para acusar.
  it.each(PAGINAS)('$nome monta sem quebrar', async ({ elemento, usuario, titulo }) => {
    renderizar(elemento, { usuario })
    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })

  // Frequencia lê o id da URL, então precisa do padrão de rota casando.
  it('Frequencia monta sem quebrar', async () => {
    renderizar(<Frequencia />, {
      usuario: PROFESSOR,
      rota: '/professor/alunos/2/frequencia',
      caminho: '/professor/alunos/:id/frequencia',
    })
    expect(await screen.findByText(/frequência/i)).toBeInTheDocument()
  })
})

describe('falha de requisição', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Antes de useRequisicao, a falha ia para o console e a tela ficava em
  // branco. Esta é a asserção que garante que isso não volta.
  it.each([
    { nome: 'Alunos', elemento: <Alunos />, usuario: PROFESSOR },
    { nome: 'Pedidos', elemento: <Pedidos />, usuario: PROFESSOR },
    { nome: 'Historico', elemento: <Historico />, usuario: ALUNO },
  ])('$nome mostra o erro em vez de tela em branco', async ({ elemento, usuario }) => {
    get.mockRejectedValue(new Error('rede caiu'))

    const { container } = renderizar(elemento, { usuario })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(container.textContent?.trim()).not.toBe('')
  })
})
```

- [ ] **Passo 2: rodar e ajustar os seletores**

Run: `npm test`

Os textos das expressões regulares acima são o palpite mais provável, mas **precisam bater com o que
cada página realmente renderiza**. Se algum falhar, abrir a página e usar o título real do `<h1>` —
não afrouxar a regex para `/./`, que passaria com qualquer coisa e não provaria nada.

Duas armadilhas conhecidas:
- `Alunos` e `Pedidos` renderizam o título e a lista; a regex do título pode casar com mais de um
  elemento. Nesse caso, usar `screen.getByRole('heading', { name: /alunos/i })`.
- `MeuTreino` monta três requisições; o `findByText` já espera, mas se aparecer aviso de `act()`,
  trocar por `await waitFor(...)`.

- [ ] **Passo 3: confirmar que o teste de falha realmente exige o aviso**

Trocar, em `src/pages/professor/Alunos.tsx`, a linha que renderiza o erro
(`{alunos.erro && <Aviso tipo="erro">{alunos.erro}</Aviso>}`) por `{null}`.

Run: `npm test`
Esperado: "Alunos mostra o erro em vez de tela em branco" fica **vermelho**.

Desfazer e confirmar o verde.

- [ ] **Passo 4: confirmar que o smoke realmente pega tela quebrada**

Em `src/pages/professor/Dashboard.tsx`, logo no início do componente, inserir:

```tsx
  throw new Error('quebra proposital')
```

Run: `npm test`
Esperado: "Dashboard monta sem quebrar" fica **vermelho**. É a simulação exata da tela preta.

Remover a linha e confirmar o verde.

- [ ] **Passo 5: conferir a saída**

Run: `npm test`
Esperado: nenhum `console.error`, nenhum aviso de `act()`, nenhum "not wrapped in act". Saída suja é
falha — se aparecer, corrigir antes de commitar.

- [ ] **Passo 6: commit**

```bash
cd ..
git add frontend/src/pages/paginas.test.tsx
git commit -F - <<'EOF'
Cobre o render das nove paginas

E a resposta ao bug que motivou a suite: trocar de area deixava a tela
preta e o build passava, porque nada renderizava componente.

Alem do smoke, tres paginas verificam que a falha de requisicao vira
aviso na tela em vez de tela em branco — era assim que se comportava
antes do useRequisicao, e o teste existe para isso nao voltar.
EOF
```

---

## Tarefa 6: documentação

**Arquivos:**
- Modificar: `frontend/README.md` (criar, se não existir)
- Modificar: `ROADMAP.md`
- Modificar: `CLAUDE.md` (local, **não** commitar)

- [ ] **Passo 1: acrescentar a seção de testes ao `frontend/README.md`**

O arquivo já existe. Acrescentar a seção abaixo, depois da seção de comandos.

```markdown
## Testes

```bash
npm test          # roda uma vez
npm run test:watch
```

Vitest com jsdom e Testing Library, sobre o mesmo `vite.config.ts` do build. Os testes ficam ao lado
do código (`formato.ts` → `formato.test.ts`).

A API é substituída por `vi.mock` em `src/lib/api.ts`, que é o único ponto de saída HTTP do app.
**Consequência:** os interceptors de token e de 401 não são exercitados por esta suíte.

`src/test/utils.tsx` traz `renderizar(ui, { rota, caminho, usuario, carregando })`, que embrulha em
`MemoryRouter` e injeta o `AuthContext` já resolvido — sem isso todo teste esperaria a chamada a
`/me` do `AuthProvider`.

Como o código de produção já existia quando a suíte nasceu, todo teste aqui passou de primeira. Cada
um foi validado quebrando de propósito a linha que protege e confirmando o vermelho. Ao mexer nesses
testes, repita o procedimento — teste que nunca falhou não prova nada.
```

- [ ] **Passo 2: atualizar o `ROADMAP.md`**

Trocar o item de testes de frontend na seção 5, de `- [ ]` para `- [x]`, com o texto:

```markdown
- [x] **Testes de frontend** — Vitest + Testing Library, cobrindo `formato.ts`,
      os hooks, a autorização de rota e o render das nove páginas. Foi a tela
      preta que motivou: build passava e nada renderizava componente
```

Acrescentar, na mesma seção 5, o item que o mock deixou aberto:

```markdown
- [ ] **Testar os interceptors de `api.ts`** — token no cabeçalho e 401
      derrubando a sessão. A suíte de front mocka `src/lib/api.ts` inteiro,
      então justamente esses dois ficam de fora. Exige MSW ou teste do módulo
      sem o mock
```

Atualizar a contagem de testes onde ela aparecer no arquivo, para o número real que `npm test` (nos
dois pacotes) reportar ao fim.

- [ ] **Passo 3: atualizar o `CLAUDE.md`** (arquivo local, não vai para o commit)

Na seção de arquitetura do frontend, acrescentar:

```markdown
**Testes do front**: Vitest + Testing Library, ao lado do código. `npm test` no `frontend/`.
`src/test/utils.tsx` tem o `renderizar()` que injeta o `AuthContext` pronto. A API é mockada em
`src/lib/api.ts` — por isso os interceptors de token e 401 **não** têm cobertura.
```

- [ ] **Passo 4: verificação final dos dois pacotes**

```bash
cd backend && npm test
cd ../frontend && npm test && npm run lint && npm run build
```

Esperado: os quatro passando, saída limpa.

- [ ] **Passo 5: commit**

```bash
cd ..
git add frontend/README.md ROADMAP.md
git commit -F - <<'EOF'
Documenta a suite de testes do frontend

Registra tambem o que ficou de fora e por que: mockar src/lib/api.ts
inteiro deixa os interceptors de token e de 401 sem cobertura. Vira item
proprio no roadmap em vez de passar por coberto.
EOF
```

---

## Autorrevisão do plano

**Cobertura da spec:**

| Requisito da spec | Tarefa |
|---|---|
| Vitest sobre o `vite.config.ts` | 1 |
| Scripts `test` e `test:watch` | 1 |
| Teste ao lado do código | 1 (estrutura), aplicado em 2–5 |
| `vi.mock` sobre `src/lib/api.ts` | 5 |
| Helper `renderizar` e fixtures | 1 |
| `setup.ts` com jest-dom e cleanup | 1 |
| `formato.test.ts` — quinze funções | 2 |
| `useRequisicao`, `useCronometro`, `useDebounce` | 3 |
| `RotaProtegida` — quatro caminhos + perfil duplo | 4 |
| Smoke das nove páginas + erro na tela | 5 |
| Interceptors registrados como não cobertos | 6 |
| Procedimento de provar teste quebrando produção | restrições globais + passo próprio em 1–5 |
| Risco do Vite: fixar vitest em vez de atualizar | restrições globais + passo 2 da tarefa 1 |
| Critério de pronto (`test`, `lint`, `build`) | 1 (passo 10) e 6 (passo 4) |

Sem lacunas.

**Consistência de nomes:** `renderizar`, `PROFESSOR` e `ALUNO` são definidos na Tarefa 1 com a
assinatura exata usada nas Tarefas 4 e 5. `definirDados` e `recarregar` batem com o que
`useRequisicao.ts` exporta hoje.

**Ponto frágil, assumido:** os textos que a Tarefa 5 procura na tela (`/olá/i`, `/histórico/i`…)
são palpite a partir do código. O passo 2 da tarefa manda ajustá-los ao que a página renderiza de
fato, e proíbe afrouxar a regex para fazer passar.
