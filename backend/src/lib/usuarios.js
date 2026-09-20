import { db } from "../config/db.js";
import { criarHashComSal } from "./senha.js";
import { erroConflito, erroRequisicao } from "./erros.js";
import { validarCadastroUsuario } from "./validacao.js";

/**
 * Criar usuário, com os perfis que quem cria tiver direito de dar.
 *
 * Mora aqui, e não num dos controllers, porque duas portas criam usuário: o
 * professor (aluno ou professor, nunca os dois) e o admin (qualquer
 * combinação, admin inclusive). Deixá-la no `professorController` obrigaria o
 * `adminController` a importar do outro controller, e a regra de CPF repetido
 * passaria a ter dois donos.
 *
 * É o primeiro arquivo de `lib/` que toca o banco — o critério da pasta é não
 * ter Express dentro, e isto não tem: recebe dados, devolve a linha criada, e
 * quem traduz para HTTP é o controller.
 */

/** Sem `senha`: ela nunca sai do banco, nem para quem acabou de criá-la. */
const CAMPOS_PUBLICOS = "id, nome, cpf, email, titulo, aluno, professor, admin, ativo";

export async function criarUsuario({ dados: corpo, perfis, criadoPor }) {
  const dados = validarCadastroUsuario(corpo);

  // Mesma regra e mesma frase do `alterarPerfis`: quem não tem perfil nenhum
  // não consegue entrar em lugar nenhum do sistema, e duas mensagens
  // diferentes para a mesma recusa só confundem quem lê.
  if (!perfis.aluno && !perfis.professor && !perfis.admin) {
    throw erroRequisicao("O usuário precisa ter ao menos um perfil");
  }

  const { rows: existentes } = await db.query(
    "SELECT id FROM usuario WHERE cpf = $1 OR ($2::text IS NOT NULL AND titulo = $2)",
    [dados.cpf, dados.titulo]
  );
  if (existentes.length > 0) {
    throw erroConflito("Já existe um usuário com esse CPF ou título");
  }

  const hashSenha = await criarHashComSal(dados.senha);
  const { rows } = await db.query(
    `INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo, atualizado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)
     RETURNING ${CAMPOS_PUBLICOS}`,
    [
      dados.cpf,
      dados.nome,
      hashSenha,
      dados.email,
      dados.titulo,
      perfis.aluno === true,
      perfis.professor === true,
      perfis.admin === true,
      criadoPor,
    ]
  );

  return rows[0];
}
