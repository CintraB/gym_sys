/**
 * Popula o banco configurado com dados de exemplo para testar a aplicação.
 *
 *   npm run dados-exemplo
 *
 * É seguro rodar mais de uma vez: usuários que já existem são pulados, e nada
 * é apagado. Não é o seed do catálogo de exercícios (esse é db/seed.sql, que
 * roda sozinho na criação do banco) — aqui são pessoas e treinos fictícios.
 *
 * NÃO use em um banco com dados reais: cria contas com senha conhecida.
 */
import { db } from "../src/config/db.js";
import { criarHashComSal } from "../src/lib/senha.js";

const SENHA = "senha123";

const PESSOAS = [
  { cpf: "11111111111", nome: "Cristhian Cintra", email: "cristhian@exemplo.com", titulo: "111111111111", professor: true },
  { cpf: "99999999911", nome: "Marina Alves",     email: "marina@exemplo.com",    titulo: "999999999911", professor: true },
  { cpf: "22222222222", nome: "Ana Souza",        email: "ana@exemplo.com",       titulo: "222222222222" },
  { cpf: "33333333333", nome: "Bruno Lima",       email: "bruno@exemplo.com",     titulo: "333333333333" },
  { cpf: "44444444444", nome: "Carla Dias",       email: "carla@exemplo.com",     titulo: "444444444444" },
  { cpf: "55555555555", nome: "Diego Rocha",      email: "diego@exemplo.com",     titulo: "555555555555" },
  { cpf: "66666666666", nome: "Elaine Costa",     email: "elaine@exemplo.com",    titulo: "666666666666", ativo: false },
];

// Ids seguem a ordem de db/seed.sql.
const TREINO_SUPERIOR = [
  { ex: 1,  series: 4, reps: "10 a 15", carga: 30, obs: "Descanso de 60s" },
  { ex: 8,  series: 3, reps: "12",      carga: 14, obs: null },
  { ex: 40, series: 4, reps: "10 a 15", carga: 45, obs: "Pegada aberta" },
  { ex: 13, series: 3, reps: "12 a 15", carga: 12, obs: null },
  { ex: 49, series: 3, reps: "12",      carga: 25, obs: "Cotovelo fixo" },
  { ex: 36, series: 0, reps: "",        carga: 0,  obs: "20 min / moderado" },
];

const TREINO_INFERIOR = [
  { ex: 58, series: 4, reps: "8 a 10",  carga: 60, obs: "Cuidado com a lombar" },
  { ex: 64, series: 4, reps: "12",      carga: 120, obs: null },
  { ex: 63, series: 3, reps: "12 a 15", carga: 35, obs: null },
  { ex: 68, series: 3, reps: "12",      carga: 30, obs: null },
  { ex: 67, series: 4, reps: "15 a 20", carga: 40, obs: "Segurar 2s no topo" },
];

const TREINO_ANTIGO = [
  { ex: 9,  series: 3, reps: "12",      carga: 20, obs: null },
  { ex: 41, series: 3, reps: "12",      carga: 35, obs: null },
  { ex: 59, series: 3, reps: "12",      carga: 40, obs: null },
];

