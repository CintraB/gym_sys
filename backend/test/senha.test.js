import test from "node:test";
import assert from "node:assert/strict";
import { criarApiDeTeste, criarProfessorELogar } from "./helpers.js";

const CPF = "11111111111";
const SENHA = "senha123";

async function cenario() {
  const api = await criarApiDeTeste();
  const token = await criarProfessorELogar(api, { cpf: CPF, senha: SENHA });
  return { api, token };
}

test("troca a própria senha e a nova passa a valer", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.put(
    "/me/senha",
    { senha_atual: SENHA, senha_nova: "outraSenha456" },
    { token }
  );
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

  const comNova = await api.post("/login", { cpf: CPF, senha: "outraSenha456" });
  assert.equal(comNova.status, 200);

  const comAntiga = await api.post("/login", { cpf: CPF, senha: SENHA });
  assert.equal(comAntiga.status, 401);
});

// Sem exigir a atual, quem pega o celular destravado troca a senha e toma a
// conta sem nunca ter sabido a senha original.
test("recusa a troca quando a senha atual está errada", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.put(
    "/me/senha",
    { senha_atual: "chuteErrado", senha_nova: "outraSenha456" },
    { token }
  );

  assert.equal(resposta.status, 401);

  const aindaVale = await api.post("/login", { cpf: CPF, senha: SENHA });
  assert.equal(aindaVale.status, 200, "a senha não podia ter mudado");
});

test("recusa senha nova curta demais", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.put("/me/senha", { senha_atual: SENHA, senha_nova: "123" }, { token });

  assert.equal(resposta.status, 400);
});

test("a resposta da troca nunca devolve senha", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.put(
    "/me/senha",
    { senha_atual: SENHA, senha_nova: "outraSenha456" },
    { token }
  );

  const texto = JSON.stringify(resposta.corpo);
  assert.ok(!texto.includes("outraSenha456"), `vazou a senha nova: ${texto}`);
  assert.ok(!texto.includes(SENHA), `vazou a senha antiga: ${texto}`);
  assert.ok(!/[0-9a-f]{64}/.test(texto), `parece hash de senha no corpo: ${texto}`);
});

// O JWT vale sete dias. Sem esta checagem, um token roubado continuaria
// funcionando por uma semana depois da troca — que é o cenário em que se
// troca a senha.
test("o token anterior à troca deixa de valer", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const antes = await api.get("/me", { token });
  assert.equal(antes.status, 200);

  // senha_alterada_em precisa ficar depois do iat do token, que tem
  // resolução de segundos.
  api.memoria.public.none(
    `UPDATE usuario SET senha_alterada_em = NOW() + INTERVAL '10 seconds' WHERE cpf = '${CPF}'`
  );

  const depois = await api.get("/me", { token });
  assert.equal(depois.status, 401);
});

test("quem trocou a senha continua logado, com o token novo", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.put(
    "/me/senha",
    { senha_atual: SENHA, senha_nova: "outraSenha456" },
    { token }
  );

  assert.ok(resposta.corpo.token, "a troca precisa devolver um token novo");

  const comNovo = await api.get("/me", { token: resposta.corpo.token });
  assert.equal(comNovo.status, 200, JSON.stringify(comNovo.corpo));
});

// Usuário que nunca trocou a senha tem senha_alterada_em NULL. Se a
// comparação não tratar isso, a migração derruba a sessão de todo mundo.
test("senha_alterada_em nula não invalida token nenhum", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const linhas = api.memoria.public.many(
    `SELECT senha_alterada_em FROM usuario WHERE cpf = '${CPF}'`
  );
  assert.equal(linhas[0].senha_alterada_em, null, "deveria nascer nula");

  const resposta = await api.get("/me", { token });
  assert.equal(resposta.status, 200);
});
