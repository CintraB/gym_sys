import { db } from "../config/db.js";
import { verificarToken } from "../lib/jwt.js";
import { asyncHandler, erroNaoAutorizado, erroProibido } from "../lib/erros.js";

/**
 * Valida o JWT e carrega o usuário do banco em `req.usuario`.
 *
 * A consulta existe de propósito: garante que um token ainda válido de um
 * usuário desativado deixe de funcionar imediatamente.
 */
export const autenticar = asyncHandler(async (req, _res, next) => {
  // O esquema precisa ser conferido: pegar só a segunda parte do cabeçalho
  // fazia "Basic <jwt>" ser aceito como se fosse Bearer.
  const [esquema, token, ...sobra] = (req.headers.authorization ?? "").trim().split(/\s+/);

  if (esquema?.toLowerCase() !== "bearer" || !token || sobra.length > 0) {
    throw erroNaoAutorizado("Token não informado");
  }

  let payload;
  try {
    payload = await verificarToken(token);
  } catch {
    throw erroNaoAutorizado("Falha ao autenticar o token");
  }

  const { rows } = await db.query(
    `SELECT id, nome, cpf, email, titulo, aluno, professor, admin, ativo, senha_alterada_em
       FROM usuario WHERE id = $1 AND ativo = TRUE`,
    [payload.id]
  );

  if (rows.length === 0) {
    throw erroNaoAutorizado("Usuário não encontrado ou inativo");
  }

  req.usuario = rows[0];
  next();
});

/** Exige um perfil específico. Usar sempre depois de `autenticar`. */
export function exigirPerfil(perfil) {
  return (req, _res, next) => {
    if (!req.usuario?.[perfil]) {
      return next(erroProibido(`Acesso negado. Usuário não é um ${perfil}`));
    }
    next();
  };
}
