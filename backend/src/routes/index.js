import { Router } from "express";
import { autenticar, exigirPerfil } from "../middlewares/auth.js";
import { login, eu, trocarMinhaSenha } from "../controllers/authController.js";
import adminRoutes from "./adminRoutes.js";
import alunoRoutes from "./alunoRoutes.js";
import professorRoutes from "./professorRoutes.js";

const rotas = Router();

rotas.get("/", (_req, res) => res.json({ status: "ok", servico: "gym-sys-api" }));
rotas.get("/health", (_req, res) => res.json({ status: "ok" }));

rotas.post("/login", login);
rotas.get("/me", autenticar, eu);
rotas.put("/me/senha", autenticar, trocarMinhaSenha);

rotas.use("/alunos", autenticar, exigirPerfil("aluno"), alunoRoutes);
rotas.use("/professores", autenticar, exigirPerfil("professor"), professorRoutes);
rotas.use("/admin", autenticar, exigirPerfil("admin"), adminRoutes);

export default rotas;
