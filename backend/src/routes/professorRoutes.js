import { Router } from "express";
import * as professor from "../controllers/professorController.js";
import * as sessao from "../controllers/sessaoController.js";
import { erroRequisicao } from "../lib/erros.js";

const rotas = Router();

// Sem isso um /aluno/abc chegava ao Postgres e virava 500 ("invalid input
// syntax for integer") em vez de um 400 explicando o problema.
rotas.param("id", (_req, _res, next, valor) => {
  const id = Number(valor);
  next(Number.isInteger(id) && id > 0 ? undefined : erroRequisicao("Identificador inválido"));
});

rotas.get("/resumo", professor.resumo);

// Alunos
rotas.get("/alunos", professor.listarAlunos);
rotas.post("/alunos", professor.cadastrarAluno);
rotas.put("/alunos/desativar", professor.desativarUsuario);
rotas.put("/alunos/reativar", professor.reativarUsuario);
rotas.get("/aluno/:id", professor.listarAlunoPorId);
rotas.put("/aluno/:id", professor.alterarAluno);
rotas.get("/aluno/:id/treino", professor.treinoDoAluno);
rotas.get("/aluno/:id/sessoes", sessao.sessoesDoAluno);
rotas.post("/usuario/cpfoutitulo", professor.buscarUsuarioPorCpfOuTitulo);

// Professores
rotas.get("/professores", professor.listarProfessores);
rotas.post("/professores", professor.cadastrarProfessor);
rotas.get("/professor/:id", professor.listarProfessorPorId);

// Treinos
rotas.get("/exercicios", professor.listarExercicios);
rotas.post("/treino", professor.cadastrarTreino);
rotas.get("/treino/pedidos", professor.listarPedidos);
rotas.post("/treino/pedido/finalizado", professor.finalizarPedido);
rotas.put("/treino/inativar/:id", professor.inativarTreino);
rotas.put("/treino/reativar/:id", professor.reativarTreino);
// Aliases em GET mantidos por compatibilidade com a versão anterior da API.
rotas.get("/treino/inativar/:id", professor.inativarTreino);
rotas.get("/treino/reativar/:id", professor.reativarTreino);

export default rotas;
