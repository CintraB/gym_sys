# Gym Sys

Sistema de gestão de academia — alunos, professores e treinos — organizado como monorepo.

Este projeto é uma continuação do [SISTEMA-ACADEMIA](https://github.com/CintraB/SISTEMA-ACADEMIA).

```
gym_sys/
├── backend/     API RESTful em Node.js + Express + PostgreSQL
└── frontend/    Aplicação React + TypeScript + Vite
```

- [backend/README.md](backend/README.md) — instalação, banco, variáveis de ambiente e endpoints.
- [frontend/README.md](frontend/README.md) — instalação, configuração e funcionalidades.

## Experimentar rápido

Sem instalar PostgreSQL, com dados de exemplo já carregados:

```plaintext
cd backend  && npm install && npm run demo
cd frontend && npm install && npm run dev
```

Abra `http://localhost:5173` e entre como professor (`111.111.111-11`) ou aluno
(`222.222.222-22`), senha `demo123` nos dois.

O terminal do Vite também mostra um endereço de rede — abra por ele no celular, no mesmo Wi-Fi,
para ver a interface como ela foi pensada.

## Rodando de verdade

Com Docker, o banco sobe pronto — schema, triggers e catálogo de exercícios aplicados sozinhos:

```plaintext
cd backend
npm install
cp .env.example .env          # ajuste TOKEN_SEG
npm run db:up
npm run criar-professor -- --cpf 12345678901 --nome "Seu Nome" --senha "suaSenha" --email voce@exemplo.com --titulo 123456789012
npm run dev
```

API em `http://localhost:8080`. Os dados persistem no volume `gymsys-dados`.

Sem Docker, use um PostgreSQL local e aplique `db/schema.sql`, `db/triggers.sql` e `db/seed.sql` à
mão — o passo a passo está no [backend/README.md](backend/README.md).

Frontend:

```plaintext
cd frontend
npm install
npm run dev
```

Interface em `http://localhost:5173`.

## Requisitos

Node.js 20 ou superior · Docker (ou um PostgreSQL 14+ instalado; ambos dispensáveis no modo demo)

## Tecnologias

- **Backend**: Node.js (ESM), Express, PostgreSQL, jose (JWT), scrypt, cors
- **Frontend**: React, TypeScript, Vite, Tailwind CSS v4, React Router, Axios
