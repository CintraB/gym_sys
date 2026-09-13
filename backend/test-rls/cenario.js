/**
 * O cenário mínimo que exercita as políticas: dois alunos, um professor, um
 * admin e um inativo; uma ficha por aluno; uma sessão finalizada por aluno.
 *
 * Ids fixos de propósito: os testes falam "o treino 1 é do aluno 1", e um id
 * gerado tornaria as asserções ilegíveis.
 */
export async function cenario(pool) {
  await pool.query(`
    INSERT INTO usuario (id, nome, senha, cpf, email, titulo, aluno, professor, admin, ativo)
    VALUES (1, 'Aluno Um',  'x', '11111111111', 'a1@b.c', '111111111111', TRUE,  FALSE, FALSE, TRUE),
           (2, 'Professor', 'x', '22222222222', 'p@b.c',  '222222222222', FALSE, TRUE,  FALSE, TRUE),
           (3, 'Aluno Dois','x', '33333333333', 'a2@b.c', '333333333333', TRUE,  FALSE, FALSE, TRUE),
           (4, 'Inativo',   'x', '44444444444', 'i@b.c',  '444444444444', TRUE,  FALSE, FALSE, FALSE),
           (5, 'Admin',     'x', '55555555555', 'd@b.c',  '555555555555', FALSE, FALSE, TRUE,  TRUE)`);

  await pool.query(`
    INSERT INTO treino (id_treino, id_aluno, id_professor)
    VALUES (1, 1, 2), (2, 3, 2)`);

  await pool.query(`
    INSERT INTO treino_bloco (id_bloco, id_treino, letra, nome, ordem)
    VALUES (1, 1, 'A', 'Peito', 1), (2, 2, 'A', 'Costas', 1)`);

  await pool.query(`
    INSERT INTO ex_usuario (id, id_treino, id_bloco, id_user, id_exercicio, numero_serie, repeticoes)
    VALUES (1, 1, 1, 1, 1, 3, '10'), (2, 2, 2, 3, 1, 3, '10')`);

  await pool.query(`
    INSERT INTO sessao_treino (id_sessao, id_treino, id_bloco, id_aluno, finalizado_em, duracao_segundos)
    VALUES (1, 1, 1, 1, NOW(), 3600), (2, 2, 2, 3, NOW(), 3600)`);

  await pool.query(`
    INSERT INTO sessao_exercicio (id, id_sessao, id_ex_usuario, concluido)
    VALUES (1, 1, 1, TRUE), (2, 2, 2, TRUE)`);

  await pool.query(`
    INSERT INTO sessao_serie (id, id_sessao_exercicio, carga, repeticoes)
    VALUES (1, 1, 20, '10'), (2, 2, 20, '10')`);

  await pool.query(`
    INSERT INTO pedido_treino (id_pedido, id_aluno, ativo) VALUES (1, 1, TRUE), (2, 3, TRUE)`);

  // As sequências ficam atrás dos ids fixos: sem isto, o primeiro INSERT sem id
  // explícito colide com uma linha do cenário, e o erro parece bug de política.
  for (const [tabela, coluna] of [
    ["usuario", "id"],
    ["treino", "id_treino"],
    ["treino_bloco", "id_bloco"],
    ["ex_usuario", "id"],
    ["sessao_treino", "id_sessao"],
    ["sessao_exercicio", "id"],
    ["sessao_serie", "id"],
    ["pedido_treino", "id_pedido"],
  ]) {
    await pool.query(
      `SELECT setval(pg_get_serial_sequence($1, $2),
                     coalesce((SELECT max(${coluna}) FROM ${tabela}), 1))`,
      [tabela, coluna],
    );
  }
}
