import { gerarToken } from "./jwt.js";
import { perfilDe } from "./perfil.js";

/**
 * Token novo para quem acabou de trocar o próprio login.
 *
 * Trocar o CPF grava o corte de sessão, e o corte derruba todo token emitido
 * antes — inclusive o de quem está fazendo a alteração. Sem isto, o admin que
 * corrige o próprio CPF se desconecta no meio do trabalho. É o mesmo cuidado
 * que `PUT /me/senha` já toma.
 *
 * Devolve `null` para a conta de outra pessoa: entregar um token dela a quem
 * editou seria sequestro de sessão com cara de recurso.
 *
 * O cargo sai de `req.usuario`, não da linha atualizada: perfis têm rota
 * própria e não mudam por aqui, e o RETURNING da rota do professor nem traz a
 * coluna `admin` — de lá, um admin voltaria com cargo de professor.
 */
export async function tokenAposTrocaDeLogin(req, atualizado) {
  if (atualizado.id !== req.usuario.id) return null;
  if (atualizado.cpf === req.usuario.cpf) return null;

  return gerarToken({ id: atualizado.id, cargo: perfilDe(req.usuario) });
}
