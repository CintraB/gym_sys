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
  validarBlocosTreino,
  validarCadastroUsuario,
  validarExercicioCatalogo,
} from "../lib/validacao.js";
import { carregarBlocosDoTreino } from "./alunoController.js";

const CAMPOS_PUBLICOS = "id, nome, cpf, email, titulo, aluno, professor, ativo";

/* ------------------------------------------------------------------ alunos */

export const listarAlunos = asyncHandler(async (req, res) => {
  const busca = (req.query.busca ?? "").toString().trim();
  const incluirInativos = req.query.incluirInativos === "true";

  const condicoes = ["u.aluno = TRUE"];
  const valores = [];

  if (!incluirInativos) {
    condicoes.push("u.ativo = TRUE");
  }
  if (busca) {
    valores.push(`%${busca}%`, `%${normalizarDigitos(busca) || busca}%`);
    condicoes.push(`(u.nome ILIKE $${valores.length - 1} OR u.cpf LIKE $${valores.length})`);
  }

  // ultima_sessao alimenta o "treinou há X dias" da lista — o professor vê de
  // relance quem sumiu da academia.
  const { rows } = await db.query(
    `SELECT u.id, u.nome, u.cpf, u.email, u.titulo, u.aluno, u.professor, u.ativo,
            s.ultima_sessao
       FROM usuario u
       LEFT JOIN (
            SELECT id_aluno, MAX(iniciado_em) AS ultima_sessao
              FROM sessao_treino
             WHERE finalizado_em IS NOT NULL
             GROUP BY id_aluno
       ) s ON s.id_aluno = u.id
      WHERE ${condicoes.join(" AND ")}
      ORDER BY u.nome`,
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
 * Acrescenta um exercício ao catálogo.
 *
 * O catálogo vinha só do seed: faltando um item, a única saída era SQL na mão —
 * e faltou ("prancha lateral", "remador" foram escritos à mão na ficha).
 *
 * O grupo muscular é fechado nos que já existem, conferido aqui e não só no
 * front, senão um POST direto criaria um grupo novo e o select passaria a ter
 * uma seção com um item só.
 */
export const cadastrarExercicio = asyncHandler(async (req, res) => {
  const { nomeExercicio, tipo, observacao } = validarExercicioCatalogo(req.body);

  const { rows: grupos } = await db.query(
    "SELECT 1 FROM exercicio WHERE tipo = $1 LIMIT 1",
    [tipo]
  );
  if (grupos.length === 0) {
    throw erroRequisicao("Grupo muscular não existe no catálogo");
  }

  // Único por (nome, grupo), não pelo nome sozinho: CROSS OVER existe em BÍCEPS
  // e em TRÍCEPS, então exercicio.nome_exercicio não tem — nem pode ter — UNIQUE.
  const { rows: repetidos } = await db.query(
    "SELECT 1 FROM exercicio WHERE nome_exercicio = $1 AND tipo = $2 LIMIT 1",
    [nomeExercicio, tipo]
  );
  if (repetidos.length > 0) {
    throw erroConflito("Esse exercício já existe nesse grupo muscular");
  }

  const { rows } = await db.query(
    `INSERT INTO exercicio (nome_exercicio, tipo, observacao)
     VALUES ($1, $2, $3)
     RETURNING id_exercicio, nome_exercicio, tipo`,
    [nomeExercicio, tipo, observacao]
  );

  res.status(201).json(rows[0]);
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

  const blocos = validarBlocosTreino(req.body);

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

    for (const bloco of blocos) {
      const { rows: blocoCriado } = await cliente.query(
        "INSERT INTO treino_bloco (id_treino, letra, nome, ordem) VALUES ($1, $2, $3, $4) RETURNING id_bloco",
        [idTreino, bloco.letra, bloco.nome, bloco.ordem]
      );
      const idBloco = blocoCriado[0].id_bloco;

      const valores = [];
      const grupos = bloco.exercicios.map((exercicio) => {
        valores.push(
          idTreino,
          idBloco,
          idAluno,
          exercicio.id_exercicio,
          exercicio.numero_serie,
          exercicio.repeticoes,
          exercicio.carga,
          exercicio.observacao_ex_usuario
        );
        const base = valores.length - 8;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
      });

      await cliente.query(
        `INSERT INTO ex_usuario
           (id_treino, id_bloco, id_user, id_exercicio, numero_serie, repeticoes, carga, observacao_ex_usuario)
         VALUES ${grupos.join(", ")}`,
        valores
      );
    }

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

/**
 * Edita o treino no lugar, sem criar outro.
 *
 * Antes, corrigir uma carga exigia remontar a ficha inteira: o POST desativa o
 * treino anterior e cria um novo, então o aluno perdia a continuidade e o
 * histórico ganhava um treino a mais que nunca existiu de fato.
 *
 * Cada bloco e cada exercício pode vir com o id da linha que já existe:
 * com id, atualiza; sem id, é acréscimo. O que não vier de volta é desativado —
 * nunca apagado, porque `sessao_exercicio` referencia `ex_usuario` com
 * ON DELETE CASCADE e `sessao_treino` aponta para `treino_bloco`: um DELETE
 * aqui levaria junto o registro do que o aluno já executou.
 *
 * Sessão em andamento não é bloqueada. Ela já materializou as próprias linhas
 * na abertura, então segue como está e a mudança vale da próxima — travar a
 * edição porque o aluno abriu o app deixaria o professor refém do horário dele.
 */
export const editarTreino = asyncHandler(async (req, res) => {
  const idTreino = Number(req.params.id);
  const blocos = validarBlocosTreino(req.body);

  const cliente = await db.connect();
  try {
    await cliente.query("BEGIN");

    const { rows: treinos } = await cliente.query(
      "SELECT id_aluno, ativo FROM treino WHERE id_treino = $1",
      [idTreino]
    );
    if (treinos.length === 0) {
      throw erroNaoEncontrado("Treino não encontrado");
    }
    // Treino inativo é histórico, não rascunho: editá-lo reescreveria o que o
    // aluno já executou sob outra prescrição.
    if (!treinos[0].ativo) {
      throw erroConflito("Treino inativo não pode ser editado");
    }
    const idAluno = treinos[0].id_aluno;

    const { rows: blocosAtuais } = await cliente.query(
      "SELECT id_bloco FROM treino_bloco WHERE id_treino = $1 AND ativo = TRUE",
      [idTreino]
    );
    const { rows: exerciciosAtuais } = await cliente.query(
      "SELECT id FROM ex_usuario WHERE id_treino = $1 AND ativo = TRUE",
      [idTreino]
    );

    conferirIdsDoTreino(blocos, blocosAtuais, exerciciosAtuais);

    const blocosMantidos = new Set(blocos.map((bloco) => bloco.id_bloco).filter(Boolean));
    const exerciciosMantidos = new Set(
      blocos.flatMap((bloco) => bloco.exercicios.map((e) => e.id)).filter(Boolean)
    );

    // Desativar vem antes de mexer nas letras: bloco inativo sai do índice único
    // parcial, e só então a letra dele fica livre para quem tomou o lugar.
    for (const { id } of exerciciosAtuais) {
      if (exerciciosMantidos.has(id)) continue;
      await cliente.query(
        `UPDATE ex_usuario SET ativo = FALSE, atualizado_em = NOW(), atualizado_por = $1
          WHERE id = $2 AND id_treino = $3`,
        [req.usuario.id, id, idTreino]
      );
    }
    for (const { id_bloco: idBloco } of blocosAtuais) {
      if (blocosMantidos.has(idBloco)) continue;
      await cliente.query(
        "UPDATE treino_bloco SET ativo = FALSE WHERE id_bloco = $1 AND id_treino = $2",
        [idBloco, idTreino]
      );
    }

    // Letras definitivas só no fim: reordenar A e B tentaria gravar "B" enquanto
    // o B antigo ainda existe. A temporária tira todo mundo do caminho primeiro.
    const letrasFinais = [];

    for (const bloco of blocos) {
      let idBloco = bloco.id_bloco;
      const letraTemporaria = `#${bloco.ordem}`;

      if (idBloco === null) {
        const { rows } = await cliente.query(
          "INSERT INTO treino_bloco (id_treino, letra, nome, ordem) VALUES ($1, $2, $3, $4) RETURNING id_bloco",
          [idTreino, letraTemporaria, bloco.nome, bloco.ordem]
        );
        idBloco = rows[0].id_bloco;
      } else {
        await cliente.query(
          "UPDATE treino_bloco SET letra = $1, nome = $2, ordem = $3 WHERE id_bloco = $4 AND id_treino = $5",
          [letraTemporaria, bloco.nome, bloco.ordem, idBloco, idTreino]
        );
      }
      // A letra vem da posição no array, como no cadastro: removido o B de um
      // A/B/C, o C passa a ser o B.
      letrasFinais.push([bloco.letra, idBloco]);

      for (const exercicio of bloco.exercicios) {
        if (exercicio.id === null) {
          await cliente.query(
            `INSERT INTO ex_usuario
               (id_treino, id_bloco, id_user, id_exercicio, numero_serie, repeticoes, carga, observacao_ex_usuario)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              idTreino,
              idBloco,
              idAluno,
              exercicio.id_exercicio,
              exercicio.numero_serie,
              exercicio.repeticoes,
              exercicio.carga,
              exercicio.observacao_ex_usuario,
            ]
          );
          continue;
        }

        // id_bloco entra no UPDATE para permitir mover o exercício de bloco.
        await cliente.query(
          `UPDATE ex_usuario
              SET id_bloco = $1, id_exercicio = $2, numero_serie = $3, repeticoes = $4,
                  carga = $5, observacao_ex_usuario = $6,
                  atualizado_em = NOW(), atualizado_por = $7
            WHERE id = $8 AND id_treino = $9`,
          [
            idBloco,
            exercicio.id_exercicio,
            exercicio.numero_serie,
            exercicio.repeticoes,
            exercicio.carga,
            exercicio.observacao_ex_usuario,
            req.usuario.id,
            exercicio.id,
            idTreino,
          ]
        );
      }
    }

    for (const [letra, idBloco] of letrasFinais) {
      await cliente.query(
        "UPDATE treino_bloco SET letra = $1 WHERE id_bloco = $2 AND id_treino = $3",
        [letra, idBloco, idTreino]
      );
    }

    await cliente.query("COMMIT");
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }

  res.json({
    message: "Treino atualizado com sucesso",
    id_treino: idTreino,
    blocos: await carregarBlocosDoTreino(idTreino),
  });
});

/**
 * Recusa ids que não são deste treino, antes de qualquer escrita.
 *
 * É o que impede o PUT de virar IDOR de escrita: sem esta conferência, mandar o
 * id de um ex_usuario alheio faria UPDATE na ficha de outro aluno. A repetição
 * do mesmo id também é recusada — duas linhas apontando para o mesmo registro
 * gravariam uma por cima da outra em silêncio.
 */
function conferirIdsDoTreino(blocos, blocosAtuais, exerciciosAtuais) {
  const blocosDoTreino = new Set(blocosAtuais.map((b) => b.id_bloco));
  const exerciciosDoTreino = new Set(exerciciosAtuais.map((e) => e.id));
  const vistos = { blocos: new Set(), exercicios: new Set() };

  for (const bloco of blocos) {
    if (bloco.id_bloco !== null) {
      if (!blocosDoTreino.has(bloco.id_bloco)) {
        throw erroRequisicao(`Bloco ${bloco.letra}: não faz parte deste treino`);
      }
      if (vistos.blocos.has(bloco.id_bloco)) {
        throw erroRequisicao(`Bloco ${bloco.letra}: identificador repetido`);
      }
      vistos.blocos.add(bloco.id_bloco);
    }

    for (const exercicio of bloco.exercicios) {
      if (exercicio.id === null) continue;
      if (!exerciciosDoTreino.has(exercicio.id)) {
        throw erroRequisicao(`Bloco ${bloco.letra}: exercício não faz parte deste treino`);
      }
      if (vistos.exercicios.has(exercicio.id)) {
        throw erroRequisicao(`Bloco ${bloco.letra}: exercício repetido`);
      }
      vistos.exercicios.add(exercicio.id);
    }
  }
}

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
    return res.json({ treino: null, blocos: [] });
  }

  res.json({ treino, blocos: await carregarBlocosDoTreino(treino.id_treino) });
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
