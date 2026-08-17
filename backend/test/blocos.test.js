import test from "node:test";
import assert from "node:assert/strict";
import { criarApiDeTeste, criarProfessorELogar } from "./helpers.js";

const ALUNO = {
  cpf: "22222222222",
  nome: "Aluno Teste",
  senha: "senha123",
  email: "aluno@teste.com",
  titulo: "222222222222",
};

const ex = (id) => ({ id_exercicio: id, numero_serie: 3, repeticoes: "10", carga: 10 });

/** Treino ABCD, um exercício distinto por bloco para dar para rastrear. */
const ABCD = [
  { nome: "Peito e Tríceps", exercicios: [ex(1), ex(49)] },
  { nome: "Costas e Bíceps", exercicios: [ex(40), ex(13)] },
  { nome: "Perna", exercicios: [ex(58)] },
  { nome: null, exercicios: [ex(24), ex(35)] },
];

async function cenario({ blocos = ABCD } = {}) {
  const api = await criarApiDeTeste();
  const tokenProfessor = await criarProfessorELogar(api);

  const criado = await api.post("/professores/alunos", ALUNO, { token: tokenProfessor });
  const idAluno = criado.corpo.aluno.id;
  const login = await api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha });

  const treino = await api.post(
    "/professores/treino",
    { id_aluno: idAluno, blocos },
    { token: tokenProfessor }
  );
  assert.equal(treino.status, 201, JSON.stringify(treino.corpo));

  return { api, tokenProfessor, idAluno, token: login.corpo.token };
}

test("treino dividido guarda letra, nome e ordem", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const { corpo } = await api.get("/alunos/meutreino", { token });

  assert.deepEqual(
    corpo.blocos.map((b) => b.letra),
    ["A", "B", "C", "D"]
  );
  assert.equal(corpo.blocos[0].nome, "Peito e Tríceps");
  assert.equal(corpo.blocos[3].nome, null, "nome é opcional");
  assert.deepEqual(
    corpo.blocos.map((b) => b.exercicios.length),
    [2, 2, 1, 2]
  );
});

test("as letras vêm da posição, não do que o cliente mandar", async (t) => {
  const { api, token } = await cenario({
    blocos: [
      { letra: "Z", nome: "Primeiro", exercicios: [ex(1)] },
      { letra: "Z", nome: "Segundo", exercicios: [ex(2)] },
    ],
  });
  t.after(() => api.encerrar());

  const { corpo } = await api.get("/alunos/meutreino", { token });

  assert.deepEqual(
    corpo.blocos.map((b) => b.letra),
    ["A", "B"],
    "duas letras iguais no corpo não podem virar dois blocos com a mesma letra"
  );
});

test("formato antigo continua funcionando como bloco único", async (t) => {
  const api = await criarApiDeTeste();
  t.after(() => api.encerrar());
  const tokenProfessor = await criarProfessorELogar(api);
  const criado = await api.post("/professores/alunos", ALUNO, { token: tokenProfessor });
  const login = await api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha });

  const treino = await api.post(
    "/professores/treino",
    { id_aluno: criado.corpo.aluno.id, exercicios: [ex(1), ex(2)] },
    { token: tokenProfessor }
  );
  assert.equal(treino.status, 201);

  const { corpo } = await api.get("/alunos/meutreino", { token: login.corpo.token });
  assert.equal(corpo.blocos.length, 1);
  assert.equal(corpo.blocos[0].letra, "A");
  assert.equal(corpo.blocos[0].nome, null);
  assert.equal(corpo.blocos[0].exercicios.length, 2);
});

test("erro em exercício diz de qual bloco", async (t) => {
  const api = await criarApiDeTeste();
  t.after(() => api.encerrar());
  const tokenProfessor = await criarProfessorELogar(api);
  const criado = await api.post("/professores/alunos", ALUNO, { token: tokenProfessor });

  const resposta = await api.post(
    "/professores/treino",
    {
      id_aluno: criado.corpo.aluno.id,
      blocos: [
        { exercicios: [ex(1)] },
        { exercicios: [ex(1), { id_exercicio: 2, numero_serie: -5, repeticoes: "10" }] },
      ],
    },
    { token: tokenProfessor }
  );

  assert.equal(resposta.status, 400);
  assert.match(resposta.corpo.message, /Bloco B/);
  assert.match(resposta.corpo.message, /Exercício 2/);
});

test("limite de blocos por treino", async (t) => {
  const api = await criarApiDeTeste();
  t.after(() => api.encerrar());
  const tokenProfessor = await criarProfessorELogar(api);
  const criado = await api.post("/professores/alunos", ALUNO, { token: tokenProfessor });

  const resposta = await api.post(
    "/professores/treino",
    {
      id_aluno: criado.corpo.aluno.id,
      blocos: Array.from({ length: 9 }, () => ({ exercicios: [ex(1)] })),
    },
    { token: tokenProfessor }
  );

  assert.equal(resposta.status, 400);
  assert.match(resposta.corpo.message, /blocos/);
});

