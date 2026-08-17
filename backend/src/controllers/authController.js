import { db } from "../config/db.js";
import { gerarToken } from "../lib/jwt.js";
import { verificarSenha } from "../lib/senha.js";
import { asyncHandler, erroNaoAutorizado, erroRequisicao } from "../lib/erros.js";
import { normalizarDigitos } from "../lib/validacao.js";

function perfilDe(usuario) {
  return usuario.professor ? "professor" : "aluno";
}

export const login = asyncHandler(async (req, res) => {
  const cpf = normalizarDigitos(req.body?.cpf);
  const senha = req.body?.senha;

  if (!cpf || typeof senha !== "string" || senha.length === 0) {
    throw erroRequisicao("Informe CPF e senha");
  }

  const { rows } = await db.query("SELECT * FROM usuario WHERE cpf = $1", [cpf]);
  const usuario = rows[0];

  // Mesma mensagem para CPF inexistente e senha errada: nao entrega quais
  // CPFs estao cadastrados para quem esta tentando adivinhar.
  if (!usuario || !(await verificarSenha(usuario.senha, senha))) {
    throw erroNaoAutorizado("CPF ou senha incorretos");
  }
  if (!usuario.ativo) {
    throw erroNaoAutorizado("Usuário inativo. Procure a academia.");
  }

  const cargo = perfilDe(usuario);
  const token = await gerarToken({ id: usuario.id, cargo });

  res.json({
    token,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      cpf: usuario.cpf,
      cargo,
      ativo: usuario.ativo,
    },
  });
});

/** Perfil do usuário do token — usado pelo front para reidratar a sessão. */
export const eu = asyncHandler(async (req, res) => {
  const { id, nome, cpf, email, titulo, ativo } = req.usuario;
  res.json({ id, nome, cpf, email, titulo, ativo, cargo: perfilDe(req.usuario) });
});