async function garantirPessoa(pessoa) {
  const { rows: existentes } = await db.query("SELECT id FROM usuario WHERE cpf = $1", [pessoa.cpf]);
  if (existentes.length > 0) {
    return { id: existentes[0].id, criado: false };
  }

  const { rows } = await db.query(
    `INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, ativo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      pessoa.cpf,
      pessoa.nome,
      await criarHashComSal(SENHA),
      pessoa.email,
      pessoa.titulo,
      !pessoa.professor,
      Boolean(pessoa.professor),
      pessoa.ativo ?? true,
    ]
  );

  return { id: rows[0].id, criado: true };
}

async function criarTreino({ idAluno, idProfessor, exercicios, ativo = true, diasAtras = 0 }) {
  const { rows } = await db.query(
    `INSERT INTO treino (id_aluno, id_professor, ativo, criado_em)
     VALUES ($1, $2, $3, NOW() - ($4 || ' days')::INTERVAL)
     RETURNING id_treino`,
    [idAluno, idProfessor, ativo, diasAtras]
  );
  const idTreino = rows[0].id_treino;

  // Todo treino tem pelo menos um bloco desde a divisão A/B/C/D: ex_usuario.id_bloco
  // é NOT NULL. Sem divisão declarada, os exercícios entram num "A" sozinho.
  const { rows: blocos } = await db.query(
    `INSERT INTO treino_bloco (id_treino, letra, nome, ordem)
     VALUES ($1, 'A', NULL, 1)
     RETURNING id_bloco`,
    [idTreino]
  );
  const idBloco = blocos[0].id_bloco;

  for (const item of exercicios) {
    await db.query(
      `INSERT INTO ex_usuario
         (id_treino, id_bloco, id_user, id_exercicio, numero_serie, repeticoes, carga, observacao_ex_usuario, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [idTreino, idBloco, idAluno, item.ex, item.series, item.reps, item.carga, item.obs, ativo]
    );
  }

  return idTreino;
}

try {
  const ids = {};
  const novos = [];

  for (const pessoa of PESSOAS) {
    const { id, criado } = await garantirPessoa(pessoa);
    ids[pessoa.cpf] = id;
    if (criado) novos.push(pessoa.nome);
  }

  const professor = ids["11111111111"];

  // Só monta treinos e pedidos para quem ainda não tem, para o script poder
  // rodar de novo sem duplicar nada.
  const semTreino = async (idAluno) => {
    const { rows } = await db.query("SELECT 1 FROM treino WHERE id_aluno = $1", [idAluno]);
    return rows.length === 0;
  };

  // Ana: treino de superiores em dia.
  if (await semTreino(ids["22222222222"])) {
    await criarTreino({
      idAluno: ids["22222222222"],
      idProfessor: professor,
      exercicios: TREINO_SUPERIOR,
      diasAtras: 12,
    });
  }

  // Carla: treino atual + um antigo, para a tela de histórico ter conteúdo.
  if (await semTreino(ids["44444444444"])) {
    await criarTreino({
      idAluno: ids["44444444444"],
      idProfessor: professor,
      exercicios: TREINO_ANTIGO,
      ativo: false,
      diasAtras: 95,
    });
    await criarTreino({
      idAluno: ids["44444444444"],
      idProfessor: ids["99999999911"],
      exercicios: TREINO_INFERIOR,
      diasAtras: 5,
    });
  }

  // Bruno: pedido em aberto, ainda sem treino.
  const { rows: pedidos } = await db.query(
    "SELECT 1 FROM pedido_treino WHERE id_aluno = $1 AND ativo = TRUE",
    [ids["33333333333"]]
  );
  if (pedidos.length === 0) {
    await db.query(
      `INSERT INTO pedido_treino (id_aluno, observacao, ativo, criado_em)
       VALUES ($1, $2, TRUE, NOW() - INTERVAL '2 days')`,
      [
        ids["33333333333"],
        "Machucado na patela do joelho esquerdo, queria evitar agachamento livre.",
      ]
    );
  }

  console.log(
    novos.length > 0
      ? `Criados: ${novos.join(", ")}`
      : "Nenhum usuário novo — todos já existiam."
  );
  // Quem já existia mantém a senha original — o script nunca sobrescreve.
  console.log(`\nSenha dos usuários criados por este script: ${SENHA}\n`);
  console.log("  professor  111.111.111-11  Cristhian Cintra");
  console.log("  professor  999.999.999-11  Marina Alves");
  console.log("  aluno      222.222.222-22  Ana Souza      treino de superiores");
  console.log("  aluno      333.333.333-33  Bruno Lima     pedido em aberto, sem treino");
  console.log("  aluno      444.444.444-44  Carla Dias     treino atual + histórico");
  console.log("  aluno      555.555.555-55  Diego Rocha    sem treino e sem pedido");
  console.log("  aluno      666.666.666-66  Elaine Costa   inativa (login recusado, por design)");
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
