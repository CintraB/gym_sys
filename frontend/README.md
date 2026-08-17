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
npm run build     # verificação de tipos + build de produção
npm run preview   # serve o build (é onde o service worker funciona)
npm run lint      # ESLint
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
do `localStorage`. Só o token é persistido, e um 401 derruba a sessão.

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
```

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

## Ainda não existe

Testes. Toda a suíte do projeto é de backend, e foi por isso que um erro de
importação derrubou a tela do aluno sem ninguém perceber. Vitest + Testing
Library é o próximo passo — está no [ROADMAP](../ROADMAP.md).

## Tecnologias

React 18 · TypeScript · Vite 5 · Tailwind CSS v4 · React Router 6 · Axios ·
lucide-react · vite-plugin-pwa
