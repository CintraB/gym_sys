# Gym Sys

Sistema de gestão de academia (controle de alunos, professores e treinos), organizado como monorepo com backend e frontend separados.

Este projeto é uma continuação do [SISTEMA-ACADEMIA](https://github.com/CintraB/SISTEMA-ACADEMIA).

## Estrutura

```
gym_sys/
├── backend/     API RESTful em Node.js + Express + PostgreSQL
└── frontend/    Aplicação React + TypeScript + Vite
```

- [backend/README.md](backend/README.md) — instalação, variáveis de ambiente e documentação dos endpoints.
- [frontend/README.md](frontend/README.md) — instalação e funcionalidades da interface.

## Executando o projeto

Backend:
```plaintext
cd backend
npm install
npm run dev
```
API disponível em `http://localhost:8080`.

Frontend:
```plaintext
cd frontend
npm install
npm run dev
```
Interface disponível em `http://localhost:3000`.

## Tecnologias

- **Backend**: Node.js, Express, PostgreSQL, JWT, bcrypt, cors
- **Frontend**: React, TypeScript, Vite, React Router, Axios
