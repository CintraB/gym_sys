# Testes de frontend — design

**Data:** 19 de agosto de 2026
**Item do roadmap:** seção 5, "Testes de frontend"

## Problema

O backend tem 127 testes. O frontend não tem nenhum.

O sintoma já apareceu: ao trocar de área, a tela ficou preta com o build passando.
Nenhum teste renderiza componente, então um erro de renderização só é descoberto
abrindo o navegador — e só na tela que por acaso foi aberta.

Além disso, `src/lib/formato.ts` concentra quinze funções que decidem o que o
usuário lê (carga, duração, séries, cronômetro). São puras e hoje não têm rede.

## Objetivo

Uma primeira suíte que:

1. Pegue erro de renderização em qualquer página, que é o bug que já ocorreu.
2. Cubra a lógica de exibição e os hooks, que são baratos de testar.
3. Estabeleça as convenções que os testes seguintes vão seguir.

Não é meta atingir uma porcentagem de cobertura.

## Decisões

### Ferramentas

`vitest`, `@testing-library/react`, `@testing-library/user-event`,
`@testing-library/jest-dom`, `jsdom`.

Vitest reaproveita o `vite.config.ts` que já existe: alias, plugin do React e
Tailwind vêm juntos, sem um segundo pipeline de build para manter em sincronia
com o primeiro.

Scripts no `frontend/package.json`:

- `npm test` — roda uma vez e sai, igual ao backend
- `npm run test:watch` — modo interativo

O backend usa `npm test` para `node --test`. Manter o mesmo verbo nos dois
pacotes evita ter de lembrar qual é qual.

### Onde os testes ficam

Ao lado do código: `formato.ts` → `formato.test.ts`.

Não numa pasta `test/` espelhada — ali, mover um arquivo deixa o teste órfão sem
que nada acuse. O backend usa `test/` por outro motivo: lá os testes são de API e
se dividem por assunto (segurança, sessão, blocos), não por arquivo de origem.

### Como a API é simulada

`vi.mock` sobre `src/lib/api.ts`.

Toda chamada do app passa por esse módulo — é regra do projeto, não coincidência.
Isso o torna um ponto único de interceptação, sem dependência nova e sem custo de
rede no teste.

**Consequência aceita:** os interceptors de token e de 401 ficam sem cobertura,
porque o módulo que os contém é justamente o que foi substituído. Isso entra no
roadmap como item próprio; não será tratado como coberto.

MSW foi considerado e descartado por ora: seria mais fiel, mas custa dependência,
setup maior e testes mais lentos para um ganho que só aparece quando os
interceptors entrarem no escopo.

### Helper de renderização

`src/test/utils.tsx` expõe:

- `renderizar(ui, { rota, usuario })` — embrulha em `MemoryRouter` e num
  `AuthContext.Provider` com o usuário já resolvido. Injetar o contexto direto,
  em vez de usar o `AuthProvider` real, evita que todo teste tenha de esperar a
  requisição a `/me`.
- Fixtures `PROFESSOR`, `ALUNO`, `TREINO`, reaproveitadas entre arquivos.

`src/test/setup.ts` registra os matchers do `jest-dom` e o `cleanup` entre testes.

## Cobertura planejada

| Arquivo | O que cobre |
|---|---|
| `src/lib/formato.test.ts` | as quinze funções puras: máscaras de CPF e título, `formatarCarga`, `descreverSerie` e `descreverSerieCurta`, `formatarDuracao`, `formatarCronometro`, `contar`, `rotularBloco`, `primeiroNome`, `iniciais`, `tempoRelativo` |
| `src/lib/useRequisicao.test.tsx` | os três estados; `recarregar` refaz a busca; `definirDados` altera sem nova requisição; **o erro aparece no estado, não só no console** |
| `src/lib/useCronometro.test.ts` | deriva de `inicio` e não acumula localmente; zera quando `inicio` é nulo; usa timers falsos |
| `src/lib/useDebounce.test.ts` | só o último valor de uma rajada atravessa |
| `src/auth/RotaProtegida.test.tsx` | mostra carregando; sem usuário redireciona para `/entrar` guardando a origem; perfil errado redireciona para a área certa; **quem é professor e também aluno alcança as duas áreas** |
| `src/pages/paginas.test.tsx` | smoke render das nove páginas (Login, Dashboard, Alunos, Frequencia, MontarTreino, Pedidos, MeuTreino, Historico, Perfil) com a API mockada: monta sem erro; mostra o estado de carregando; mostra o vazio quando a lista volta vazia; **mostra a mensagem de erro em vez de tela em branco quando a requisição falha** |

O último caso é o que teria pego a tela preta.

## Fora de escopo

- **Interceptors de token e 401** — consequência direta do mock escolhido. Vai
  para o roadmap.
- **Componentes de `ui/` isoladamente** — são exercitados pelo uso nas páginas;
  testá-los um a um agora dobraria o trabalho de manutenção a cada ajuste de
  layout, com pouco ganho.
- **Fluxos completos de formulário** (montar treino ponta a ponta, login com
  erro, modal de novo exercício) — próxima leva, depois que a base estiver de pé.
- **CSS e Tailwind** — jsdom não aplica folha de estilo, então "elemento
  invisível por CSS" não é detectável aqui. Um teste que afirmasse isso estaria
  mentindo.

## Risco conhecido

`vitest` traz a própria dependência de Vite. Se conflitar com o Vite 5 do
projeto, a saída é fixar a versão de vitest compatível — não atualizar o Vite por
causa de teste. Atualizar o bundler é mudança de outra natureza, com risco
próprio, e não pertence a esta tarefa.

## Como provar que um teste presta, aqui

O ciclo normal é escrever o teste, vê-lo falhar, e só então implementar. Aqui a
implementação já existe: todo teste escrito contra ela **passa de primeira**, e
um teste que nunca falhou não provou nada — pode estar afirmando a coisa errada,
ou coisa nenhuma.

Então o método é outro, e vale para cada teste desta suíte:

1. Escrever o teste e vê-lo passar.
2. **Quebrar de propósito** a linha de produção que ele deveria proteger.
3. Confirmar que o teste fica vermelho — e pelo motivo certo.
4. Desfazer a quebra.

Se o teste continua verde com a implementação quebrada, ele não serve e é
reescrito. É o mesmo procedimento usado para validar os testes de IDOR do `PUT`
de treino.

## Critério de pronto

- `npm test` no `frontend/` passa, com saída limpa
- `npm run lint` continua passando, com os arquivos de teste incluídos
- `npm run build` continua passando — os tipos de teste não vazam para o bundle
- Cada teste foi provado pelo procedimento acima, não apenas escrito
- `README.md` e `ROADMAP.md` refletem a suíte nova e o item que ficou aberto
