# Gym Sys - Frontend

Interface web do Gym Sys, feita para o celular e igualmente utilizável no navegador do computador.

Faz parte do monorepo [gym_sys](https://github.com/CintraB/gym_sys).

## Instalação

```plaintext
cd frontend
npm install
cp .env.example .env
npm run dev
```

Disponível em `http://localhost:5173`. O Vite sobe com `host: true`, então o terminal também mostra
um endereço de rede (`http://192.168.x.x:5173`) — é por ele que você abre o app no celular enquanto
desenvolve.

## Configuração

`frontend/.env`:

```plaintext
VITE_API_URL=http://localhost:8080
```

Apontando para o PC servidor de casa, troque pelo IP dele (`http://192.168.0.10:8080`). Nenhuma URL
de API é escrita direto nos componentes — tudo passa por `src/lib/api.ts`.

## Scripts

```plaintext
npm run dev       # desenvolvimento
npm run build     # verificação de tipos + build de produção
npm run preview   # serve o build
npm run lint      # ESLint
```

## Funcionalidades

**Professor**

- Painel com alunos ativos, treinos ativos e pedidos em aberto.
- Alunos: busca por nome ou CPF, cadastro, desativação e reativação.
- Montar treino: mostra o treino atual do aluno antes de substituí-lo; exercícios agrupados por
  grupo muscular.
- Pedidos: observação do aluno e atalho direto para montar o treino.

**Aluno**

- Treino atual agrupado por grupo muscular, com séries, repetições, carga e observações.
- Marcação de exercícios concluídos, com barra de progresso. É local do aparelho e zera todo dia —
  serve para não se perder no meio do treino.
- Histórico de treinos anteriores.
- Pedido de treino novo com observação para o professor.

## Instalar no celular

O app tem manifest e pode ser instalado na tela inicial: abra o endereço no navegador do celular e
use "Adicionar à tela de início" (Android) ou compartilhar → "Adicionar à Tela de Início" (iOS).
Ele abre em tela cheia, sem barra do navegador.

## Estrutura

```plaintext
src/
├── lib/          api (axios + interceptors), formatação, hooks utilitários
├── auth/         contexto de sessão, provider, rota protegida
├── components/
│   ├── ui/       Botao, Campo, Cartao, Selo, Painel, Aviso, Vazio, Carregando
│   └── AppShell  barra inferior no celular, coluna lateral no desktop
└── pages/
    ├── professor/
    └── aluno/
```

## Design

Tema escuro único, acento em verde-limão. Os tokens de cor ficam no bloco `@theme` de
`src/index.css` e viram utilitários do Tailwind (`bg-superficie`, `text-acento`, `border-borda`) —
não há arquivo `tailwind.config`.

Layout pensado primeiro para o polegar: navegação na barra inferior, formulários em folha
deslizante, alvos de toque grandes e campos com fonte de 16px para o iOS não dar zoom sozinho.

## Tecnologias

React 18 · TypeScript · Vite 5 · Tailwind CSS v4 · React Router 6 · Axios · lucide-react
