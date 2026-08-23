import test from "node:test";
import assert from "node:assert/strict";
import { criarApiDeTeste, criarAdminELogar, criarProfessorELogar } from "./helpers.js";

/**
 * As variantes das duas rotas de senha: preenchimento inválido, tipos errados,
 * limites e corpo malformado.
 *
 * O `senha.test.js` cobre o caminho feliz e as regras principais; aqui a
 * pergunta é outra — o que acontece quando o corpo chega torto. Um 500 nesta
 * suíte é achado: significa exceção não tratada onde deveria haver validação.
 */

const CPF = "11111111111";
const SENHA = "senha123";

async function cenario() {
  const api = await criarApiDeTeste();
  const token = await criarProfessorELogar(api, { cpf: CPF, senha: SENHA });
  return { api, token };
}

const ALUNO = {
  cpf: "22222222222",
  nome: "Aluno Teste",
  senha: "senha123",
  email: "aluno@teste.com",
  titulo: "222222222222",
};

async function cenarioAdmin() {
  const api = await criarApiDeTeste();
  const token = await criarAdminELogar(api);
  const criado = await api.post("/professores/alunos", ALUNO, { token });
  assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
  return { api, token, idAluno: criado.corpo.aluno.id };
}

/** A senha atual continua sendo a única que abre a conta. */
async function senhaContinuaSendo(api, senha, cpf = CPF) {
  const entrada = await api.post("/login", { cpf, senha });
  assert.equal(entrada.status, 200, `a senha "${senha}" devia continuar valendo`);
}

/* ---------------------------------------------------- PUT /me/senha: corpo */

test("corpo vazio na troca de senha é 400, e não 500", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.put("/me/senha", {}, { token });

  assert.equal(resposta.status, 400, JSON.stringify(resposta.corpo));
  await senhaContinuaSendo(api, SENHA);
});

// O front manda strings, mas um cliente qualquer pode mandar o que quiser — e
// `senha_nova.length` num número seria `undefined`, passando pela validação.
test("senha nova em número é recusada como preenchimento inválido", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.put("/me/senha", { senha_atual: SENHA, senha_nova: 12345678 }, { token });

  assert.equal(resposta.status, 400, JSON.stringify(resposta.corpo));
  await senhaContinuaSendo(api, SENHA);
});

test("senha atual em tipo errado não passa por senha certa", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  for (const senhaAtual of [12345678, null, { toString: "senha123" }, [SENHA]]) {
    const resposta = await api.put(
      "/me/senha",
      { senha_atual: senhaAtual, senha_nova: "outraSenha456" },
      { token }
    );

    assert.equal(resposta.status, 401, `aceitou senha atual ${JSON.stringify(senhaAtual)}`);
  }

  await senhaContinuaSendo(api, SENHA);
});

test("corpo que não é objeto vira 400, e não 500", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  for (const bruto of ["[]", '"texto"', "123", "null"]) {
    const resposta = await api.put("/me/senha", undefined, { token, corpoBruto: bruto });

    assert.equal(resposta.status, 400, `corpo ${bruto} respondeu ${resposta.status}`);
  }

  await senhaContinuaSendo(api, SENHA);
});

test("JSON malformado vira 400, e não 500", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.put("/me/senha", undefined, { token, corpoBruto: "{senha_nova:" });

  assert.equal(resposta.status, 400, JSON.stringify(resposta.corpo));
});

/* -------------------------------------------------- PUT /me/senha: limites */

test("seis caracteres é o mínimo aceito, e cinco não passa", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const curta = await api.put("/me/senha", { senha_atual: SENHA, senha_nova: "12345" }, { token });
  assert.equal(curta.status, 400);

  const noLimite = await api.put(
    "/me/senha",
    { senha_atual: SENHA, senha_nova: "123456" },
    { token }
  );
  assert.equal(noLimite.status, 200, JSON.stringify(noLimite.corpo));
  await senhaContinuaSendo(api, "123456");
});

test("senha nova igual à atual é recusada e não invalida a sessão", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.put("/me/senha", { senha_atual: SENHA, senha_nova: SENHA }, { token });

  assert.equal(resposta.status, 400, JSON.stringify(resposta.corpo));
  assert.equal((await api.get("/me", { token })).status, 200, "a sessão caiu à toa");
  await senhaContinuaSendo(api, SENHA);
});

// Espaço é caractere: quem digitou espaço na senha precisa digitar de novo no
// login. O que não pode é uma senha inteira de espaços passar pelo mínimo.
test("senha só de espaços não conta como seis caracteres", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.put(
    "/me/senha",
    { senha_atual: SENHA, senha_nova: "        " },
    { token }
  );

  assert.equal(resposta.status, 400, JSON.stringify(resposta.corpo));
  await senhaContinuaSendo(api, SENHA);
});

