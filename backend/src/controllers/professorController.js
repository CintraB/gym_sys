import { db } from "../config/db.js";
import { criarHashComSal } from "../lib/senha.js";
import {
  asyncHandler,
  erroConflito,
  erroNaoEncontrado,
  erroRequisicao,
} from "../lib/erros.js";
import {
  normalizarDigitos,
  validarCadastroUsuario,
  validarExerciciosTreino,
} from "../lib/validacao.js";
import { SQL_EXERCICIOS_DO_TREINO } from "./alunoController.js";

const CAMPOS_PUBLICOS = "id, nome, cpf, email, titulo, aluno, professor, ativo";

/* ------------------------------------------------------------------ alunos */

export const listarAlunos = asyncHandler(async (req, res) => {
  const busca = (req.query.busca ?? "").toString().trim();
  const incluirInativos = req.query.incluirInativos === "true";

  const condicoes = ["aluno = TRUE"];
  const valores = [];

  if (!incluirInativos) {
    condicoes.push("ativo = TRUE");
  }
  if (busca) {
    valores.push(`%${busca}%`, `%${normalizarDigitos(busca) || busca}%`);
    condicoes.push(`(nome ILIKE $${valores.length - 1} OR cpf LIKE $${valores.length})`);
  }

  const { rows } = await db.query(
    `SELECT ${CAMPOS_PUBLICOS} FROM usuario WHERE ${condicoes.join(" AND ")} ORDER BY nome`,
    valores
  );

  res.json(rows);
});

export const listarAlunoPorId = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT ${CAMPOS_PUBLICOS} FROM usuario WHERE id = $1 AND aluno = TRUE AND ativo = TRUE`,
    [req.params.id]
  );

  if (rows.length === 0) {
    throw erroNaoEncontrado("Aluno não encontrado ou inativo");
  }
  res.json(rows[0]);
});

export const buscarUsuarioPorCpfOuTitulo = asyncHandler(async (req, res) => {
  const cpf = normalizarDigitos(req.body?.cpf);
  const titulo = normalizarDigitos(req.body?.titulo);

  if (!cpf && !titulo) {
    throw erroRequisicao("Informe CPF ou título");
  }

  const { rows } = await db.query(
    `SELECT ${CAMPOS_PUBLICOS} FROM usuario
      WHERE ativo = TRUE AND (($1 <> '' AND cpf = $1) OR ($2 <> '' AND titulo = $2))`,
    [cpf, titulo]
  );

  if (rows.length === 0) {
    throw erroNaoEncontrado("Usuário não encontrado");
  }
  res.json(rows[0]);
});

async function cadastrarUsuario(req, { professor }) {
  const dados = validarCadastroUsuario(req.body);

  const { rows: existentes } = await db.query(
    "SELECT id FROM usuario WHERE cpf = $1 OR ($2::text IS NOT NULL AND titulo = $2)",
    [dados.cpf, dados.titulo]
  );
  if (existentes.length > 0) {
    throw erroConflito("Já existe um usuário com esse CPF ou título");
  }

  const hashSenha = await criarHashComSal(dados.senha);
  const { rows } = await db.query(
    `INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, ativo, atualizado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
     RETURNING ${CAMPOS_PUBLICOS}`,
    [
      dados.cpf,
      dados.nome,
      hashSenha,
      dados.email,
      dados.titulo,
      !professor,
      professor,
      req.usuario.id,
    ]
  );

  return rows[0];
}

export const cadastrarAluno = asyncHandler(async (req, res) => {
  const aluno = await cadastrarUsuario(req, { professor: false });
  res.status(201).json({ message: "Aluno cadastrado com sucesso", aluno });
});

export const cadastrarProfessor = asyncHandler(async (req, res) => {
  const professor = await cadastrarUsuario(req, { professor: true });
  res.status(201).json({ message: "Professor cadastrado com sucesso", professor });
});

export const alterarAluno = asyncHandler(async (req, res) => {
  const atualizacoes = [];
  const valores = [];

  const campos = {
    cpf: req.body?.cpf !== undefined ? normalizarDigitos(req.body.cpf) : undefined,
    nome: req.body?.nome?.trim(),
    email: req.body?.email?.trim(),
    titulo: req.body?.titulo !== undefined ? normalizarDigitos(req.body.titulo) : undefined,
  };

  for (const [coluna, valor] of Object.entries(campos)) {
    if (valor) {
      valores.push(valor);
      atualizacoes.push(`${coluna} = $${valores.length}`);
    }
  }

  if (atualizacoes.length === 0) {
    throw erroRequisicao("Nenhum dado para atualizar");
  }

  valores.push(req.usuario.id);
  atualizacoes.push(`atualizado_por = $${valores.length}`);
  valores.push(req.params.id);

  const { rows } = await db.query(
    `UPDATE usuario SET ${atualizacoes.join(", ")}
      WHERE id = $${valores.length} AND ativo = TRUE AND aluno = TRUE
      RETURNING ${CAMPOS_PUBLICOS}`,
    valores
  );

  if (rows.length === 0) {
    throw erroNaoEncontrado("Aluno não encontrado ou inativo");
  }
  res.json({ message: "Dados do aluno alterados com sucesso", aluno: rows[0] });
});

/** Desativa o usuário e, em cascata, seus treinos e exercícios. */
export const desativarUsuario = asyncHandler(async (req, res) => {
  const cpf = normalizarDigitos(req.body?.cpf);
  if (!cpf) {
    throw erroRequisicao("Informe o CPF");
  }

  const cliente = await db.connect();
  try {
    await cliente.query("BEGIN");

    const { rows } = await cliente.query(
      `UPDATE usuario SET ativo = FALSE, atualizado_por = $2
        WHERE cpf = $1 AND ativo = TRUE
        RETURNING ${CAMPOS_PUBLICOS}`,
      [cpf, req.usuario.id]
    );

    if (rows.length === 0) {
      await cliente.query("ROLLBACK");
      throw erroNaoEncontrado("Usuário não encontrado ou já inativo");
    }

    const id = rows[0].id;
    await cliente.query("UPDATE treino SET ativo = FALSE WHERE id_aluno = $1", [id]);
    await cliente.query("UPDATE ex_usuario SET ativo = FALSE WHERE id_user = $1", [id]);

    await cliente.query("COMMIT");
    res.json({ message: "Usuário desativado", usuario: rows[0] });
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }
});

export const reativarUsuario = asyncHandler(async (req, res) => {
  const cpf = normalizarDigitos(req.body?.cpf);
  if (!cpf) {
    throw erroRequisicao("Informe o CPF");
  }

  const { rows } = await db.query(
    `UPDATE usuario SET ativo = TRUE, atualizado_por = $2
      WHERE cpf = $1 AND ativo = FALSE
      RETURNING ${CAMPOS_PUBLICOS}`,
    [cpf, req.usuario.id]
  );

  if (rows.length === 0) {
    throw erroNaoEncontrado("Usuário não encontrado ou já ativo");
  }
  res.json({ message: "Usuário reativado", usuario: rows[0] });
});

/* ------------------------------------------------------------- professores */

export const listarProfessores = asyncHandler(async (_req, res) => {
  const { rows } = await db.query(
    `SELECT ${CAMPOS_PUBLICOS} FROM usuario WHERE professor = TRUE ORDER BY nome`
  );
  res.json(rows);
});

export const listarProfessorPorId = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT ${CAMPOS_PUBLICOS} FROM usuario WHERE id = $1 AND professor = TRUE AND ativo = TRUE`,
    [req.params.id]
  );

  if (rows.length === 0) {
    throw erroNaoEncontrado("Professor não encontrado ou inativo");
  }
  res.json(rows[0]);
});

