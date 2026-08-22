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
    `SELECT id, nome, cpf, email, titulo, aluno, professor, admin, ativo, sessoes_invalidadas_em
       FROM usuario WHERE id = $1 AND ativo = TRUE`,
    [payload.id]
  );

  if (rows.length === 0) {
    throw erroNaoAutorizado("Usuário não encontrado ou inativo");
  }

  const usuario = rows[0];

  // Token emitido antes da última troca de credencial não vale mais. O JWT é
  // stateless e dura sete dias: sem isto, trocar a senha não expulsaria quem
  // roubou o token — que é justamente o motivo de trocá-la. Vale igual para o
  // CPF, que é o login.
  //
  // `iat` tem resolução de segundos, então a comparação é estritamente menor:
  // o token emitido no mesmo segundo da troca — o que a própria rota devolve —
  // continua valendo. Coluna nula quer dizer "nunca trocou": não invalida nada,
  // e é como toda linha nasce na migração.
  if (usuario.sessoes_invalidadas_em) {
    const cortadaEm = Math.floor(new Date(usuario.sessoes_invalidadas_em).getTime() / 1000);
    if (typeof payload.iat === "number" && payload.iat < cortadaEm) {
      throw erroNaoAutorizado("Sessão expirada. Entre de novo.");
    }
  }

  req.usuario = usuario;
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
