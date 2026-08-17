# Gym Sys

Sistema de gestão de academia. O professor monta treinos divididos em blocos
A/B/C/D e acompanha a frequência; o aluno executa com cronômetro e vê o próprio
histórico.

Continuação do projeto [SISTEMA-ACADEMIA](https://github.com/CintraB/SISTEMA-ACADEMIA).

```
gym_sys/
├── backend/     API RESTful em Node.js + Express + PostgreSQL
├── frontend/    Aplicação React + TypeScript + Vite (PWA)
└── deploy/      Configuração para rodar em servidor doméstico
```

## O que o sistema faz

**Professor**

- Cadastra alunos, desativa e reativa
- Monta treinos divididos em blocos (A, B, C…), com nome opcional por bloco
- Vê os pedidos de treino e o treino atual de cada aluno
- Acompanha a frequência: quem treinou quando, por quanto tempo e quanto fez

**Aluno**

- Vê o treino do dia, agrupado por grupo muscular
- Inicia o treino com cronômetro, marca os exercícios conforme faz e finaliza
- O app sugere qual bloco fazer, seguindo o que foi feito por último
- Consulta o histórico de treinos executados
- Pede treino novo com observação para o professor

Quem dá aula e também treina tem os dois perfis e alterna entre as áreas.

## Experimentar rápido

Sem instalar PostgreSQL, com dados de exemplo já carregados:

```plaintext
cd backend  && npm install && npm run demo
cd frontend && npm install && npm run dev
```

Abra `http://localhost:5173` e entre como professor (`111.111.111-11`) ou aluno
(`222.222.222-22`), senha `demo123` nos dois.

O terminal do Vite também mostra um endereço de rede — abra por ele no celular,
no mesmo Wi-Fi, para ver a interface como ela foi pensada.

## Rodando de verdade

Com Docker, o banco sobe pronto — schema, triggers e catálogo de exercícios
aplicados sozinhos:

```plaintext
cd backend
npm install
cp .env.example .env          # ajuste TOKEN_SEG
npm run db:up
npm run criar-professor -- --cpf 12345678901 --nome "Seu Nome" --senha "suaSenha" --email voce@exemplo.com --titulo 123456789012
npm run dev
```

API em `http://localhost:8080`. Os dados persistem no volume `gymsys-dados`.

Frontend:

```plaintext
cd frontend
npm install
npm run dev
```

Interface em `http://localhost:5173`. O endereço da API é derivado do host da
página, então abrir pelo IP da rede funciona sem configurar nada.

Sem Docker, use um PostgreSQL local e aplique `db/schema.sql`, `db/triggers.sql`
e `db/seed.sql` à mão — o passo a passo está no
[backend/README.md](backend/README.md).

## No celular

O app tem manifesto e service worker: dá para instalar na tela inicial e ele
abre sem rede, mostrando o último treino carregado.

No iPhone funciona direto. No Android a instalação completa exige HTTPS — que é
o que a configuração de [`deploy/`](deploy/README.md) entrega.

## Estado atual

Funcional de ponta a ponta e usado em desenvolvimento contra PostgreSQL em
container. Ainda **não está em produção** — falta subir no servidor doméstico
com HTTPS.

O que já funciona: cadastro de alunos, treinos em blocos, execução com
cronômetro, histórico, frequência, perfil duplo professor/aluno, tema
claro/escuro e instalação como PWA.

As lacunas conhecidas — troca de senha, edição de treino, cadastro de
exercícios pela interface, painel de administração e testes de frontend — estão
listadas e priorizadas no [ROADMAP.md](ROADMAP.md).

## Documentação

- [backend/README.md](backend/README.md) — instalação, banco, variáveis de
  ambiente, endpoints e limite de tentativas
- [frontend/README.md](frontend/README.md) — instalação, telas e design
- [deploy/README.md](deploy/README.md) — servidor doméstico com HTTPS
- [ROADMAP.md](ROADMAP.md) — o que falta

## Testes

```plaintext
cd backend && npm test
```

102 testes rodando sobre um PostgreSQL em memória — não precisam de banco nem de
`.env`. Incluem uma suíte de segurança que cobre falsificação de token, escalada
de privilégio, acesso a dados de terceiros, injeção de SQL e força bruta.

## Requisitos

Node.js 20 ou superior · Docker (ou PostgreSQL 14+; ambos dispensáveis no modo
demo)

## Tecnologias

- **Backend**: Node.js (ESM), Express, PostgreSQL, jose (JWT), scrypt, cors,
  express-rate-limit
- **Frontend**: React, TypeScript, Vite, Tailwind CSS v4, React Router, Axios,
  vite-plugin-pwa