test("os espaços das pontas são preservados, e não aparados", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const comEspacos = "  segredo  ";
  const resposta = await api.put(
    "/me/senha",
    { senha_atual: SENHA, senha_nova: comEspacos },
    { token }
  );
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

  await senhaContinuaSendo(api, comEspacos);
  const aparada = await api.post("/login", { cpf: CPF, senha: comEspacos.trim() });
  assert.equal(aparada.status, 401, "a senha foi aparada em algum lugar");
});

test("acento e emoji sobrevivem à ida e volta", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const senhaUnicode = "coração💪ção";
  const resposta = await api.put(
    "/me/senha",
    { senha_atual: SENHA, senha_nova: senhaUnicode },
    { token }
  );
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

  await senhaContinuaSendo(api, senhaUnicode);
});

test("senha longa não derruba o servidor", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const longa = "a".repeat(4096);
  const resposta = await api.put("/me/senha", { senha_atual: SENHA, senha_nova: longa }, { token });

  assert.ok([200, 400].includes(resposta.status), `respondeu ${resposta.status}`);
  if (resposta.status === 200) await senhaContinuaSendo(api, longa);
});

/* ---------------------------------------------- PUT /me/senha: quem chama */

test("trocar a senha sem token é 401", async (t) => {
  const { api } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.put("/me/senha", { senha_atual: SENHA, senha_nova: "outraSenha456" });

  assert.equal(resposta.status, 401);
  await senhaContinuaSendo(api, SENHA);
});

test("quem foi desativado não troca a própria senha", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  api.executar(`UPDATE usuario SET ativo = FALSE WHERE cpf = '${CPF}'`);

  const resposta = await api.put(
    "/me/senha",
    { senha_atual: SENHA, senha_nova: "outraSenha456" },
    { token }
  );

  assert.equal(resposta.status, 401, JSON.stringify(resposta.corpo));
});

test("aluno também troca a própria senha", async (t) => {
  const { api, token } = await cenarioAdmin();
  t.after(() => api.encerrar());
  assert.ok(token);

  const login = await api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha });
  const tokenAluno = login.corpo.token;

  const resposta = await api.put(
    "/me/senha",
    { senha_atual: ALUNO.senha, senha_nova: "outraSenha456" },
    { token: tokenAluno }
  );

  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
  await senhaContinuaSendo(api, "outraSenha456", ALUNO.cpf);
});

// Um 401 com token válido não pode ser confundido com sessão morta: é o que
// fazia o app expulsar quem só errou a digitação.
test("errar a senha atual não invalida o token de quem está logado", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  await api.put("/me/senha", { senha_atual: "chuteErrado", senha_nova: "outraSenha456" }, { token });

  const depois = await api.get("/me", { token });
  assert.equal(depois.status, 200, "o token morreu por causa de um erro de digitação");
});

/* --------------------------------- PUT /admin/usuarios/:id/senha: variantes */

test("id inválido na redefinição é 400, e não 500", async (t) => {
  const { api, token } = await cenarioAdmin();
  t.after(() => api.encerrar());

  for (const id of ["abc", "0", "-1", "1.5", "1%20OR%201=1"]) {
    const resposta = await api.put(
      `/admin/usuarios/${id}/senha`,
      { senha_nova: "senhaTemporaria1" },
      { token }
    );

    assert.equal(resposta.status, 400, `id ${id} respondeu ${resposta.status}`);
  }
});

test("redefinição com corpo vazio ou tipo errado é 400", async (t) => {
  const { api, token, idAluno } = await cenarioAdmin();
  t.after(() => api.encerrar());

  for (const corpo of [{}, { senha_nova: 12345678 }, { senha_nova: null }, { senha: "senha123" }]) {
    const resposta = await api.put(`/admin/usuarios/${idAluno}/senha`, corpo, { token });

    assert.equal(resposta.status, 400, `corpo ${JSON.stringify(corpo)} passou`);
  }

  await senhaContinuaSendo(api, ALUNO.senha, ALUNO.cpf);
});

test("redefinição aceita exatamente seis caracteres", async (t) => {
  const { api, token, idAluno } = await cenarioAdmin();
  t.after(() => api.encerrar());

  const resposta = await api.put(
    `/admin/usuarios/${idAluno}/senha`,
    { senha_nova: "123456" },
    { token }
  );

  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
  await senhaContinuaSendo(api, "123456", ALUNO.cpf);
});

