import test from "node:test";
import assert from "node:assert/strict";
import { criarApiDeTeste, criarAdminELogar, criarProfessorELogar } from "./helpers.js";

const ALUNO = {
  cpf: "22222222222",
  nome: "Aluno Teste",
  senha: "senha123",
  email: "aluno@teste.com",
  titulo: "222222222222",
};

const CPF_NOVO = "33333333333";

/** Admin logado, um aluno cadastrado e o aluno com sessão aberta. */
async function cenario() {
  const api = await criarApiDeTeste();
  const token = await criarAdminELogar(api);
  const criado = await api.post("/professores/alunos", ALUNO, { token });
  assert.equal(criado.status, 201, JSON.stringify(criado.corpo));

  const login = await api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha });
  assert.equal(login.status, 200, JSON.stringify(login.corpo));

  return { api, token, idAluno: criado.corpo.aluno.id, tokenAluno: login.corpo.token };
}

const corteDe = (api, id) =>
  api.consultar(`SELECT sessoes_invalidadas_em FROM usuario WHERE id = ${id}`)[0]
    .sessoes_invalidadas_em;

// O CPF é o login. Sem isto, o token anterior continuaria valendo sete dias
// para um login que já não existe — inclusive na mão de quem o roubou, que é
// um dos motivos de trocar o CPF de alguém.
test("trocar o CPF do aluno derruba a sessão aberta dele", async (t) => {
  const { api, token, idAluno, tokenAluno } = await cenario();
  t.after(() => api.encerrar());

  assert.equal((await api.get("/me", { token: tokenAluno })).status, 200);

  // A espera é o preço de testar a rota, e não o middleware: `iat` tem
  // resolução de segundos, e a comparação é estritamente menor, então um corte
  // gravado no mesmo segundo da emissão não derrubaria o token — de propósito,
  // para quem troca o próprio login não se desconectar.
  await new Promise((resolve) => setTimeout(resolve, 1100));

  const resposta = await api.put(`/admin/usuarios/${idAluno}`, { cpf: CPF_NOVO }, { token });
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

  assert.equal((await api.get("/me", { token: tokenAluno })).status, 401);
});

test("depois da troca, o login vale com o CPF novo e não com o antigo", async (t) => {
  const { api, token, idAluno } = await cenario();
  t.after(() => api.encerrar());

  await api.put(`/admin/usuarios/${idAluno}`, { cpf: CPF_NOVO }, { token });

  const comNovo = await api.post("/login", { cpf: CPF_NOVO, senha: ALUNO.senha });
  assert.equal(comNovo.status, 200, JSON.stringify(comNovo.corpo));

  const comAntigo = await api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha });
  assert.equal(comAntigo.status, 401);
});

test("trocar o CPF grava o corte de sessão do alvo", async (t) => {
  const { api, token, idAluno } = await cenario();
  t.after(() => api.encerrar());

  assert.equal(corteDe(api, idAluno), null, "deveria nascer nulo");

  await api.put(`/admin/usuarios/${idAluno}`, { cpf: CPF_NOVO }, { token });

  assert.notEqual(corteDe(api, idAluno), null, "o corte precisava ter sido gravado");
});

// Editar o nome de alguém não é motivo para expulsá-lo do aplicativo. Se o
// corte fosse gravado a cada PUT, corrigir um acento derrubaria a sessão.
test("alterar só o nome não derruba a sessão de ninguém", async (t) => {
  const { api, token, idAluno, tokenAluno } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.put(`/admin/usuarios/${idAluno}`, { nome: "Outro Nome" }, { token });
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

  assert.equal(corteDe(api, idAluno), null, "não devia ter gravado corte");
  assert.equal((await api.get("/me", { token: tokenAluno })).status, 200);
});

// O formulário do front manda o CPF junto mesmo quando só o nome mudou.
test("salvar o mesmo CPF não derruba a sessão", async (t) => {
  const { api, token, idAluno, tokenAluno } = await cenario();
  t.after(() => api.encerrar());

  await api.put(`/admin/usuarios/${idAluno}`, { nome: "Outro Nome", cpf: ALUNO.cpf }, { token });

  assert.equal(corteDe(api, idAluno), null, "o CPF não mudou, não devia gravar corte");
  assert.equal((await api.get("/me", { token: tokenAluno })).status, 200);
});

// O login é por CPF. O título identifica o aluno na academia, mas não autentica
// ninguém — derrubar a sessão por causa dele seria expulsar sem motivo.
test("trocar só o título não derruba a sessão", async (t) => {
  const { api, token, idAluno, tokenAluno } = await cenario();
  t.after(() => api.encerrar());

  await api.put(`/admin/usuarios/${idAluno}`, { titulo: "444444444444" }, { token });

  assert.equal(corteDe(api, idAluno), null, "título não é credencial de login");
  assert.equal((await api.get("/me", { token: tokenAluno })).status, 200);
});

// Sem o token novo, o admin que corrige o próprio CPF se desconecta no meio do
// trabalho — o mesmo cuidado que /me/senha já toma.
test("quem troca o próprio CPF recebe um token novo que funciona", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const eu = await api.get("/me", { token });

  const resposta = await api.put(
    `/admin/usuarios/${eu.corpo.id}`,
    { cpf: "88888888888" },
    { token }
  );
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
  assert.ok(resposta.corpo.token, "a troca do próprio login precisa devolver um token novo");

  const comNovo = await api.get("/me", { token: resposta.corpo.token });
  assert.equal(comNovo.status, 200, JSON.stringify(comNovo.corpo));
});

// Devolver um token depois de mexer na conta de outra pessoa seria entregar a
// sessão dela ao admin — sequestro de conta com aparência de recurso.
test("trocar o CPF de outra pessoa não devolve token nenhum", async (t) => {
  const { api, token, idAluno } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.put(`/admin/usuarios/${idAluno}`, { cpf: CPF_NOVO }, { token });

  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
  assert.equal(resposta.corpo.token, undefined, "não pode devolver token de outro usuário");
});

// A mesma troca de login existe na rota do professor, e o esquecimento ali
// deixaria o buraco aberto por outra porta.
test("o professor trocando o CPF do aluno também derruba a sessão dele", async (t) => {
  const api = await criarApiDeTeste();
  t.after(() => api.encerrar());

  const tokenProfessor = await criarProfessorELogar(api);
  const criado = await api.post("/professores/alunos", ALUNO, { token: tokenProfessor });
  assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
  const idAluno = criado.corpo.aluno.id;

  const login = await api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha });
  const tokenAluno = login.corpo.token;

  await new Promise((resolve) => setTimeout(resolve, 1100));

  const resposta = await api.put(
    `/professores/aluno/${idAluno}`,
    { cpf: CPF_NOVO },
    { token: tokenProfessor }
  );
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

  assert.equal((await api.get("/me", { token: tokenAluno })).status, 401);
});

// Perfis são flags do mesmo registro: quem dá aula e também treina alcança a
// própria conta por /professores/aluno/:id, e se desconectaria ali.
test("professor que também é aluno troca o próprio CPF e segue logado", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const eu = await api.get("/me", { token });
  assert.equal(eu.corpo.perfis.aluno, true, "o cenário depende de acumular os perfis");

  const resposta = await api.put(`/professores/aluno/${eu.corpo.id}`, { cpf: "88888888888" }, { token });
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
  assert.ok(resposta.corpo.token, "precisa devolver token novo");

  const comNovo = await api.get("/me", { token: resposta.corpo.token });
  assert.equal(comNovo.status, 200, JSON.stringify(comNovo.corpo));
});