/* ----------------------------------------------------------------- treinos */

export const listarExercicios = asyncHandler(async (_req, res) => {
  const { rows } = await db.query(
    "SELECT id_exercicio, nome_exercicio, tipo FROM exercicio ORDER BY tipo, nome_exercicio"
  );
  res.json(rows);
});

/**
 * Cadastra um treino. O professor vem do token, nunca do corpo — antes o
 * cliente escolhia o id_professor e podia registrar treino em nome de outro.
 * O treino anterior do aluno é desativado: só um treino fica ativo por vez.
 */
export const cadastrarTreino = asyncHandler(async (req, res) => {
  const idAluno = Number(req.body?.id_aluno ?? req.body?.id_user);
  if (!Number.isInteger(idAluno) || idAluno <= 0) {
    throw erroRequisicao("Aluno inválido");
  }

  const exercicios = validarExerciciosTreino(req.body?.exercicios);

  const cliente = await db.connect();
  try {
    await cliente.query("BEGIN");

    const { rows: alunos } = await cliente.query(
      "SELECT id FROM usuario WHERE id = $1 AND aluno = TRUE AND ativo = TRUE",
      [idAluno]
    );
    if (alunos.length === 0) {
      await cliente.query("ROLLBACK");
      throw erroNaoEncontrado("Aluno não encontrado ou inativo");
    }

    // Um treino ativo por aluno. Sem isso os exercicios antigos continuavam
    // ativos e apareciam misturados com os novos em "meu treino".
    await cliente.query("UPDATE treino SET ativo = FALSE WHERE id_aluno = $1 AND ativo = TRUE", [
      idAluno,
    ]);
    await cliente.query("UPDATE ex_usuario SET ativo = FALSE WHERE id_user = $1 AND ativo = TRUE", [
      idAluno,
    ]);

    const { rows: criado } = await cliente.query(
      "INSERT INTO treino (id_aluno, id_professor) VALUES ($1, $2) RETURNING id_treino, criado_em",
      [idAluno, req.usuario.id]
    );
    const idTreino = criado[0].id_treino;

    const valores = [];
    const grupos = exercicios.map((exercicio) => {
      valores.push(
        idTreino,
        idAluno,
        exercicio.id_exercicio,
        exercicio.numero_serie,
        exercicio.repeticoes,
        exercicio.carga,
        exercicio.observacao_ex_usuario
      );
      const base = valores.length - 7;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
    });

    await cliente.query(
      `INSERT INTO ex_usuario
         (id_treino, id_user, id_exercicio, numero_serie, repeticoes, carga, observacao_ex_usuario)
       VALUES ${grupos.join(", ")}`,
      valores
    );

    // Montar o treino encerra o pedido em aberto do aluno.
    await cliente.query(
      "UPDATE pedido_treino SET ativo = FALSE WHERE id_aluno = $1 AND ativo = TRUE",
      [idAluno]
    );

    await cliente.query("COMMIT");
    res.status(201).json({ message: "Treino cadastrado com sucesso", id_treino: idTreino });
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }
});