test("redefinição também recusa senha só de espaços", async (t) => {
  const { api, token, idAluno } = await cenarioAdmin();
  t.after(() => api.encerrar());

  const resposta = await api.put(
    `/admin/usuarios/${idAluno}/senha`,
    { senha_nova: "        " },
    { token }
  );

  assert.equal(resposta.status, 400, JSON.stringify(resposta.corpo));
  await senhaContinuaSendo(api, ALUNO.senha, ALUNO.cpf);
});

test("a resposta da redefinição não traz senha nem hash", async (t) => {
  const { api, token, idAluno } = await cenarioAdmin();
  t.after(() => api.encerrar());

  const resposta = await api.put(
    `/admin/usuarios/${idAluno}/senha`,
    { senha_nova: "senhaTemporaria1" },
    { token }
  );

  const texto = JSON.stringify(resposta.corpo);
  assert.ok(!texto.includes("senhaTemporaria1"), `vazou a senha: ${texto}`);
  assert.ok(!/[0-9a-f]{64}/.test(texto), `parece hash no corpo: ${texto}`);
});

test("redefinir senha não mexe em perfil, nome nem em ativo", async (t) => {
  const { api, token, idAluno } = await cenarioAdmin();
  t.after(() => api.encerrar());

  const antes = await api.get(`/admin/usuarios`, { token });
  const alunoAntes = antes.corpo.find((u) => u.id === idAluno);

  await api.put(`/admin/usuarios/${idAluno}/senha`, { senha_nova: "senhaTemporaria1" }, { token });

  const depois = await api.get(`/admin/usuarios`, { token });
  const alunoDepois = depois.corpo.find((u) => u.id === idAluno);

  assert.deepEqual(
    { ...alunoDepois, atualizado_em: null },
    { ...alunoAntes, atualizado_em: null },
    "a redefinição alterou outro campo"
  );
});

test("aluno comum não redefine a senha de ninguém", async (t) => {
  const { api, token, idAluno } = await cenarioAdmin();
  t.after(() => api.encerrar());
  assert.ok(token);

  const login = await api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha });

  const resposta = await api.put(
    `/admin/usuarios/${idAluno}/senha`,
    { senha_nova: "senhaTemporaria1" },
    { token: login.corpo.token }
  );

  assert.equal(resposta.status, 403, JSON.stringify(resposta.corpo));
  await senhaContinuaSendo(api, ALUNO.senha, ALUNO.cpf);
});

test("a senha antiga deixa de valer depois da redefinição", async (t) => {
  const { api, token, idAluno } = await cenarioAdmin();
  t.after(() => api.encerrar());

  await api.put(`/admin/usuarios/${idAluno}/senha`, { senha_nova: "senhaTemporaria1" }, { token });

  const comAntiga = await api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha });
  assert.equal(comAntiga.status, 401);
});

test("duas redefinições seguidas: vale a última", async (t) => {
  const { api, token, idAluno } = await cenarioAdmin();
  t.after(() => api.encerrar());

  await api.put(`/admin/usuarios/${idAluno}/senha`, { senha_nova: "primeira123" }, { token });
  await api.put(`/admin/usuarios/${idAluno}/senha`, { senha_nova: "segunda123" }, { token });

  const comPrimeira = await api.post("/login", { cpf: ALUNO.cpf, senha: "primeira123" });
  assert.equal(comPrimeira.status, 401);
  await senhaContinuaSendo(api, "segunda123", ALUNO.cpf);
});

// Preparar a senha antes de reativar alguém é uso legítimo; o que não pode é a
// pessoa inativa passar a entrar por causa disso.
test("redefinir a senha de um inativo não o reativa", async (t) => {
  const { api, token, idAluno } = await cenarioAdmin();
  t.after(() => api.encerrar());

  await api.put("/professores/alunos/desativar", { cpf: ALUNO.cpf }, { token });

  const resposta = await api.put(
    `/admin/usuarios/${idAluno}/senha`,
    { senha_nova: "senhaTemporaria1" },
    { token }
  );
  assert.ok([200, 404].includes(resposta.status), `respondeu ${resposta.status}`);

  const entrada = await api.post("/login", { cpf: ALUNO.cpf, senha: "senhaTemporaria1" });
  assert.equal(entrada.status, 401, "inativo entrou depois da redefinição");
});

// O mesmo furo valia na criação da conta: a regra do que é senha aceitável
// precisa ser uma só, senão cada rota inventa a sua.
test("cadastro de aluno recusa senha só de espaços", async (t) => {
  const { api, token } = await cenarioAdmin();
  t.after(() => api.encerrar());

  const resposta = await api.post(
    "/professores/alunos",
    { ...ALUNO, cpf: "33333333333", titulo: "333333333333", senha: "        " },
    { token }
  );

  assert.equal(resposta.status, 400, JSON.stringify(resposta.corpo));
});
