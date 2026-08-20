/**
 * Sobe a API com um Postgres em memória e dados de exemplo.
 *
 * Serve para testar a aplicação inteira (inclusive pelo celular na rede local)
 * sem precisar instalar e configurar o PostgreSQL. Nada é persistido: ao parar
 * o processo, os dados somem.
 *
 *   npm run demo
 *
 * Logins criados:
 *   professor -> CPF 11111111111 / senha demo123
 *   aluno     -> CPF 22222222222 / senha demo123
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";

process.env.DB_USER ??= "demo";
process.env.DB_HOST ??= "localhost";
process.env.DB_NAME ??= "demo";
process.env.DB_PASSWORD ??= "demo";
process.env.DB_PORT ??= "5432";
process.env.TOKEN_SEG ??= "segredo-apenas-do-modo-demo";

const { configurarPool } = await import("../src/config/db.js");
const { criarApp } = await import("../src/app.js");
const { criarHashComSal } = await import("../src/lib/senha.js");

const caminho = (relativo) => fileURLToPath(new URL(relativo, import.meta.url));

const memoria = newDb();
memoria.public.none(readFileSync(caminho("../db/schema.sql"), "utf8"));
memoria.public.none(readFileSync(caminho("../db/seed.sql"), "utf8"));

const { Pool } = memoria.adapters.createPg();
const pool = new Pool();
configurarPool(pool);

const senha = await criarHashComSal("demo123");

await pool.query(
  // O primeiro nasce com os tres perfis: e quem administra, da aula e treina.
  `INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo) VALUES
     ('11111111111', 'Cristhian Cintra', $1, 'professor@demo.com', '111111111111', TRUE,  TRUE,  TRUE,  TRUE),
     ('22222222222', 'Ana Souza',        $1, 'ana@demo.com',       '222222222222', TRUE,  FALSE, FALSE, TRUE),
     ('33333333333', 'Bruno Lima',       $1, 'bruno@demo.com',     '333333333333', TRUE,  FALSE, FALSE, TRUE),
     ('44444444444', 'Carla Dias',       $1, 'carla@demo.com',     '444444444444', TRUE,  FALSE, FALSE, TRUE)`,
  [senha]
);

// Treino pronto para a Ana, para a tela do aluno não abrir vazia.
const { rows: treinos } = await pool.query(
  "INSERT INTO treino (id_aluno, id_professor) VALUES (2, 1) RETURNING id_treino"
);
const idTreino = treinos[0].id_treino;

// Todo treino tem pelo menos um bloco: ex_usuario.id_bloco é NOT NULL desde a
// divisão A/B/C/D. Sem divisão, os exercícios ficam num "A" sozinho.
const { rows: blocos } = await pool.query(
  "INSERT INTO treino_bloco (id_treino, letra, ordem) VALUES ($1, 'A', 1) RETURNING id_bloco",
  [idTreino]
);
const idBloco = blocos[0].id_bloco;

// Os ids seguem a ordem de db/seed.sql.
await pool.query(
  `INSERT INTO ex_usuario (id_treino, id_bloco, id_user, id_exercicio, numero_serie, repeticoes, carga, observacao_ex_usuario) VALUES
     ($1, $2, 2,  1, 4, '10 a 15', 30, 'Descanso de 60s'),
     ($1, $2, 2,  8, 3, '12',      14, NULL),
     ($1, $2, 2, 40, 4, '10 a 15', 45, 'Pegada aberta'),
     ($1, $2, 2, 13, 3, '12 a 15', 12, NULL),
     ($1, $2, 2, 58, 4, '8 a 10',  60, 'Cuidado com a lombar'),
     ($1, $2, 2, 36, 0, '',         0, '20 min / moderado')`,
  [idTreino, idBloco]
);

// Pedido em aberto do Bruno, para a tela de pedidos ter conteúdo.
await pool.query(
  "INSERT INTO pedido_treino (id_aluno, observacao) VALUES (3, $1)",
  ["Machucado na patela do joelho esquerdo, queria evitar agachamento livre."]
);

const porta = Number(process.env.PORTA ?? 8080);

// CORS aberto só aqui: permite abrir o front pelo IP da rede local
// (http://192.168.x.x:5173) direto do celular sem configurar nada.
criarApp({ origensCors: "*" }).listen(porta, "0.0.0.0", () => {
  console.log(`\n  MODO DEMO — dados em memória, nada é salvo em disco.`);
  console.log(`  API:   http://localhost:${porta}  (CORS aberto)`);
  console.log(`\n  admin      CPF 111.111.111-11  senha demo123  (admin + professor + aluno)`);
  console.log(`  aluno      CPF 222.222.222-22  senha demo123\n`);
});
