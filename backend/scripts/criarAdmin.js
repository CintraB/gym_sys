/**
 * Cria o primeiro admin do sistema.
 *
 * Existe pelo mesmo motivo do criar-professor: as rotas de admin exigem um
 * token de admin, então em banco novo não haveria como criar o primeiro.
 *
 * Nasce com os três perfis. Não é atalho: quem administra este sistema também
 * dá aula e treina na própria academia, e precisa alcançar as três áreas. A
 * flag `aluno` é ainda o que faz a pessoa aparecer na lista de alunos do
 * professor (`listarAlunos` filtra por `aluno = TRUE`), sem o que ninguém
 * poderia montar um treino para ela.
 *
 *   npm run criar-admin -- --cpf 12345678901 --nome "Cristhian" \
 *     --senha "umaSenhaBoa" --email cristhian@exemplo.com [--titulo 123456789012]
 *     [--sem-aluno]
 */
import { parseArgs } from "node:util";
import { db } from "../src/config/db.js";
import { criarHashComSal } from "../src/lib/senha.js";
import { validarCadastroUsuario } from "../src/lib/validacao.js";

const { values } = parseArgs({
  options: {
    cpf: { type: "string" },
    nome: { type: "string" },
    senha: { type: "string" },
    email: { type: "string" },
    titulo: { type: "string" },
    "sem-aluno": { type: "boolean", default: false },
  },
});

try {
  const dados = validarCadastroUsuario(values);
  const comoAluno = !values["sem-aluno"];

  const { rows: existentes } = await db.query("SELECT id FROM usuario WHERE cpf = $1", [dados.cpf]);
  if (existentes.length > 0) {
    console.error(`Já existe um usuário com o CPF ${dados.cpf}.`);
    process.exit(1);
  }

  const hashSenha = await criarHashComSal(dados.senha);
  const { rows } = await db.query(
    `INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE, TRUE)
     RETURNING id, nome, cpf`,
    [dados.cpf, dados.nome, hashSenha, dados.email, dados.titulo, comoAluno]
  );

  const perfis = comoAluno ? "admin, professor e aluno" : "admin e professor";
  console.log(`Admin criado: ${rows[0].nome} (id ${rows[0].id}), com os perfis ${perfis}.`);
  process.exit(0);
} catch (erro) {
  console.error(erro.message ?? erro);
  process.exit(1);
}
