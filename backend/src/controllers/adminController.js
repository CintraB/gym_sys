import { db } from "../config/db.js";
import { criarHashComSal } from "../lib/senha.js";
import { asyncHandler, erroNaoEncontrado, erroProibido, erroRequisicao } from "../lib/erros.js";
import { normalizarDigitos } from "../lib/validacao.js";

// A senha jamais entra aqui. É a mesma lista do professorController, com admin.
const CAMPOS_PUBLICOS = "id, nome, cpf, email, titulo, aluno, professor, admin, ativo";

const PERFIS = ["aluno", "professor", "admin"];

const TAMANHO_MINIMO_SENHA = 6;

/**
 * Lista todos os usuários, com filtro por perfil e status.
 *
 * É a única visão do sistema inteiro: o professor só enxerga alunos.
 */
export const listarUsuarios = asyncHandler(async (req, res) => {
  const perfil = (req.query.perfil ?? "").toString().trim();
  const status = (req.query.status ?? "").toString().trim();
  const busca = (req.query.busca ?? "").toString().trim();

  const condicoes = [];
  const valores = [];

  // Lista fechada porque o nome do perfil vira nome de coluna dentro da SQL.
  // Interpolar o que o cliente mandou seria injeção pelo nome do campo — o
  // único lugar do projeto onde um valor de query chega perto disso.
  if (perfil) {
    if (!PERFIS.includes(perfil)) {
      throw erroRequisicao("Perfil inválido");
    }
    condicoes.push(`${perfil} = TRUE`);
  }

  if (status === "ativos") condicoes.push("ativo = TRUE");
  if (status === "inativos") condicoes.push("ativo = FALSE");

  if (busca) {
    valores.push(`%${busca}%`, `%${normalizarDigitos(busca) || busca}%`);
    condicoes.push(`(nome ILIKE $${valores.length - 1} OR cpf LIKE $${valores.length})`);
  }

  const onde = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
  const { rows } = await db.query(
    `SELECT ${CAMPOS_PUBLICOS} FROM usuario ${onde} ORDER BY nome`,
    valores
  );

  res.json(rows);
});

/**
 * Redefine a senha de outro usuário, sem pedir a senha atual — é o caso de
 * quem esqueceu.
 *
 * Não serve para o próprio admin: para si mesmo ele usa PUT /me/senha, com a
 * senha atual. Sem esta trava, a exigência da senha atual viraria decorativa
 * justamente para a conta que mais importa.
 *
 * Gravar `senha_alterada_em` derruba as sessões abertas daquele usuário. É
 * intencional: se a redefinição foi por conta comprometida, deixar a sessão do
 * invasor de pé anularia o propósito.
 */
export const redefinirSenha = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const senhaNova = typeof req.body?.senha_nova === "string" ? req.body.senha_nova : "";

  if (senhaNova.length < TAMANHO_MINIMO_SENHA) {
    throw erroRequisicao(`A senha nova deve ter ao menos ${TAMANHO_MINIMO_SENHA} caracteres`);
  }
  if (id === req.usuario.id) {
    throw erroProibido("Use a troca de senha comum para a sua própria conta");
  }

  const hash = await criarHashComSal(senhaNova);
  const { rows } = await db.query(
    `UPDATE usuario SET senha = $1, senha_alterada_em = NOW(), atualizado_por = $2
      WHERE id = $3
      RETURNING ${CAMPOS_PUBLICOS}`,
    [hash, req.usuario.id, id]
  );

  if (rows.length === 0) {
    throw erroNaoEncontrado("Usuário não encontrado");
  }

  res.json({ message: "Senha redefinida. A pessoa precisará entrar de novo.", usuario: rows[0] });
});
