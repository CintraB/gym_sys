# Gym Sys - Frontend

Interface web do Gym Sys, feita para o celular e igualmente utilizável no
navegador do computador.

Faz parte do monorepo [gym_sys](https://github.com/CintraB/gym_sys).

## Instalação

```plaintext
cd frontend
npm install
npm run dev
```

Disponível em `http://localhost:5173`. O Vite sobe com `host: true`, então o
terminal também mostra um endereço de rede (`http://192.168.x.x:5173`) — é por
ele que você abre o app no celular.

## Configuração

Sem `.env`, o endereço da API é derivado do host de onde a página foi aberta:
abrindo em `localhost:5173`, a API é `localhost:8080`; abrindo pelo IP da rede,
a API é o mesmo IP na porta 8080. Isso faz o celular funcionar sem configurar
nada e sem depender de um IP fixo que muda quando o DHCP renova.

Para apontar para outro lugar, crie `frontend/.env`:

```plaintext
VITE_API_URL=/api
```

É o valor usado em produção, com o proxy reverso servindo front e API na mesma
origem. Nenhuma URL de API é escrita direto nos componentes — tudo passa por
`src/lib/api.ts`.

## Scripts

```plaintext
npm run dev       # desenvolvimento
npm run build     # verificação de tipos + build de produção (web)
npm run build:standalone  # o app com o backend dentro (seção 6 do roadmap)
npm run preview   # serve o build (é onde o service worker funciona)
npm run lint      # ESLint
npm test          # Vitest, roda uma vez
npm run test:watch
```

## Telas

**Professor**

- Painel com alunos ativos, treinos ativos e pedidos em aberto
- Alunos: busca por nome ou CPF, cadastro, desativação e reativação, além de
  "treinou há X" em cada linha
- Frequência por aluno: sessões dos últimos 30 dias, média de duração e última
- Montar treino: blocos em abas, com nome opcional; mostra o treino atual do
  aluno antes de substituí-lo
- Pedidos: observação do aluno e atalho direto para montar o treino

**Aluno**

- Treino do dia em abas por bloco, agrupado por grupo muscular, com o bloco
  sugerido já aberto
- Execução com cronômetro fixo no topo, marcação por exercício e resumo ao
  finalizar
- Histórico de treinos executados, com detalhe do que foi feito em cada um
- Pedido de treino novo com observação

Quem tem os dois perfis vê um atalho para alternar entre as áreas.

## Detalhes que valem saber

**Sessão** é reidratada contra `GET /me` na carga, em vez de confiar num objeto
do `localStorage`. Só o token é persistido, e um 401 derruba a sessão — menos
nas rotas de `ROTAS_COM_401_DE_FORMULARIO`, em `lib/api.ts`. Hoje só
`PUT /me/senha` está lá: o 401 dela é "a senha atual está errada", e tratá-lo
como sessão morta mandava para o login quem apenas errou a digitação.

**Marcações são otimistas**: a caixa responde na hora e a requisição segue
atrás, desfazendo se o servidor recusar. Numa academia a rede oscila, e esperar
o servidor a cada toque trava a mão.

**O cronômetro é derivado do timestamp do servidor**, não acumulado localmente.
Fechar o app, bloquear a tela ou trocar de aparelho não atrasa nem adianta o
tempo — quem grava a duração final é o servidor.

**Estados de tela** vêm do hook `useRequisicao`, que entrega carregando, erro e
dados. Toda listagem trata os três casos mais o vazio.

## Instalar no celular

O app tem manifesto e service worker: instala na tela inicial e abre sem rede,
servindo o último treino carregado.

No iPhone, Safari → Compartilhar → "Adicionar à Tela de Início", funciona hoje.
No Android, a instalação completa exige HTTPS — o service worker só é registrado
em contexto seguro. Veja [`deploy/`](../deploy/README.md).

## Estrutura

```plaintext
src/
├── lib/          api (axios + interceptors), formatação, hooks utilitários
├── auth/         contexto de sessão, provider, rota protegida
├── components/
│   ├── ui/       Botao, Campo, Cartao, Selo, Painel, Abas, Confirmacao...
│   ├── AppShell  barra inferior no celular, coluna lateral no desktop
│   └── TrocarArea  alterna professor ↔ aluno para quem tem os dois perfis
└── pages/
    ├── professor/
    └── aluno/

src/local/        o núcleo do app standalone (não entra no build web)
├── senha.js      scrypt em JS puro, no lugar do node:crypto
├── ambiente.js   configuração fixa, no lugar do dotenv
├── banco.js      fachada de banco sem driver embutido
├── rotas.js      a tabela de rotas, espelhando backend/src/routes/
├── roteador.js   método + caminho → controller, no lugar do Express
└── adaptadorAxios.js  entrega ao roteador em vez de à rede
```

## O app com o backend dentro

`npm run build:standalone` gera o aplicativo que roda **sem servidor**, com o núcleo do backend e o
banco embutidos — é a seção 6 do roadmap, desenhada em
`docs/superpowers/specs/2026-08-22-app-android-standalone-design.md`.

O ponto central: **nenhuma tela muda, e nenhum controller do backend muda.** Uma chamada sai de uma
tela, entra no `src/lib/api.ts` como sempre, e ali o *adapter* do axios — em vez de emitir HTTP —
entrega método, caminho e corpo ao roteador de `src/local/`, que chama o mesmo controller que roda no
servidor. Os interceptors de token e de 401 continuam valendo, inclusive a expulsão de sessão por
troca de senha ou de CPF.

Três arquivos do backend não atravessam para o browser, e são trocados no build pelo `resolve.alias`
do `vite.config.ts`:

| Do backend | Por que não atravessa | Borda |
|---|---|---|
| `lib/senha.js` | scrypt do `node:crypto` | `local/senha.js`, com `scrypt-js` |
| `config/env.js` | `dotenv` puxa `fs` e `path` | `local/ambiente.js`, configuração fixa |
| `config/db.js` | `import pg` arrasta `net` | `local/banco.js`, sem driver embutido |

O hash tem de bater com o do servidor, senão a conta criada num não entra no outro. Os parâmetros do
scrypt são os padrões do Node (N=16384, r=8, p=1) e **o sal entra como texto da string hex**, não como
os bytes que ela representa. Trocar isso não dá erro: gera hash válida e diferente. Dois testes de ida
e volta em `src/local/senha.test.js` são o que protege — e são insubstituíveis, porque com o parâmetro
errado os testes internos da borda continuam passando, coerentes consigo mesmos.

Medido: o `scrypt-js` leva ~133 ms por operação num PC, contra ~27 ms do nativo. Num celular três
vezes mais lento, o login fica em torno de meio segundo.

**Ao acrescentar rota no backend, acrescente em `src/local/rotas.js`.** Um teste confere a tabela
contra os arquivos de `backend/src/routes/` nos dois sentidos; sem ele, a rota nova só apareceria como
404 dentro do APK, descoberta em campo.

Os testes de `src/local/` declaram ambiente `node`, e não jsdom: aquilo é código de servidor rodando
dentro do cliente, e no jsdom o `jose` recusa a chave que o `TextEncoder` produz — `instanceof
Uint8Array` falha entre os realms.

O `build:standalone` termina rodando `scripts/verificarBundleDoApp.mjs`, que falha se o núcleo não
estiver no bundle ou se `dotenv`, `node:crypto` ou `pg` tiverem vazado. As duas coisas já aconteceram
em silêncio durante o desenvolvimento, com o build passando e o bundle do mesmo tamanho do web.

### Gerar e instalar o APK

> **Depois de instalar, a primeira coisa a fazer é trocar a senha.** A conta com que o app nasce é
> pública — está neste repositório e dentro do APK. A tela é Perfil → Trocar minha senha.
>
> Conta inicial: CPF `000.000.000-00`, senha `gymsys123`, com os três perfis (admin, professor e
> aluno). Os dois alunos de exemplo entram com senha `treino123`.

**Semente local, para não recadastrar a cada build.** `SEMENTE_PUBLICA`, em `src/local/semear.js`,
é o que vai no repositório. Se existir um `src/local/sementeLocal.js` exportando `SEMENTE` no mesmo
formato — conta, alunos e blocos —, o build usa essa no lugar, e o APK daquela máquina nasce com a
conta e o treino de verdade. O arquivo fica **fora do versionamento** (`.git/info/exclude`), então
o dado pessoal não atravessa para o GitHub e quem clona o repositório continua recebendo a conta
pública. `import.meta.glob` é o que permite isso: resolve no build e devolve vazio quando o arquivo
não existe, onde um `import` direto quebraria a compilação.

Cada linha de exercício aceita a forma curta (só o nome) ou a completa —
`{ nome, tipo, series, repeticoes, carga, observacao }`. O `tipo` importa quando o nome se repete no
catálogo: `CROSS OVER` existe em BÍCEPS e em TRÍCEPS, e sem ele viria o primeiro dos dois. Nome que
não está no catálogo faz o seed **estourar na abertura** — o app não abre —, então vale testar a
semente antes de gerar o APK.

```bash
cd frontend && npm run apk
```

Isso roda o `build:standalone`, sincroniza o projeto Android e chama o Gradle. Sai em
`android/app/build/outputs/apk/debug/app-debug.apk`, com cerca de 13 MB.

### O logo, e os três arquivos que saem dele

A arte é `public/logoapp.png`, quadrada, com o halter em cima e o nome embaixo. Dela saem, por
script, as imagens que a interface e o Android usam de fato — nenhuma delas é editada à mão:

```bash
powershell -File scripts/gerarSimboloDoLogo.ps1   # public/logo-simbolo{,-claro}.png
powershell -File scripts/gerarIconeFonte.ps1      # assets/icon*.png
npx capacitor-assets generate --android           # os mipmaps, a partir de assets/
```

O motivo dos dois primeiros é o mesmo: **o conteúdo ocupa ~40% do canvas, o resto é margem branca.**

- `gerarSimboloDoLogo.ps1` recorta **só o halter** — o nome do sistema já aparece escrito ao lado, no
  cabeçalho — e deixa o fundo transparente. Gera duas versões, porque o halter é preto e sumiria no
  tema escuro: a clara troca apenas os tons neutros e preserva o laranja. O CSS escolhe entre elas
  pela variável `--logo-simbolo`, redefinida nos mesmos três estados de tema da paleta, e a classe
  `.logo-simbolo` a aplica como `background-image`. Duas `<img>` escondidas por media query também
  funcionariam, mas a escondida seria baixada do mesmo jeito.
- `gerarIconeFonte.ps1` recorta a margem e redesenha em três arquivos para o `capacitor-assets`: 80%
  do canvas no ícone legado, que não tem máscara, e 60% na camada de frente do adaptativo, porque
  acima disso a máscara do Android corta as pontas.

Trocou a arte? Rode os três comandos acima, nessa ordem, e gere o APK.

**Duas coisas que o `scripts/apk.mjs` resolve, e que valem saber:**

O `JAVA_HOME` e o `ANDROID_HOME` não estão definidos nesta máquina, e o script os descobre. Mais
importante: ele **procura um JDK 21 e evita o JDK embutido no Android Studio**, que é o 25. O Gradle
8.14 com AGP 8.13 — as versões que o Capacitor gera — vão até o Java 24, e com o 25 a falha é um
`Unsupported class file major version 69`, que não diz o que fazer. Se um dia o Capacitor subir para
um Gradle 9, o `jbr` do Studio volta a servir.

Subir o Gradle para 9 **não** era a saída: o AGP 8.13 não suporta Gradle 9, então seria trocar um
erro conhecido por um desconhecido.

**Instalar no emulador:**

Sem `cmdline-tools` na máquina, criar o dispositivo é pela interface do Studio: *More Actions →
Virtual Device Manager → Create Virtual Device*, um Pixel com imagem API 35 ou 36 (x86_64, Google
APIs). Depois:

```bash
"$LOCALAPPDATA/Android/Sdk/emulator/emulator" -list-avds
"$LOCALAPPDATA/Android/Sdk/emulator/emulator" -avd <nome> &
"$LOCALAPPDATA/Android/Sdk/platform-tools/adb" wait-for-device
"$LOCALAPPDATA/Android/Sdk/platform-tools/adb" install -r frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

Para ver o que o app registra:

```bash
"$LOCALAPPDATA/Android/Sdk/platform-tools/adb" logcat -s Capacitor Capacitor/Console chromium
```

**O que verificar, e nesta ordem** — com o Wi-Fi do aparelho **desligado**, porque offline é o ponto:

1. Entrar com a conta inicial
2. Na área do professor, a lista mostra os dois alunos de exemplo
3. O treino da Ana tem os blocos A e B
4. Na área do aluno: iniciar o treino, marcar um exercício, finalizar
5. **Fechar o aplicativo de verdade** — arrastar para fora dos recentes, não só minimizar
6. Abrir de novo e conferir que o histórico mostra a sessão

O passo 6 é o objetivo da seção 6 inteira. Histórico vazio ali significa que o banco não persistiu.

**Verificado no emulador** (Pixel 6, Android 16 / API 36), com o aparelho em **modo avião**: o APK
instala, abre offline, faz login com a conta do seed, mostra os alunos de exemplo e o treino de dois
blocos, executa o bloco A marcando os dois exercícios, e registra a sessão de 58 s. Depois de
`am force-stop` e reabertura, o histórico mostra a sessão, e a sugestão de bloco passou a apontar o
**B** — lida do banco recém-gravado. A sessão do usuário também sobreviveu, porque o token fica no
armazenamento do WebView.

O login leva alguns segundos no emulador (scrypt + consulta + render). É perceptível, e o emulador
não representa bem um celular modesto: medir no aparelho de verdade antes de decidir baixar o custo
do scrypt.

**Três bugs só apareceram no aparelho**, e todos viraram teste:

1. **O driver não chamava o tradutor de dialeto.** Ele convertia `?1` para `?`, mas quem *gera* o
   `?1` é o tradutor — o SQL chegava ao SQLite em dialeto PostgreSQL e o app morria na primeira
   consulta com `unrecognized token: ":"`. Vale para o `aplicarSql` também: sem traduzir o
   `schema.sql`, nenhuma tabela é criada. Os testes não pegavam porque entravam com `?1` pronto,
   presumindo uma tradução que ninguém fazia.
2. **O adapter concatenava a `baseURL` no caminho.** O `api.ts` monta `https://localhost:8080`, então
   o roteador recebia `https://localhost:8080/login` e respondia 404. O teste usava `baseURL` vazia.
3. **`RETURNING` não volta pelo `run`.** O plugin responde `values: []` mesmo com `returnMode: 'all'`
   — devolve `lastId`, mas não as linhas. Passou a ir por `query`, que lê o cursor. O seed morria no
   primeiro dos 16 `RETURNING` do projeto.




## Design

Tema em três estados — sistema, claro e escuro — com os tokens no bloco
`@theme` de `src/index.css`. Não há arquivo `tailwind.config`.

O acento tem três tokens em vez de um: `--color-acento` para preenchimento,
`--color-acento-texto` para texto e ícones sobre o fundo, e
`--color-sobre-acento` para texto por cima do preenchimento. O verde-limão é
vivo demais para servir de texto sobre fundo claro.

Layout pensado primeiro para o polegar: navegação na barra inferior,
formulários em folha deslizante, alvos de toque grandes e campos com fonte de
16px para o iOS não dar zoom sozinho.

Diálogos de confirmação são do app, não do navegador — centralizados, no tema,
e com o foco começando no "Cancelar" quando a ação é destrutiva.

## Área de administração

`/admin` é a terceira área, ao lado de professor e aluno, e só abre para quem tem a flag `admin`.
Traz a listagem de todos os usuários do sistema — o professor só enxerga alunos — com filtro por
perfil e status, e a redefinição de senha de quem esqueceu.

A troca da própria senha fica no Perfil, e vale para os três perfis.

`src/auth/areas.ts` é a fonte única de qual rota pertence a cada cargo, de como cada área se chama
e de como descrever os perfis de alguém. Antes isso estava repetido em cinco lugares como
`cargo === 'professor' ? '/professor' : '/aluno'`, e quando o admin entrou todos mandaram o admin
para a área do aluno — o "senão" do ternário engolia o perfil novo em silêncio.

## Testes

Vitest com jsdom e Testing Library, sobre o mesmo `vite.config.ts` do build. Os
testes ficam ao lado do código (`formato.ts` → `formato.test.ts`), e cobrem as
funções de formatação, os hooks, a autorização de rota e o render das nove telas.

O smoke das telas é a resposta ao erro de importação que derrubou a tela do
aluno sem ninguém perceber: o build passava porque nada renderizava componente.

A API é substituída por `vi.mock` em `src/lib/api.ts`, que é o único ponto de
saída HTTP do app. **Consequência:** as telas não exercitam os interceptors de
token e de 401 — quem faz isso é `src/lib/api.test.ts`, que usa o `api` de
verdade e troca só a rede, por um adapter falso. Foi essa lacuna que deixou o
bug do 401 na troca de senha chegar ao aparelho.

`src/test/utils.tsx` traz `renderizar(ui, { rota, caminho, usuario, carregando })`,
que embrulha em `MemoryRouter` e injeta o `AuthContext` já resolvido — sem isso
todo teste esperaria a chamada a `/me` do `AuthProvider`.

`src/test/setup.ts` tem dois remendos de ambiente, os dois com causa fora do
app: o Node 25 expõe um `localStorage` nativo que sobrescreve o do jsdom e vem
sem `getItem`, e o jsdom não implementa `matchMedia`. Sem eles, qualquer tela
com o `SeletorTema` dentro quebra no teste.

Como o código já existia quando a suíte nasceu, todo teste aqui passou de
primeira. Cada um foi validado quebrando de propósito a linha que protege e
confirmando o vermelho — foi assim que se descobriu que o primeiro teste de
`useDebounce` não pegava a remoção do `clearTimeout`. Ao mexer nesses testes,
repita o procedimento: teste que nunca falhou não prova nada.

## Ainda não existe

Interações de formulário ponta a ponta — montar treino, login com erro, o modal
de novo exercício. A suíte atual garante que as telas montam e que a falha de
rede vira aviso, não que o fluxo inteiro funciona.

## Tecnologias

React 18 · TypeScript · Vite 5 · Tailwind CSS v4 · React Router 6 · Axios ·
lucide-react · vite-plugin-pwa
