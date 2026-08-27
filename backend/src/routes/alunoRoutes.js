import { Router } from "express";
import * as aluno from "../controllers/alunoController.js";
import * as sessao from "../controllers/sessaoController.js";

const rotas = Router();

rotas.get("/meutreino", aluno.meuTreino);
rotas.get("/historico", aluno.meuHistorico);
rotas.get("/pedidotreino", aluno.meuPedido);
rotas.post("/pedidotreino", aluno.pedirNovoTreino);

// Execução do treino
rotas.get("/treino/sessao", sessao.sessaoAtual);
rotas.post("/treino/sessao", sessao.iniciarSessao);
rotas.delete("/treino/sessao", sessao.descartarSessao);
rotas.post("/treino/sessao/finalizar", sessao.finalizarSessao);
rotas.put("/treino/sessao/exercicio/:id", sessao.alternarExercicio);
rotas.post("/treino/sessao/exercicio/:id/serie", sessao.adicionarSerie);

rotas.get("/sessoes", sessao.minhasSessoes);
rotas.get("/sessoes/:id", sessao.detalheDaMinhaSessao);

export default rotas;
