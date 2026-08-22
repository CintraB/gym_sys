import { db } from "../config/db.js";
import { gerarToken } from "../lib/jwt.js";
import { criarHashComSal, verificarSenha } from "../lib/senha.js";
import { asyncHandler, erroNaoAutorizado, erroRequisicao } from "../lib/erros.js";
import { normalizarDigitos, validarTrocaDeSenha } from "../lib/validacao.js";
import { perfilDe, perfisDe } from "../lib/perfil.js";

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
      perfis: perfisDe(usuario),
      ativo: usuario.ativo,
    },
  });
});

/** Perfil do usuário do token — usado pelo front para reidratar a sessão. */
export const eu = asyncHandler(async (req, res) => {
  const { id, nome, cpf, email, titulo, ativo } = req.usuario;
  res.json({
    id,
    nome,
    cpf,
    email,
    titulo,
    ativo,
    cargo: perfilDe(req.usuario),
    perfis: perfisDe(req.usuario),
  });
});

/**
 * Troca a senha do próprio usuário.
 *
 * Exige a senha atual: sem isso, quem pega o aparelho destravado troca a senha
 * e toma a conta sem nunca ter sabido a original.
 *
 * Devolve um token novo porque gravar `sessoes_invalidadas_em` invalida todos os
 * emitidos antes — inclusive o de quem está trocando.
 */
export const trocarMinhaSenha = asyncHandler(async (req, res) => {
  const { senhaAtual, senhaNova } = validarTrocaDeSenha(req.body);

  const { rows } = await db.query("SELECT senha FROM usuario WHERE id = $1", [req.usuario.id]);
  if (rows.length === 0 || !(await verificarSenha(rows[0].senha, senhaAtual))) {
    // Mesma resposta de "não autenticado": não confirma que a senha atual
    // estava certa e outra coisa falhou.
    throw erroNaoAutorizado("CPF ou senha incorretos");
  }

  const hash = await criarHashComSal(senhaNova);
  await db.query("UPDATE usuario SET senha = $1, sessoes_invalidadas_em = NOW() WHERE id = $2", [
    hash,
    req.usuario.id,
  ]);

  const token = await gerarToken({ id: req.usuario.id, cargo: perfilDe(req.usuario) });
  res.json({ message: "Senha alterada com sucesso", token });
});
