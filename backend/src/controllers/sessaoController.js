import { db } from "../config/db.js";
import {
  asyncHandler,
  erroConflito,
  erroNaoEncontrado,
  erroRequisicao,
} from "../lib/erros.js";

/**
 * Execução de treinos.
 *
 * `treino` é a prescrição do professor; cada vez que o aluno faz esse treino
 * gera uma `sessao_treino`. A duração vem sempre dos timestamps do servidor —
 * o cronômetro da tela é derivado de `iniciado_em`, então fechar o app no meio
 * não perde nem falseia o tempo.
 */

const SQL_EXERCICIOS_DA_SESSAO = `
  SELECT se.id,
         se.concluido,
         se.concluido_em,
         eu.id           AS id_ex_usuario,
         eu.numero_serie,
         eu.repeticoes,
         eu.carga,
         eu.observacao_ex_usuario,
         e.nome_exercicio,
         e.tipo
    FROM sessao_exercicio se
    JOIN ex_usuario eu ON eu.id = se.id_ex_usuario
    JOIN exercicio  e  ON e.id_exercicio = eu.id_exercicio
   WHERE se.id_sessao = $1
   ORDER BY se.id
`;

async function carregarSessao(idSessao) {
  const { rows } = await db.query(
    `SELECT s.id_sessao, s.id_treino, s.id_aluno, s.iniciado_em, s.finalizado_em,
            s.duracao_segundos, u.nome AS nome_professor
       FROM sessao_treino s
       JOIN treino t ON t.id_treino = s.id_treino
       JOIN usuario u ON u.id = t.id_professor
      WHERE s.id_sessao = $1`,
    [idSessao]
  );

  if (rows.length === 0) return null;

  const { rows: exercicios } = await db.query(SQL_EXERCICIOS_DA_SESSAO, [idSessao]);
  return { sessao: rows[0], exercicios };
}

async function buscarSessaoAberta(idAluno) {
  const { rows } = await db.query(
    "SELECT id_sessao FROM sessao_treino WHERE id_aluno = $1 AND finalizado_em IS NULL",
    [idAluno]
  );
  return rows[0]?.id_sessao ?? null;
}

/** Sessão em andamento, para o app retomar de onde parou. */
export const sessaoAtual = asyncHandler(async (req, res) => {
  const idSessao = await buscarSessaoAberta(req.usuario.id);
  res.json(idSessao ? await carregarSessao(idSessao) : null);
});

/**
 * Inicia o treino.
 *
 * Se já houver uma sessão aberta, devolve ela em vez de criar outra — dois
 * toques rápidos no botão não podem virar dois treinos. O índice único parcial
 * no banco garante isso mesmo em requisições simultâneas.
 */
export const iniciarSessao = asyncHandler(async (req, res) => {
  const abertaAntes = await buscarSessaoAberta(req.usuario.id);
  if (abertaAntes) {
    return res.status(200).json(await carregarSessao(abertaAntes));
  }

  const cliente = await db.connect();
  try {
    await cliente.query("BEGIN");

    const { rows: treinos } = await cliente.query(
      "SELECT id_treino FROM treino WHERE id_aluno = $1 AND ativo = TRUE ORDER BY criado_em DESC LIMIT 1",
      [req.usuario.id]
    );
    if (treinos.length === 0) {
      await cliente.query("ROLLBACK");
      throw erroNaoEncontrado("Você ainda não tem treino para iniciar");
    }
    const idTreino = treinos[0].id_treino;

    const { rows: criada } = await cliente.query(
      "INSERT INTO sessao_treino (id_treino, id_aluno) VALUES ($1, $2) RETURNING id_sessao",
      [idTreino, req.usuario.id]
    );
    const idSessao = criada[0].id_sessao;

    // Uma linha por exercício já na abertura: simplifica contar "5/6" e
    // deixa registrado o que foi pulado, não só o que foi feito.
    await cliente.query(
      `INSERT INTO sessao_exercicio (id_sessao, id_ex_usuario)
       SELECT $1::int, id FROM ex_usuario WHERE id_treino = $2 ORDER BY id`,
      [idSessao, idTreino]
    );

    await cliente.query("COMMIT");
    res.status(201).json(await carregarSessao(idSessao));
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => {});
    // 23505 = violação do índice único de sessão aberta: outra requisição
    // ganhou a corrida. Devolver a sessão dela é o comportamento correto.
    if (erro?.code === "23505") {
      const aberta = await buscarSessaoAberta(req.usuario.id);
      if (aberta) return res.status(200).json(await carregarSessao(aberta));
    }
    throw erro;
  } finally {
    cliente.release();
  }
});

/** Marca ou desmarca um exercício da sessão em andamento. */
export const alternarExercicio = asyncHandler(async (req, res) => {
  const idItem = Number(req.params.id);
  if (!Number.isInteger(idItem) || idItem <= 0) {
    throw erroRequisicao("Identificador inválido");
  }

  const concluido = req.body?.concluido;
  if (typeof concluido !== "boolean") {
    throw erroRequisicao("Informe concluido como true ou false");
  }

  // O IN é o que impede marcar exercício da sessão de outro aluno: o item só
  // é alcançado se pertencer a uma sessão em andamento de quem está logado.
  const { rows } = await db.query(
    `UPDATE sessao_exercicio
        SET concluido = $2,
            concluido_em = $4
      WHERE id = $1
        AND id_sessao IN (
            SELECT id_sessao FROM sessao_treino
             WHERE id_aluno = $3 AND finalizado_em IS NULL
        )
      RETURNING id, concluido, concluido_em`,
    [idItem, concluido, req.usuario.id, concluido ? new Date() : null]
  );

  if (rows.length === 0) {
    throw erroNaoEncontrado("Exercício não encontrado na sessão em andamento");
  }
  res.json(rows[0]);
});

