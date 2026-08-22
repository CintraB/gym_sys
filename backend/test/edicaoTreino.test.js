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

const ex = (id, extras = {}) => ({
  id_exercicio: id,
  numero_serie: 3,
  repeticoes: "10 a 12",
  carga: 20,
  ...extras,
});

const ABC = [
  { nome: "Peito", exercicios: [ex(1), ex(8)] },
  { nome: "Costas", exercicios: [ex(40)] },
  { nome: null, exercicios: [ex(58)] },
];

/** Professor, aluno e um treino A/B/C montado, já lido de volta com os ids. */
async function cenario({ blocos = ABC } = {}) {
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

  const atual = await api.get(`/professores/aluno/${idAluno}/treino`, { token: tokenProfessor });

  return {
    api,
    tokenProfessor,
    idAluno,
    token: login.corpo.token,
    idTreino: treino.corpo.id_treino,
    blocos: atual.corpo.blocos,
  };
}

/** Reconstrói o payload de edição a partir do que o GET devolveu. */
const comoPayload = (blocos) =>
  blocos.map((bloco) => ({
    id_bloco: bloco.id_bloco,
    nome: bloco.nome,
    exercicios: bloco.exercicios.map((e) => ({
      id: e.id,
      id_exercicio: e.id_exercicio,
      numero_serie: e.numero_serie,
      repeticoes: e.repeticoes,
      carga: e.carga,
      observacao_ex_usuario: e.observacao_ex_usuario,
    })),
  }));

const lerTreino = (api, idAluno, token) =>
  api.get(`/professores/aluno/${idAluno}/treino`, { token }).then((r) => r.corpo);

test("altera a carga sem criar um treino novo", async (t) => {
  const { api, tokenProfessor, idAluno, idTreino, blocos } = await cenario();
  t.after(() => api.encerrar());

  const payload = comoPayload(blocos);
  payload[0].exercicios[0].carga = 45;

  const resposta = await api.put(
    `/professores/treino/${idTreino}`,
    { blocos: payload },
    { token: tokenProfessor }
  );

  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

  const depois = await lerTreino(api, idAluno, tokenProfessor);
  assert.equal(depois.treino.id_treino, idTreino, "o treino tem que ser o mesmo");
  assert.equal(depois.blocos[0].exercicios[0].carga, 45);
  assert.equal(depois.blocos[0].exercicios[0].id, blocos[0].exercicios[0].id, "a linha é a mesma");
});

test("troca o exercício de uma linha existente", async (t) => {
  const { api, tokenProfessor, idAluno, idTreino, blocos } = await cenario();
  t.after(() => api.encerrar());

  const payload = comoPayload(blocos);
  payload[0].exercicios[0].id_exercicio = 13;

  const resposta = await api.put(
    `/professores/treino/${idTreino}`,
    { blocos: payload },
    { token: tokenProfessor }
  );
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

  const depois = await lerTreino(api, idAluno, tokenProfessor);
  assert.equal(depois.blocos[0].exercicios[0].id_exercicio, 13);
});

test("acrescenta um exercício ao bloco", async (t) => {
  const { api, tokenProfessor, idAluno, idTreino, blocos } = await cenario();
  t.after(() => api.encerrar());

  const payload = comoPayload(blocos);
  payload[1].exercicios.push(ex(13, { carga: 15 }));

  const resposta = await api.put(
    `/professores/treino/${idTreino}`,
    { blocos: payload },
    { token: tokenProfessor }
  );
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

  const depois = await lerTreino(api, idAluno, tokenProfessor);
  assert.equal(depois.blocos[1].exercicios.length, 2);
  assert.equal(depois.blocos[1].exercicios[1].id_exercicio, 13);
});

test("remove um exercício do bloco", async (t) => {
  const { api, tokenProfessor, idAluno, idTreino, blocos } = await cenario();
  t.after(() => api.encerrar());

  const payload = comoPayload(blocos);
  payload[0].exercicios = [payload[0].exercicios[0]];

  const resposta = await api.put(
    `/professores/treino/${idTreino}`,
    { blocos: payload },
    { token: tokenProfessor }
  );
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

  const depois = await lerTreino(api, idAluno, tokenProfessor);
  assert.equal(depois.blocos[0].exercicios.length, 1);
});

// ON DELETE CASCADE em sessao_exercicio: um DELETE aqui levaria junto o registro
// do que o aluno já executou. Por isso remoção é ativo = FALSE.
test("remover um exercício já executado preserva o histórico da sessão", async (t) => {
  const { api, tokenProfessor, token, idTreino, blocos } = await cenario();
  t.after(() => api.encerrar());

  const sessao = await api.post("/alunos/treino/sessao", null, { token });
  assert.equal(sessao.status, 201, JSON.stringify(sessao.corpo));
  const idSessao = sessao.corpo.sessao.id_sessao;
  assert.equal(sessao.corpo.exercicios.length, 2);

  await api.put(`/alunos/treino/sessao/exercicio/${sessao.corpo.exercicios[0].id}`, null, { token });
  await api.post("/alunos/treino/sessao/finalizar", null, { token });

  const payload = comoPayload(blocos);
  payload[0].exercicios = [payload[0].exercicios[0]];

  const resposta = await api.put(
    `/professores/treino/${idTreino}`,
    { blocos: payload },
    { token: tokenProfessor }
  );
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

  const historico = await api.get(`/alunos/sessoes/${idSessao}`, { token });
  assert.equal(historico.status, 200, JSON.stringify(historico.corpo));
  assert.equal(historico.corpo.exercicios.length, 2, "a sessão executada continua com 2 linhas");
});