/* ------------------------------------------------------- execução */

test("a sessão leva só os exercícios do bloco escolhido", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const { corpo: treino } = await api.get("/alunos/meutreino", { token });
  const blocoC = treino.blocos.find((b) => b.letra === "C");

  const sessao = await api.post("/alunos/treino/sessao", { id_bloco: blocoC.id_bloco }, { token });

  assert.equal(sessao.status, 201);
  assert.equal(sessao.corpo.exercicios.length, 1, "o bloco C tem um exercício só");
  assert.equal(sessao.corpo.sessao.bloco_letra, "C");
  assert.equal(sessao.corpo.sessao.bloco_nome, "Perna");
});

test("não dá para iniciar um bloco que não é do seu treino", async (t) => {
  const { api, tokenProfessor, token } = await cenario();
  t.after(() => api.encerrar());

  // Bloco de outro aluno.
  const outro = await api.post(
    "/professores/alunos",
    { ...ALUNO, cpf: "33333333333", titulo: "333333333333", email: "o@teste.com" },
    { token: tokenProfessor }
  );
  await api.post(
    "/professores/treino",
    { id_aluno: outro.corpo.aluno.id, blocos: [{ nome: "Alheio", exercicios: [ex(5)] }] },
    { token: tokenProfessor }
  );
  const loginOutro = await api.post("/login", { cpf: "33333333333", senha: ALUNO.senha });
  const treinoAlheio = await api.get("/alunos/meutreino", { token: loginOutro.corpo.token });
  const blocoAlheio = treinoAlheio.corpo.blocos[0].id_bloco;

  const invasao = await api.post("/alunos/treino/sessao", { id_bloco: blocoAlheio }, { token });

  assert.equal(invasao.status, 404);
});

test("sem bloco informado, usa a sugestão", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const sessao = await api.post("/alunos/treino/sessao", null, { token });

  assert.equal(sessao.status, 201);
  assert.equal(sessao.corpo.sessao.bloco_letra, "A", "sem histórico, começa pelo primeiro");
});

/* ------------------------------------------------------- sugestão */

test("a sugestão avança para o bloco seguinte ao último feito", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const letras = [];
  for (let i = 0; i < 4; i += 1) {
    const inicial = await api.get("/alunos/meutreino", { token });
    const sugerido = inicial.corpo.blocos.find(
      (b) => b.id_bloco === inicial.corpo.bloco_sugerido
    );
    letras.push(sugerido.letra);

    await api.post("/alunos/treino/sessao", { id_bloco: sugerido.id_bloco }, { token });
    await api.post("/alunos/treino/sessao/finalizar", null, { token });
  }

  assert.deepEqual(letras, ["A", "B", "C", "D"]);
});

test("depois do último bloco, a sugestão volta ao primeiro", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const { corpo: treino } = await api.get("/alunos/meutreino", { token });
  const blocoD = treino.blocos.find((b) => b.letra === "D");

  await api.post("/alunos/treino/sessao", { id_bloco: blocoD.id_bloco }, { token });
  await api.post("/alunos/treino/sessao/finalizar", null, { token });

  const depois = await api.get("/alunos/meutreino", { token });
  const sugerido = depois.corpo.blocos.find((b) => b.id_bloco === depois.corpo.bloco_sugerido);

  assert.equal(sugerido.letra, "A");
});

test("sessão descartada não move a sugestão", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const { corpo: antes } = await api.get("/alunos/meutreino", { token });
  await api.post("/alunos/treino/sessao", null, { token });
  await api.requisicao("DELETE", "/alunos/treino/sessao", { token });

  const { corpo: depois } = await api.get("/alunos/meutreino", { token });
  assert.equal(depois.bloco_sugerido, antes.bloco_sugerido, "só sessão finalizada conta");
});

/* -------------------------------------------------------- histórico */

test("histórico mostra qual bloco foi feito", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const { corpo: treino } = await api.get("/alunos/meutreino", { token });
  const blocoB = treino.blocos.find((b) => b.letra === "B");

  await api.post("/alunos/treino/sessao", { id_bloco: blocoB.id_bloco }, { token });
  await api.post("/alunos/treino/sessao/finalizar", null, { token });

  const { corpo: sessoes } = await api.get("/alunos/sessoes", { token });

  assert.equal(sessoes.length, 1);
  assert.equal(sessoes[0].bloco_letra, "B");
  assert.equal(sessoes[0].bloco_nome, "Costas e Bíceps");
  assert.equal(sessoes[0].total_exercicios, 2);
});

test("professor vê o treino do aluno dividido em blocos", async (t) => {
  const { api, tokenProfessor, idAluno } = await cenario();
  t.after(() => api.encerrar());

  const { corpo } = await api.get(`/professores/aluno/${idAluno}/treino`, {
    token: tokenProfessor,
  });

  assert.equal(corpo.blocos.length, 4);
  assert.equal(corpo.blocos[1].nome, "Costas e Bíceps");
});
