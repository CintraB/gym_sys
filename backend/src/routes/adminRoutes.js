import { Router } from "express";
import * as admin from "../controllers/adminController.js";
import { erroRequisicao } from "../lib/erros.js";

const rotas = Router();

// Mesmo motivo do professorRoutes: sem isto, /usuarios/abc/senha chegaria ao
// Postgres e viraria 500 ("invalid input syntax for integer") em vez de um 400
// explicando o problema.
rotas.param("id", (_req, _res, next, valor) => {
  const id = Number(valor);
  next(Number.isInteger(id) && id > 0 ? undefined : erroRequisicao("Identificador inválido"));
});

rotas.get("/usuarios", admin.listarUsuarios);
rotas.put("/usuarios/:id/senha", admin.redefinirSenha);

export default rotas;
