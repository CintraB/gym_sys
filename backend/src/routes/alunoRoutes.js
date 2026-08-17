import { Router } from "express";
import * as aluno from "../controllers/alunoController.js";

const rotas = Router();

rotas.get("/meutreino", aluno.meuTreino);
rotas.get("/historico", aluno.meuHistorico);
rotas.get("/pedidotreino", aluno.meuPedido);
rotas.post("/pedidotreino", aluno.pedirNovoTreino);

export default rotas;