/** Treino ativo de um aluno, para o professor revisar antes de montar outro. */
export const treinoDoAluno = asyncHandler(async (req, res) => {
  const { rows: treinos } = await db.query(
    `SELECT t.id_treino, t.criado_em, u.nome AS nome_professor
       FROM treino t
       JOIN usuario u ON u.id = t.id_professor
      WHERE t.id_aluno = $1 AND t.ativo = TRUE
      ORDER BY t.criado_em DESC
      LIMIT 1`,
    [req.params.id]
  );

  const treino = treinos[0] ?? null;
  if (!treino) {
    return res.json({ treino: null, exercicios: [] });
  }

  const { rows: exercicios } = await db.query(SQL_EXERCICIOS_DO_TREINO, [treino.id_treino]);
  res.json({ treino, exercicios });
});

async function alterarStatusTreino(idAluno, ativo) {
  const cliente = await db.connect();
  try {
    await cliente.query("BEGIN");

    const { rows } = await cliente.query(
      "SELECT id FROM usuario WHERE id = $1 AND aluno = TRUE AND ativo = TRUE",
      [idAluno]
    );
    if (rows.length === 0) {
      await cliente.query("ROLLBACK");
      throw erroNaoEncontrado("Aluno não encontrado ou inativo");
    }

    await cliente.query("UPDATE treino SET ativo = $2 WHERE id_aluno = $1", [idAluno, ativo]);
    await cliente.query("UPDATE ex_usuario SET ativo = $2 WHERE id_user = $1", [idAluno, ativo]);

    await cliente.query("COMMIT");
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }
}

export const inativarTreino = asyncHandler(async (req, res) => {
  await alterarStatusTreino(req.params.id, false);
  res.json({ message: "Treino inativado com sucesso" });
});

export const reativarTreino = asyncHandler(async (req, res) => {
  await alterarStatusTreino(req.params.id, true);
  res.json({ message: "Treino reativado com sucesso" });
});

/* ----------------------------------------------------------------- pedidos */

export const listarPedidos = asyncHandler(async (_req, res) => {
  const { rows } = await db.query(
    `SELECT p.id_pedido, p.id_aluno, p.observacao, p.criado_em, u.nome AS nome_aluno, u.cpf
       FROM pedido_treino p
       JOIN usuario u ON u.id = p.id_aluno
      WHERE p.ativo = TRUE
      ORDER BY p.criado_em`
  );
  res.json(rows);
});

export const finalizarPedido = asyncHandler(async (req, res) => {
  const idPedido = Number(req.body?.id_pedido);
  if (!Number.isInteger(idPedido)) {
    throw erroRequisicao("Pedido inválido");
  }

  const { rows } = await db.query(
    "UPDATE pedido_treino SET ativo = FALSE WHERE id_pedido = $1 AND ativo = TRUE RETURNING id_pedido",
    [idPedido]
  );

  if (rows.length === 0) {
    throw erroNaoEncontrado("Pedido não encontrado ou já finalizado");
  }
  res.json({ message: "Pedido finalizado com sucesso" });
});

/* ---------------------------------------------------------------- dashboard */

export const resumo = asyncHandler(async (_req, res) => {
  const { rows } = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM usuario WHERE aluno = TRUE AND ativo = TRUE)     AS alunos_ativos,
       (SELECT COUNT(*) FROM usuario WHERE aluno = TRUE AND ativo = FALSE)    AS alunos_inativos,
       (SELECT COUNT(*) FROM pedido_treino WHERE ativo = TRUE)                AS pedidos_abertos,
       (SELECT COUNT(*) FROM treino WHERE ativo = TRUE)                       AS treinos_ativos`
  );

  const linha = rows[0];
  res.json({
    alunos_ativos: Number(linha.alunos_ativos),
    alunos_inativos: Number(linha.alunos_inativos),
    pedidos_abertos: Number(linha.pedidos_abertos),
    treinos_ativos: Number(linha.treinos_ativos),
  });
});
