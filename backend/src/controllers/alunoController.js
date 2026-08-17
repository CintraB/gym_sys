import { db } from "../config/db.js";
import { asyncHandler, erroConflito } from "../lib/erros.js";

const SQL_EXERCICIOS_DO_TREINO = `
  SELECT eu.id,
         eu.id_exercicio,
         eu.numero_serie,
         eu.carga,
         eu.repeticoes,
         eu.observacao_ex_usuario,
         e.nome_exercicio,
         e.tipo
    FROM ex_usuario eu
    JOIN exercicio e ON e.id_exercicio = eu.id_exercicio
   WHERE eu.id_treino = $1
   ORDER BY eu.id
`;

/** Treino ativo do aluno logado, com os exercícios já resolvidos. */
export const meuTreino = asyncHandler(async (req, res) => {
  const { rows: treinos } = await db.query(
    `SELECT t.id_treino, t.criado_em, u.nome AS nome_professor
       FROM treino t
       JOIN usuario u ON u.id = t.id_professor
      WHERE t.id_aluno = $1 AND t.ativo = TRUE
      ORDER BY t.criado_em DESC
      LIMIT 1`,
    [req.usuario.id]
  );

  const treino = treinos[0] ?? null;
  if (!treino) {
    return res.json({ treino: null, exercicios: [] });
  }

  const { rows: exercicios } = await db.query(SQL_EXERCICIOS_DO_TREINO, [treino.id_treino]);
  res.json({ treino, exercicios });
});

/** Treinos anteriores — possível agora que ex_usuario aponta para id_treino. */
export const meuHistorico = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.id_treino,
            t.criado_em,
            t.ativo,
            u.nome AS nome_professor,
            COUNT(eu.id) AS total_exercicios
       FROM treino t
       JOIN usuario u ON u.id = t.id_professor
       LEFT JOIN ex_usuario eu ON eu.id_treino = t.id_treino
      WHERE t.id_aluno = $1
      GROUP BY t.id_treino, t.criado_em, t.ativo, u.nome
      ORDER BY t.criado_em DESC`,
    [req.usuario.id]
  );

  res.json(rows);
});

/** Pedido de treino em aberto do aluno logado, se houver. */
export const meuPedido = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    "SELECT id_pedido, observacao, criado_em FROM pedido_treino WHERE id_aluno = $1 AND ativo = TRUE ORDER BY criado_em DESC LIMIT 1",
    [req.usuario.id]
  );

  res.json(rows[0] ?? null);
});

export const pedirNovoTreino = asyncHandler(async (req, res) => {
  const observacao = (req.body?.observacao ?? "").toString().trim() || null;

  const { rows: abertos } = await db.query(
    "SELECT id_pedido FROM pedido_treino WHERE id_aluno = $1 AND ativo = TRUE",
    [req.usuario.id]
  );
  if (abertos.length > 0) {
    throw erroConflito("Já existe um pedido de treino em aberto");
  }

  const { rows } = await db.query(
    // ativo explícito: em bancos criados antes da migração o default é FALSE,
    // e o pedido nasceria já fechado.
    "INSERT INTO pedido_treino (id_aluno, observacao, ativo) VALUES ($1, $2, TRUE) RETURNING id_pedido, observacao, criado_em",
    [req.usuario.id, observacao]
  );

  res.status(201).json({ message: "Pedido realizado com sucesso", pedido: rows[0] });
});

export { SQL_EXERCICIOS_DO_TREINO };
