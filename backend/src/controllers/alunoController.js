import { db } from "../config/db.js";
import { asyncHandler, erroConflito } from "../lib/erros.js";

const SQL_EXERCICIOS_DO_TREINO = `
  SELECT eu.id,
         eu.id_bloco,
         eu.id_exercicio,
         eu.numero_serie,
         eu.carga,
         eu.repeticoes,
         eu.observacao_ex_usuario,
         e.nome_exercicio,
         e.tipo
    FROM ex_usuario eu
    JOIN exercicio e ON e.id_exercicio = eu.id_exercicio
   WHERE eu.id_treino = $1 AND eu.ativo = TRUE
   ORDER BY eu.id
`;

/**
 * Blocos de um treino com seus exercícios dentro.
 *
 * Todo treino tem pelo menos um bloco (o "A" de quem não divide), então quem
 * consome isso nunca precisa tratar exercício solto.
 */
export async function carregarBlocosDoTreino(idTreino) {
  const { rows: blocos } = await db.query(
    "SELECT id_bloco, letra, nome, ordem FROM treino_bloco WHERE id_treino = $1 AND ativo = TRUE ORDER BY ordem",
    [idTreino]
  );
  const { rows: exercicios } = await db.query(SQL_EXERCICIOS_DO_TREINO, [idTreino]);

  return blocos.map((bloco) => ({
    ...bloco,
    exercicios: exercicios.filter((exercicio) => exercicio.id_bloco === bloco.id_bloco),
  }));
}

/**
 * Qual bloco propor ao aluno hoje: o seguinte ao último que ele finalizou,
 * voltando ao primeiro depois do último. Sem histórico, o primeiro.
 */
export async function sugerirBloco(idAluno, blocos) {
  if (blocos.length === 0) return null;

  const { rows } = await db.query(
    // O desempate por id_sessao não é detalhe: duas sessões no mesmo segundo
    // deixam a ordenação só por iniciado_em indefinida, e a sugestão trava no
    // mesmo bloco.
    `SELECT id_bloco FROM sessao_treino
      WHERE id_aluno = $1 AND finalizado_em IS NOT NULL AND id_bloco IS NOT NULL
      ORDER BY iniciado_em DESC, id_sessao DESC
      LIMIT 1`,
    [idAluno]
  );

  const ultimo = rows[0]?.id_bloco ?? null;
  const posicao = blocos.findIndex((bloco) => bloco.id_bloco === ultimo);

  // Não achou (primeira vez, ou o treino mudou desde a última sessão): começa
  // do primeiro bloco.
  if (posicao === -1) return blocos[0].id_bloco;
  return blocos[(posicao + 1) % blocos.length].id_bloco;
}

async function treinoAtivoDoAluno(idAluno) {
  const { rows } = await db.query(
    `SELECT t.id_treino, t.criado_em, u.nome AS nome_professor
       FROM treino t
       JOIN usuario u ON u.id = t.id_professor
      WHERE t.id_aluno = $1 AND t.ativo = TRUE
      ORDER BY t.criado_em DESC
      LIMIT 1`,
    [idAluno]
  );
  return rows[0] ?? null;
}

/** Treino ativo do aluno logado, dividido em blocos. */
export const meuTreino = asyncHandler(async (req, res) => {
  const treino = await treinoAtivoDoAluno(req.usuario.id);
  if (!treino) {
    return res.json({ treino: null, blocos: [], bloco_sugerido: null });
  }

  const blocos = await carregarBlocosDoTreino(treino.id_treino);
  res.json({
    treino,
    blocos,
    bloco_sugerido: await sugerirBloco(req.usuario.id, blocos),
  });
});

/** Prescrições anteriores — diferente do histórico de execuções. */
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

export { SQL_EXERCICIOS_DO_TREINO, treinoAtivoDoAluno };