export const finalizarSessao = asyncHandler(async (req, res) => {
  const idSessao = await buscarSessaoAberta(req.usuario.id);
  if (!idSessao) {
    throw erroConflito("Nenhum treino em andamento");
  }

  // A duração sai de iniciado_em, que foi gravado pelo servidor. O corpo da
  // requisição é ignorado de propósito: não há como o cliente inflar o tempo.
  //
  // O cálculo acontece aqui, e não em SQL, porque iniciado_em é timestamptz e
  // o driver devolve um Date correto — subtrair em SQL exigiria sintaxe que
  // varia entre bancos.
  const { rows } = await db.query(
    "SELECT iniciado_em FROM sessao_treino WHERE id_sessao = $1",
    [idSessao]
  );

  const fim = new Date();
  const duracao = Math.max(
    0,
    Math.round((fim.getTime() - new Date(rows[0].iniciado_em).getTime()) / 1000)
  );

  await db.query(
    "UPDATE sessao_treino SET finalizado_em = $2, duracao_segundos = $3 WHERE id_sessao = $1",
    [idSessao, fim, duracao]
  );

  res.json(await carregarSessao(idSessao));
});

/** Descarta a sessão em andamento — para quem esqueceu o treino aberto. */
export const descartarSessao = asyncHandler(async (req, res) => {
  const idSessao = await buscarSessaoAberta(req.usuario.id);
  if (!idSessao) {
    throw erroConflito("Nenhum treino em andamento");
  }

  await db.query("DELETE FROM sessao_treino WHERE id_sessao = $1", [idSessao]);
  res.json({ message: "Treino descartado" });
});

/** Histórico de sessões do aluno logado. */
export const minhasSessoes = asyncHandler(async (req, res) => {
  res.json(await listarSessoesDe(req.usuario.id));
});

export const detalheDaMinhaSessao = asyncHandler(async (req, res) => {
  const dados = await carregarSessao(Number(req.params.id));
  if (!dados || dados.sessao.id_aluno !== req.usuario.id) {
    throw erroNaoEncontrado("Sessão não encontrada");
  }
  res.json(dados);
});

/* --------------------------------------------------- visão do professor */

export const sessoesDoAluno = asyncHandler(async (req, res) => {
  const idAluno = Number(req.params.id);

  const { rows: alunos } = await db.query(
    "SELECT id, nome FROM usuario WHERE id = $1 AND aluno = TRUE",
    [idAluno]
  );
  if (alunos.length === 0) {
    throw erroNaoEncontrado("Aluno não encontrado");
  }

  // O corte de 30 dias vem calculado daqui: comparar com intervalo em SQL
  // depende de sintaxe que varia entre bancos.
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const { rows: agregado } = await db.query(
    `SELECT COUNT(*)                           AS total,
            COALESCE(AVG(duracao_segundos), 0) AS media_duracao,
            MAX(iniciado_em)                   AS ultima
       FROM sessao_treino
      WHERE id_aluno = $1
        AND finalizado_em IS NOT NULL
        AND iniciado_em > $2`,
    [idAluno, desde]
  );

  res.json({
    aluno: alunos[0],
    ultimos30dias: {
      sessoes: Number(agregado[0].total),
      media_duracao_segundos: Math.round(Number(agregado[0].media_duracao)),
      ultima: agregado[0].ultima,
    },
    sessoes: await listarSessoesDe(idAluno),
  });
});

async function listarSessoesDe(idAluno) {
  const { rows } = await db.query(
    `SELECT s.id_sessao,
            s.iniciado_em,
            s.finalizado_em,
            s.duracao_segundos,
            u.nome AS nome_professor,
            COUNT(se.id)                                        AS total_exercicios,
            -- SUM(CASE) em vez de COUNT(...) FILTER: o banco emulado dos
            -- testes aceita o FILTER mas ignora o predicado, contando tudo.
            SUM(CASE WHEN se.concluido THEN 1 ELSE 0 END)        AS concluidos
       FROM sessao_treino s
       JOIN treino t  ON t.id_treino = s.id_treino
       JOIN usuario u ON u.id = t.id_professor
       LEFT JOIN sessao_exercicio se ON se.id_sessao = s.id_sessao
      WHERE s.id_aluno = $1 AND s.finalizado_em IS NOT NULL
      GROUP BY s.id_sessao, s.iniciado_em, s.finalizado_em, s.duracao_segundos, u.nome
      ORDER BY s.iniciado_em DESC
      LIMIT 100`,
    [idAluno]
  );

  return rows.map((linha) => ({
    ...linha,
    total_exercicios: Number(linha.total_exercicios),
    concluidos: Number(linha.concluidos),
  }));
}
