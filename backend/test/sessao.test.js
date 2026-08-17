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

const EXERCICIOS = [
  { id_exercicio: 1, numero_serie: 4, repeticoes: "10 a 15", carga: 30 },
  { id_exercicio: 13, numero_serie: 3, repeticoes: "12", carga: 12 },
  { id_exercicio: 36, numero_serie: 0, repeticoes: "", carga: "", observacao_ex_usuario: "20 min" },
];

/** Professor + aluno logado, com treino de 3 exercícios já montado. */
async function cenario({ comTreino = true } = {}) {
  const api = await criarApiDeTeste();
  const tokenProfessor = await criarProfessorELogar(api);

  const criado = await api.post("/professores/alunos", ALUNO, { token: tokenProfessor });
  const idAluno = criado.corpo.aluno.id;
  const login = await api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha });

  if (comTreino) {
    const treino = await api.post(
      "/professores/treino",
      { id_aluno: idAluno, exercicios: EXERCICIOS },
      { token: tokenProfessor }
    );
    assert.equal(treino.status, 201, JSON.stringify(treino.corpo));
  }

  return { api, tokenProfessor, idAluno, token: login.corpo.token };
}

test("sem sessão em andamento, a rota devolve null", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.get("/alunos/treino/sessao", { token });

  assert.equal(resposta.status, 200);
  assert.equal(resposta.corpo, null);
});

test("iniciar cria uma linha por exercício do treino", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.post("/alunos/treino/sessao", null, { token });

  assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
  assert.equal(resposta.corpo.exercicios.length, 3);
  assert.ok(resposta.corpo.exercicios.every((e) => e.concluido === false));
  assert.equal(resposta.corpo.sessao.finalizado_em, null);
  assert.equal(resposta.corpo.exercicios[0].nome_exercicio, "SUPINO SENTADO");
});

test("iniciar duas vezes devolve a mesma sessão, não duplica", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const primeira = await api.post("/alunos/treino/sessao", null, { token });
  const segunda = await api.post("/alunos/treino/sessao", null, { token });

  assert.equal(primeira.status, 201);
  assert.equal(segunda.status, 200, "a segunda chamada retoma em vez de criar");
  assert.equal(segunda.corpo.sessao.id_sessao, primeira.corpo.sessao.id_sessao);
});

// A garantia contra requisições simultâneas é o índice único parcial
// idx_sessao_aberta_por_aluno. O pg-mem usa índice parcial para responder
// consultas que não casam com o predicado dele, então o helper de teste
// precisa removê-lo — e sem o índice esta corrida não tem como ser barrada.
//
// Confirmado à mão contra o PostgreSQL do container; ver deploy/README.md.
test("toques simultâneos em iniciar não criam duas sessões", { skip: "exige PostgreSQL real: o pg-mem não modela índice parcial" }, async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const respostas = await Promise.all([
    api.post("/alunos/treino/sessao", null, { token }),
    api.post("/alunos/treino/sessao", null, { token }),
    api.post("/alunos/treino/sessao", null, { token }),
  ]);

  const ids = new Set(respostas.map((r) => r.corpo?.sessao?.id_sessao));
  assert.ok(
    respostas.every((r) => r.status < 400),
    `alguma requisição falhou: ${respostas.map((r) => r.status).join(",")}`
  );
  assert.equal(ids.size, 1, "as três precisam apontar para a mesma sessão");
});

test("aluno sem treino não consegue iniciar", async (t) => {
  const { api, token } = await cenario({ comTreino: false });
  t.after(() => api.encerrar());

  const resposta = await api.post("/alunos/treino/sessao", null, { token });

  assert.equal(resposta.status, 404);
  assert.match(resposta.corpo.message, /treino/i);
});

test("marcar e desmarcar exercício", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const sessao = await api.post("/alunos/treino/sessao", null, { token });
  const item = sessao.corpo.exercicios[0];

  const marcado = await api.put(
    `/alunos/treino/sessao/exercicio/${item.id}`,
    { concluido: true },
    { token }
  );
  assert.equal(marcado.status, 200);
  assert.equal(marcado.corpo.concluido, true);
  assert.ok(marcado.corpo.concluido_em, "guarda a hora em que foi feito");

  const desmarcado = await api.put(
    `/alunos/treino/sessao/exercicio/${item.id}`,
    { concluido: false },
    { token }
  );
  assert.equal(desmarcado.corpo.concluido, false);
  assert.equal(desmarcado.corpo.concluido_em, null);
});