// Sem AND ativo = TRUE no INSERT de sessao_exercicio, o exercício removido
// continuaria entrando nas sessões seguintes.
test("exercício removido não entra em sessão nova", async (t) => {
  const { api, tokenProfessor, token, idTreino, blocos } = await cenario();
  t.after(() => api.encerrar());

  const payload = comoPayload(blocos);
  payload[0].exercicios = [payload[0].exercicios[0]];
  await api.put(`/professores/treino/${idTreino}`, { blocos: payload }, { token: tokenProfessor });

  const sessao = await api.post("/alunos/treino/sessao", null, { token });

  assert.equal(sessao.status, 201, JSON.stringify(sessao.corpo));
  assert.equal(sessao.corpo.exercicios.length, 1);
});

test("acrescenta um bloco novo ao treino", async (t) => {
  const { api, tokenProfessor, idAluno, idTreino, blocos } = await cenario();
  t.after(() => api.encerrar());

  const payload = comoPayload(blocos);
  payload.push({ nome: "Ombro", exercicios: [ex(24)] });

  const resposta = await api.put(
    `/professores/treino/${idTreino}`,
    { blocos: payload },
    { token: tokenProfessor }
  );
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

  const depois = await lerTreino(api, idAluno, tokenProfessor);
  assert.equal(depois.blocos.length, 4);
  assert.equal(depois.blocos[3].letra, "D");
  assert.equal(depois.blocos[3].nome, "Ombro");
});

test("renomeia um bloco existente", async (t) => {
  const { api, tokenProfessor, idAluno, idTreino, blocos } = await cenario();
  t.after(() => api.encerrar());

  const payload = comoPayload(blocos);
  payload[0].nome = "Peito e Tríceps";

  const resposta = await api.put(
    `/professores/treino/${idTreino}`,
    { blocos: payload },
    { token: tokenProfessor }
  );
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

  const depois = await lerTreino(api, idAluno, tokenProfessor);
  assert.equal(depois.blocos[0].nome, "Peito e Tríceps");
  assert.equal(depois.blocos[0].id_bloco, blocos[0].id_bloco);
});

test("remove um bloco e as letras seguintes são renumeradas", async (t) => {
  const { api, tokenProfessor, idAluno, idTreino, blocos } = await cenario();
  t.after(() => api.encerrar());

  const payload = comoPayload(blocos).filter((_, i) => i !== 1);

  const resposta = await api.put(
    `/professores/treino/${idTreino}`,
    { blocos: payload },
    { token: tokenProfessor }
  );
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

  const depois = await lerTreino(api, idAluno, tokenProfessor);
  assert.equal(depois.blocos.length, 2);
  assert.deepEqual(
    depois.blocos.map((b) => b.letra),
    ["A", "B"]
  );
  assert.equal(depois.blocos[1].id_bloco, blocos[2].id_bloco, "o antigo C virou B");
});

// sessao_treino.id_bloco referencia treino_bloco sem cascade: um DELETE falharia
// na FK. Por isso o bloco removido também é desativado, não apagado.
test("remove um bloco já executado sem derrubar a sessão", async (t) => {
  const { api, tokenProfessor, token, idTreino, blocos } = await cenario();
  t.after(() => api.encerrar());

  const sessao = await api.post("/alunos/treino/sessao", null, { token });
  const idSessao = sessao.corpo.sessao.id_sessao;
  await api.post("/alunos/treino/sessao/finalizar", null, { token });

  const payload = comoPayload(blocos).filter((_, i) => i !== 0);

  const resposta = await api.put(
    `/professores/treino/${idTreino}`,
    { blocos: payload },
    { token: tokenProfessor }
  );
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

  const historico = await api.get(`/alunos/sessoes/${idSessao}`, { token });
  assert.equal(historico.status, 200, JSON.stringify(historico.corpo));
});

test("treino inativo não pode ser editado", async (t) => {
  const { api, tokenProfessor, idAluno, idTreino, blocos } = await cenario();
  t.after(() => api.encerrar());

  // Montar outro treino desativa o anterior.
  await api.post(
    "/professores/treino",
    { id_aluno: idAluno, blocos: [{ nome: null, exercicios: [ex(1)] }] },
    { token: tokenProfessor }
  );

  const resposta = await api.put(
    `/professores/treino/${idTreino}`,
    { blocos: comoPayload(blocos) },
    { token: tokenProfessor }
  );

  assert.equal(resposta.status, 409, JSON.stringify(resposta.corpo));
});

test("treino inexistente devolve 404", async (t) => {
  const { api, tokenProfessor, blocos } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.put(
    "/professores/treino/9999",
    { blocos: comoPayload(blocos) },
    { token: tokenProfessor }
  );

  assert.equal(resposta.status, 404, JSON.stringify(resposta.corpo));
});

test("editar não desativa o treino nem cria outro para o aluno", async (t) => {
  const { api, tokenProfessor, idAluno, idTreino, blocos } = await cenario();
  t.after(() => api.encerrar());

  await api.put(
    `/professores/treino/${idTreino}`,
    { blocos: comoPayload(blocos) },
    { token: tokenProfessor }
  );

  const treinos = api.consultar(
    `SELECT id_treino, ativo FROM treino WHERE id_aluno = ${idAluno}`
  );
  assert.equal(treinos.length, 1);
  assert.equal(treinos[0].ativo, true);
});
