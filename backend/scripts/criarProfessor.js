/**
 * Cria o primeiro professor do sistema.
 *
 * Existe porque o cadastro de professor pela API exige um token de professor —
 * sem este script não há como criar o primeiro usuário em um banco novo.
 *
 *   npm run criar-professor -- --cpf 12345678901 --nome "Cristhian" \
 *     --senha "umaSenhaBoa" --email cristhian@exemplo.com [--titulo 123456789012]
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
  },
});

try {
  const dados = validarCadastroUsuario(values);

  const { rows: existentes } = await db.query("SELECT id FROM usuario WHERE cpf = $1", [dados.cpf]);
  if (existentes.length > 0) {
    console.error(`Já existe um usuário com o CPF ${dados.cpf}.`);
    process.exit(1);
  }

  const hashSenha = await criarHashComSal(dados.senha);
  const { rows } = await db.query(
    `INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, ativo)
     VALUES ($1, $2, $3, $4, $5, FALSE, TRUE, TRUE)
     RETURNING id, nome, cpf`,
    [dados.cpf, dados.nome, hashSenha, dados.email, dados.titulo]
  );

  console.log(`Professor criado: #${rows[0].id} ${rows[0].nome} (CPF ${rows[0].cpf})`);
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