test("marcar exige booleano explícito", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const sessao = await api.post("/alunos/treino/sessao", null, { token });
  const id = sessao.corpo.exercicios[0].id;

  for (const corpo of [{}, { concluido: "sim" }, { concluido: 1 }, { concluido: null }]) {
    const resposta = await api.put(`/alunos/treino/sessao/exercicio/${id}`, corpo, { token });
    assert.equal(resposta.status, 400, `aceitou ${JSON.stringify(corpo)}`);
  }
});

test("um aluno não marca exercício da sessão de outro", async (t) => {
  const { api, tokenProfessor, token } = await cenario();
  t.after(() => api.encerrar());

  const sessao = await api.post("/alunos/treino/sessao", null, { token });
  const idItem = sessao.corpo.exercicios[0].id;

  const outro = await api.post(
    "/professores/alunos",
    { ...ALUNO, cpf: "33333333333", titulo: "333333333333", email: "outro@teste.com" },
    { token: tokenProfessor }
  );
  await api.post(
    "/professores/treino",
    { id_aluno: outro.corpo.aluno.id, exercicios: EXERCICIOS },
    { token: tokenProfessor }
  );
  const loginOutro = await api.post("/login", { cpf: "33333333333", senha: ALUNO.senha });

  const invasao = await api.put(
    `/alunos/treino/sessao/exercicio/${idItem}`,
    { concluido: true },
    { token: loginOutro.corpo.token }
  );

  assert.equal(invasao.status, 404);
});

test("finalizar grava a duração calculada no servidor", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  await api.post("/alunos/treino/sessao", null, { token });
  const finalizada = await api.post("/alunos/treino/sessao/finalizar", null, { token });

  assert.equal(finalizada.status, 200);
  assert.ok(finalizada.corpo.sessao.finalizado_em, "marca o fim");
  assert.equal(typeof finalizada.corpo.sessao.duracao_segundos, "number");
  assert.ok(finalizada.corpo.sessao.duracao_segundos >= 0);

  // A sessão sai de "em andamento".
  const atual = await api.get("/alunos/treino/sessao", { token });
  assert.equal(atual.corpo, null);
});

test("o cliente não consegue inflar a duração", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  await api.post("/alunos/treino/sessao", null, { token });
  const resposta = await api.post(
    "/alunos/treino/sessao/finalizar",
    { duracao_segundos: 99999, finalizado_em: "2030-01-01T00:00:00Z" },
    { token }
  );

  assert.ok(resposta.corpo.sessao.duracao_segundos < 60, "o corpo da requisição é ignorado");
});

test("finalizar sem treino em andamento dá 409", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const semSessao = await api.post("/alunos/treino/sessao/finalizar", null, { token });
  assert.equal(semSessao.status, 409);

  await api.post("/alunos/treino/sessao", null, { token });
  await api.post("/alunos/treino/sessao/finalizar", null, { token });
  const duasVezes = await api.post("/alunos/treino/sessao/finalizar", null, { token });

  assert.equal(duasVezes.status, 409, "não dá para finalizar duas vezes");
});

test("descartar remove a sessão em andamento", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  await api.post("/alunos/treino/sessao", null, { token });
  const descartada = await api.requisicao("DELETE", "/alunos/treino/sessao", { token });

  assert.equal(descartada.status, 200);
  assert.equal((await api.get("/alunos/treino/sessao", { token })).corpo, null);
  assert.equal((await api.get("/alunos/sessoes", { token })).corpo.length, 0);
});

test("histórico traz duração e quantos exercícios foram feitos", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const sessao = await api.post("/alunos/treino/sessao", null, { token });
  await api.put(
    `/alunos/treino/sessao/exercicio/${sessao.corpo.exercicios[0].id}`,
    { concluido: true },
    { token }
  );
  await api.put(
    `/alunos/treino/sessao/exercicio/${sessao.corpo.exercicios[1].id}`,
    { concluido: true },
    { token }
  );
  await api.post("/alunos/treino/sessao/finalizar", null, { token });

  const historico = await api.get("/alunos/sessoes", { token });

  assert.equal(historico.corpo.length, 1);
  assert.equal(historico.corpo[0].total_exercicios, 3);
  assert.equal(historico.corpo[0].concluidos, 2);
  assert.equal(typeof historico.corpo[0].duracao_segundos, "number");
});

test("sessão em andamento não aparece no histórico", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  await api.post("/alunos/treino/sessao", null, { token });

  assert.equal((await api.get("/alunos/sessoes", { token })).corpo.length, 0);
});

test("detalhe da sessão é acessível só pelo dono", async (t) => {
  const { api, tokenProfessor, token } = await cenario();
  t.after(() => api.encerrar());

  const sessao = await api.post("/alunos/treino/sessao", null, { token });
  await api.post("/alunos/treino/sessao/finalizar", null, { token });
  const id = sessao.corpo.sessao.id_sessao;

  const dono = await api.get(`/alunos/sessoes/${id}`, { token });
  assert.equal(dono.status, 200);
  assert.equal(dono.corpo.exercicios.length, 3);

  const outro = await api.post(
    "/professores/alunos",
    { ...ALUNO, cpf: "33333333333", titulo: "333333333333", email: "outro@teste.com" },
    { token: tokenProfessor }
  );
  assert.equal(outro.status, 201);
  const loginOutro = await api.post("/login", { cpf: "33333333333", senha: ALUNO.senha });

  const invasor = await api.get(`/alunos/sessoes/${id}`, { token: loginOutro.corpo.token });
  assert.equal(invasor.status, 404);
});

test("treino novo do professor não invalida a sessão em andamento", async (t) => {
  const { api, tokenProfessor, idAluno, token } = await cenario();
  t.after(() => api.encerrar());

  await api.post("/alunos/treino/sessao", null, { token });

  // O professor troca o treino no meio da execução.
  await api.post(
    "/professores/treino",
    { id_aluno: idAluno, exercicios: [{ id_exercicio: 58, numero_serie: 4, repeticoes: "10" }] },
    { token: tokenProfessor }
  );

  const atual = await api.get("/alunos/treino/sessao", { token });
  assert.ok(atual.corpo, "a sessão continua em andamento");
  assert.equal(atual.corpo.exercicios.length, 3, "com os exercícios de quando começou");

  const finalizada = await api.post("/alunos/treino/sessao/finalizar", null, { token });
  assert.equal(finalizada.status, 200, "e ainda pode ser finalizada");
});

/* --------------------------------------------------- visão do professor */

test("professor vê a frequência do aluno", async (t) => {
  const { api, tokenProfessor, idAluno, token } = await cenario();
  t.after(() => api.encerrar());

  await api.post("/alunos/treino/sessao", null, { token });
  await api.post("/alunos/treino/sessao/finalizar", null, { token });

  const resposta = await api.get(`/professores/aluno/${idAluno}/sessoes`, { token: tokenProfessor });

  assert.equal(resposta.status, 200);
  assert.equal(resposta.corpo.aluno.nome, ALUNO.nome);
  assert.equal(resposta.corpo.ultimos30dias.sessoes, 1);
  assert.equal(resposta.corpo.sessoes.length, 1);
});

test("aluno não acessa a frequência pela rota de professor", async (t) => {
  const { api, idAluno, token } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.get(`/professores/aluno/${idAluno}/sessoes`, { token });
  assert.equal(resposta.status, 403);
});

test("lista de alunos mostra quando cada um treinou pela última vez", async (t) => {
  const { api, tokenProfessor, token } = await cenario();
  t.after(() => api.encerrar());

  const antes = await api.get("/professores/alunos", { token: tokenProfessor });
  assert.equal(antes.corpo[0].ultima_sessao, null, "quem nunca treinou vem nulo");

  await api.post("/alunos/treino/sessao", null, { token });
  await api.post("/alunos/treino/sessao/finalizar", null, { token });

  const depois = await api.get("/professores/alunos", { token: tokenProfessor });
  assert.ok(depois.corpo[0].ultima_sessao, "depois de treinar, traz a data");
});
