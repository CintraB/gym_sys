/**
 * Testes de segurança.
 *
 * Cada teste representa uma tentativa de abuso que a API precisa recusar.
 * Quando um deles falha, é vulnerabilidade — não é "teste desatualizado".
 */
import test from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { criarApiDeTeste, criarProfessorELogar } from "./helpers.js";

const SEGREDO = new TextEncoder().encode(process.env.TOKEN_SEG ?? "segredo-de-teste-nao-usar-em-producao");

const ALUNO = {
  cpf: "22222222222",
  nome: "Aluno Teste",
  senha: "senha123",
  email: "aluno@teste.com",
  titulo: "222222222222",
};

const EXERCICIO = { id_exercicio: 1, numero_serie: 3, repeticoes: "10", carga: 10 };

async function cenario() {
  const api = await criarApiDeTeste();
  const tokenProfessor = await criarProfessorELogar(api);

  const criado = await api.post("/professores/alunos", ALUNO, { token: tokenProfessor });
  assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
  const login = await api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha });

  return {
    api,
    tokenProfessor,
    aluno: { id: criado.corpo.aluno.id, token: login.corpo.token },
  };
}

function base64url(objeto) {
  return Buffer.from(JSON.stringify(objeto)).toString("base64url");
}

/* ------------------------------------------------- falsificação de token */

test("token assinado com outro segredo é recusado", async (t) => {
  const { api } = await cenario();
  t.after(() => api.encerrar());

  const forjado = await new SignJWT({ id: 1, cargo: "professor" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode("segredo-do-atacante"));

  const resposta = await api.get("/professores/alunos", { token: forjado });
  assert.equal(resposta.status, 401);
});

test('token com alg "none" é recusado', async (t) => {
  const { api } = await cenario();
  t.after(() => api.encerrar());

  // Ataque clássico: header alg=none e assinatura vazia, na esperança de que
  // a verificação apenas decodifique o payload.
  const cabecalho = base64url({ alg: "none", typ: "JWT" });
  const conteudo = base64url({ id: 1, cargo: "professor", exp: 9999999999 });
  const semAssinatura = `${cabecalho}.${conteudo}.`;

  const resposta = await api.get("/professores/alunos", { token: semAssinatura });
  assert.equal(resposta.status, 401);
});

test("payload adulterado invalida a assinatura", async (t) => {
  const { api, aluno } = await cenario();
  t.after(() => api.encerrar());

  // Troca o payload de um token legítimo de aluno por um que se diz professor,
  // mantendo a assinatura original.
  const [cabecalho, , assinatura] = aluno.token.split(".");
  const adulterado = [cabecalho, base64url({ id: 1, cargo: "professor" }), assinatura].join(".");

  const resposta = await api.get("/professores/alunos", { token: adulterado });
  assert.equal(resposta.status, 401);
});

test("token expirado é recusado", async (t) => {
  const { api } = await cenario();
  t.after(() => api.encerrar());

  const expirado = await new SignJWT({ id: 1, cargo: "professor" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(SEGREDO);

  const resposta = await api.get("/professores/alunos", { token: expirado });
  assert.equal(resposta.status, 401);
});

test("token de usuário inexistente é recusado", async (t) => {
  const { api } = await cenario();
  t.after(() => api.encerrar());

  const fantasma = await new SignJWT({ id: 99999, cargo: "professor" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(SEGREDO);

  const resposta = await api.get("/professores/alunos", { token: fantasma });
  assert.equal(resposta.status, 401);
});

test("cabeçalhos Authorization malformados não passam", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const variantes = [
    "",
    "Bearer",
    "Bearer ",
    tokenProfessor, // sem o prefixo Bearer
    `Basic ${tokenProfessor}`,
    "Bearer null",
    "Bearer undefined",
    "Bearer ...",
  ];

  for (const valor of variantes) {
    const resposta = await api.get("/professores/alunos", {
      headers: { Authorization: valor },
    });
    assert.equal(resposta.status, 401, `deveria recusar Authorization: "${valor}"`);
  }
});

/* ------------------------------------------------- escalada de privilégio */

test("o cargo vem do banco, não da claim do token", async (t) => {
  const { api, aluno } = await cenario();
  t.after(() => api.encerrar());

  // Token válido, assinado com o segredo certo, mas mentindo no cargo.
  const mentiroso = await new SignJWT({ id: aluno.id, cargo: "professor" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(SEGREDO);

  const resposta = await api.get("/professores/alunos", { token: mentiroso });
  assert.equal(resposta.status, 403, "a claim cargo não pode virar autorização");
});

test("cadastro de aluno ignora flags de privilégio no corpo", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const criado = await api.post(
    "/professores/alunos",
    {
      cpf: "33333333333",
      nome: "Escalada",
      senha: "senha123",
      email: "escalada@teste.com",
      titulo: "333333333333",
      professor: true,
      aluno: false,
      ativo: true,
      id: 1,
      atualizado_por: 999,
    },
    { token: tokenProfessor }
  );

  assert.equal(criado.status, 201);
  assert.equal(criado.corpo.aluno.professor, false, "não pode virar professor pelo corpo");
  assert.equal(criado.corpo.aluno.aluno, true);
  assert.notEqual(criado.corpo.aluno.id, 1, "id não pode ser escolhido pelo cliente");

  // Confirma pelo login: o usuário criado não acessa rotas de professor.
  const login = await api.post("/login", { cpf: "33333333333", senha: "senha123" });
  assert.equal(login.corpo.usuario.cargo, "aluno");
  const tentativa = await api.get("/professores/alunos", { token: login.corpo.token });
  assert.equal(tentativa.status, 403);
});

test("alteração de aluno não aceita campos fora da lista permitida", async (t) => {
  const { api, tokenProfessor, aluno } = await cenario();
  t.after(() => api.encerrar());

  const alterado = await api.put(
    `/professores/aluno/${aluno.id}`,
    {
      nome: "Nome Novo",
      professor: true,
      ativo: false,
      senha: "senha-injetada",
      id: 1,
    },
    { token: tokenProfessor }
  );

  assert.equal(alterado.status, 200);
  assert.equal(alterado.corpo.aluno.professor, false);
  assert.equal(alterado.corpo.aluno.ativo, true);

  // A senha antiga tem que continuar valendo — o campo não pode ter passado.
  const login = await api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha });
  assert.equal(login.status, 200, "a senha não pode ser trocada por esta rota");
});

test("professor não é alterável pela rota de aluno", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  // id 1 é o professor criado no cenário.
  const resposta = await api.put(
    "/professores/aluno/1",
    { nome: "Invadido" },
    { token: tokenProfessor }
  );

  assert.equal(resposta.status, 404);
});

test("aluno não alcança nenhuma rota de escrita de professor", async (t) => {
  const { api, aluno } = await cenario();
  t.after(() => api.encerrar());

  const tentativas = [
    api.post("/professores/alunos", ALUNO, { token: aluno.token }),
    api.post("/professores/professores", ALUNO, { token: aluno.token }),
    api.post("/professores/treino", { id_aluno: aluno.id, exercicios: [] }, { token: aluno.token }),
    api.post(
      "/professores/exercicios",
      { nome_exercicio: "PRANCHA LATERAL", tipo: "ABDOMEN" },
      { token: aluno.token }
    ),
    api.put("/professores/alunos/desativar", { cpf: ALUNO.cpf }, { token: aluno.token }),
    api.put("/professores/alunos/reativar", { cpf: ALUNO.cpf }, { token: aluno.token }),
    api.get("/professores/resumo", { token: aluno.token }),
  ];

  for (const resposta of await Promise.all(tentativas)) {
    assert.equal(resposta.status, 403);
  }
});

/* ------------------------------------------------------- acesso a dados */

test("aluno só enxerga o próprio treino", async (t) => {
  const { api, tokenProfessor, aluno } = await cenario();
  t.after(() => api.encerrar());

  const outro = await api.post(
    "/professores/alunos",
    { ...ALUNO, cpf: "44444444444", titulo: "444444444444", email: "outro@teste.com" },
    { token: tokenProfessor }
  );
  const idOutro = outro.corpo.aluno.id;

  await api.post(
    "/professores/treino",
    {
      id_aluno: idOutro,
      exercicios: [{ id_exercicio: 1, numero_serie: 4, repeticoes: "10", carga: 50 }],
    },
    { token: tokenProfessor }
  );

  // O aluno do cenário não tem treino. Tentar forçar o id do outro por query
  // string ou corpo não pode mudar o resultado.
  const tentativas = [
    await api.get("/alunos/meutreino", { token: aluno.token }),
    await api.get(`/alunos/meutreino?id=${idOutro}`, { token: aluno.token }),
    await api.get(`/alunos/meutreino?id_aluno=${idOutro}`, { token: aluno.token }),
    await api.get(`/alunos/meutreino?usuario=${idOutro}`, { token: aluno.token }),
  ];

  for (const resposta of tentativas) {
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.treino, null, "não pode devolver o treino de outro aluno");
  }
});

test("pedido de treino é sempre em nome de quem está logado", async (t) => {
  const { api, tokenProfessor, aluno } = await cenario();
  t.after(() => api.encerrar());

  const outro = await api.post(
    "/professores/alunos",
    { ...ALUNO, cpf: "44444444444", titulo: "444444444444", email: "outro@teste.com" },
    { token: tokenProfessor }
  );

  await api.post(
    "/alunos/pedidotreino",
    { observacao: "em nome de outro", id_aluno: outro.corpo.aluno.id },
    { token: aluno.token }
  );

  const pedidos = await api.get("/professores/treino/pedidos", { token: tokenProfessor });
  assert.equal(pedidos.corpo.length, 1);
  assert.equal(pedidos.corpo[0].id_aluno, aluno.id, "o id_aluno do corpo tem que ser ignorado");
});

test("a senha nunca aparece em nenhuma resposta", async (t) => {
  const { api, tokenProfessor, aluno } = await cenario();
  t.after(() => api.encerrar());

  const respostas = await Promise.all([
    api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha }),
    api.get("/me", { token: tokenProfessor }),
    api.get("/me", { token: aluno.token }),
    api.get("/professores/alunos", { token: tokenProfessor }),
    api.get("/professores/professores", { token: tokenProfessor }),
    api.get(`/professores/aluno/${aluno.id}`, { token: tokenProfessor }),
    api.post("/professores/usuario/cpfoutitulo", { cpf: ALUNO.cpf }, { token: tokenProfessor }),
    api.put(`/professores/aluno/${aluno.id}`, { nome: "Outro" }, { token: tokenProfessor }),
  ]);

  for (const resposta of respostas) {
    const texto = JSON.stringify(resposta.corpo);
    assert.ok(!texto.includes('"senha"'), `campo senha vazou: ${texto.slice(0, 200)}`);
    assert.ok(!texto.includes(ALUNO.senha), "a senha em claro vazou");
    // O hash tem o formato "<sal_hex>:<hash_hex>".
    assert.ok(!/[0-9a-f]{64}:[0-9a-f]{128}/.test(texto), "o hash da senha vazou");
  }
});

/* ------------------------------------------------------------- injeção */

test("SQL injection na busca de alunos não afeta a consulta", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const cargas = [
    "' OR '1'='1",
    "'; DROP TABLE usuario; --",
    "%' OR ativo = TRUE --",
    "\\'; SELECT 1; --",
  ];

  for (const carga of cargas) {
    const resposta = await api.get(
      `/professores/alunos?busca=${encodeURIComponent(carga)}`,
      { token: tokenProfessor }
    );
    assert.equal(resposta.status, 200, `falhou para: ${carga}`);
    assert.deepEqual(resposta.corpo, [], `a injeção retornou linhas: ${carga}`);
  }

  // A tabela continua de pé.
  const depois = await api.get("/professores/alunos", { token: tokenProfessor });
  assert.equal(depois.status, 200);
  assert.equal(depois.corpo.length, 1);
});

test("SQL injection no login não autentica ninguém", async (t) => {
  const { api } = await cenario();
  t.after(() => api.encerrar());

  const cargas = [
    { cpf: "' OR 1=1 --", senha: "qualquer" },
    { cpf: "admin'--", senha: "qualquer" },
    { cpf: ALUNO.cpf, senha: "' OR '1'='1" },
  ];

  for (const carga of cargas) {
    const resposta = await api.post("/login", carga);
    assert.ok(resposta.status >= 400, `autenticou com ${JSON.stringify(carga)}`);
    assert.equal(resposta.corpo.token, undefined);
  }
});

test("tipos inesperados no corpo não derrubam a API", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const corpos = [
    { cpf: { $ne: null }, senha: "x" },
    { cpf: ["1", "2"], senha: "x" },
    { cpf: 12345678901, senha: 123 },
    { cpf: null, senha: null },
    { cpf: true, senha: true },
    {},
  ];

  for (const corpo of corpos) {
    const resposta = await api.post("/login", corpo);
    assert.ok(
      resposta.status === 400 || resposta.status === 401,
      `esperava 400/401 para ${JSON.stringify(corpo)}, veio ${resposta.status}`
    );
  }

  // O mesmo para o cadastro, que monta SQL dinamicamente.
  const cadastro = await api.post(
    "/professores/alunos",
    { cpf: { toString: 1 }, nome: [], senha: {}, email: 42, titulo: null },
    { token: tokenProfessor }
  );
  assert.equal(cadastro.status, 400);
});

test("identificadores não numéricos na rota não chegam ao banco", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const rotas = [
    "/professores/aluno/1 OR 1=1",
    "/professores/aluno/abc",
    "/professores/aluno/-1",
    "/professores/aluno/0",
    "/professores/aluno/1.5",
    "/professores/professor/abc",
    "/professores/aluno/abc/treino",
  ];

  for (const rota of rotas) {
    const resposta = await api.get(encodeURI(rota), { token: tokenProfessor });
    assert.equal(resposta.status, 400, `esperava 400 em ${rota}, veio ${resposta.status}`);
  }
});

/* ------------------------------------------------ blocos de treino */

test("id_bloco de outro aluno não inicia sessão", async (t) => {
  const { api, tokenProfessor, aluno } = await cenario();
  t.after(() => api.encerrar());

  const vitima = await api.post(
    "/professores/alunos",
    { ...ALUNO, cpf: "44444444444", titulo: "444444444444", email: "v@teste.com" },
    { token: tokenProfessor }
  );
  await api.post(
    "/professores/treino",
    { id_aluno: vitima.corpo.aluno.id, blocos: [{ exercicios: [EXERCICIO] }] },
    { token: tokenProfessor }
  );
  const loginVitima = await api.post("/login", { cpf: "44444444444", senha: ALUNO.senha });
  const treinoVitima = await api.get("/alunos/meutreino", { token: loginVitima.corpo.token });
  const blocoDaVitima = treinoVitima.corpo.blocos[0].id_bloco;

  // O atacante tem treino próprio, então o erro não pode ser "sem treino".
  await api.post(
    "/professores/treino",
    { id_aluno: aluno.id, blocos: [{ exercicios: [EXERCICIO] }] },
    { token: tokenProfessor }
  );

  const invasao = await api.post(
    "/alunos/treino/sessao",
    { id_bloco: blocoDaVitima },
    { token: aluno.token }
  );

  assert.equal(invasao.status, 404);
  const abertas = await api.get("/alunos/treino/sessao", { token: aluno.token });
  assert.equal(abertas.corpo, null, "nenhuma sessão pode ter sido criada");
});

test("id_bloco com tipo inesperado não derruba nem cria sessão", async (t) => {
  const { api, tokenProfessor, aluno } = await cenario();
  t.after(() => api.encerrar());

  await api.post(
    "/professores/treino",
    { id_aluno: aluno.id, blocos: [{ exercicios: [EXERCICIO] }] },
    { token: tokenProfessor }
  );

  for (const id_bloco of ["abc", "1 OR 1=1", -1, 0, 99999, {}, [], true]) {
    const resposta = await api.post("/alunos/treino/sessao", { id_bloco }, { token: aluno.token });
    assert.equal(
      resposta.status,
      404,
      `esperava 404 para id_bloco=${JSON.stringify(id_bloco)}, veio ${resposta.status}`
    );
    assert.ok(!JSON.stringify(resposta.corpo).includes("SELECT"));
  }
});

test("nome de bloco longo demais vira 400, não erro do banco", async (t) => {
  const { api, tokenProfessor, aluno } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.post(
    "/professores/treino",
    {
      id_aluno: aluno.id,
      blocos: [{ nome: "N".repeat(200), exercicios: [EXERCICIO] }],
    },
    { token: tokenProfessor }
  );

  assert.equal(resposta.status, 400);
  assert.ok(!JSON.stringify(resposta.corpo).includes("varchar"));
});

/* --------------------------------------------------- limites e recusas */

test("corpo JSON inválido devolve 400, não 500", async (t) => {
  const { api } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.requisicao("POST", "/login", { corpoBruto: "{cpf: nao-e-json" });
  assert.equal(resposta.status, 400);
});

test("payload gigante é recusado sem derrubar o processo", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const gigante = JSON.stringify({ nome: "x".repeat(3 * 1024 * 1024) });
  const resposta = await api.requisicao("POST", "/professores/alunos", {
    token: tokenProfessor,
    corpoBruto: gigante,
  });

  assert.equal(resposta.status, 413);

  // A API continua respondendo depois disso.
  const saude = await api.get("/health");
  assert.equal(saude.status, 200);
});

test("treino com quantidade absurda de exercícios é recusado", async (t) => {
  const { api, tokenProfessor, aluno } = await cenario();
  t.after(() => api.encerrar());

  // Sem limite, isso vira um INSERT com dezenas de milhares de parâmetros.
  const exercicios = Array.from({ length: 5000 }, () => ({
    id_exercicio: 1,
    numero_serie: 4,
    repeticoes: "10",
    carga: 10,
  }));

  const resposta = await api.post(
    "/professores/treino",
    { id_aluno: aluno.id, exercicios },
    { token: tokenProfessor }
  );

  assert.equal(resposta.status, 400);
  assert.match(resposta.corpo.message, /exercícios/i);
});

test("texto longo demais vira 400, não erro do banco", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.post(
    "/professores/alunos",
    {
      cpf: "55555555555",
      nome: "N".repeat(500),
      senha: "senha123",
      email: "n@teste.com",
      titulo: "555555555555",
    },
    { token: tokenProfessor }
  );

  assert.equal(resposta.status, 400);
  assert.ok(!JSON.stringify(resposta.corpo).includes("varchar"));
});

/* ------------------------------------------------- limite de tentativas */

test("força bruta no login é barrada com 429", async (t) => {
  const api = await criarApiDeTeste({ limites: { loginMaximo: 5 } });
  t.after(() => api.encerrar());
  await criarProfessorELogar(api);

  const respostas = [];
  for (let tentativa = 0; tentativa < 8; tentativa += 1) {
    respostas.push(await api.post("/login", { cpf: "11111111111", senha: `chute-${tentativa}` }));
  }

  const status = respostas.map((r) => r.status);
  assert.deepEqual(status.slice(0, 5), [401, 401, 401, 401, 401]);
  assert.deepEqual(status.slice(5), [429, 429, 429], "depois do limite tem que travar");
  assert.match(respostas.at(-1).corpo.message, /tentativas/i);
});

test("bloqueio de força bruta não impede outro usuário de entrar", async (t) => {
  const api = await criarApiDeTeste({ limites: { loginMaximo: 3 } });
  t.after(() => api.encerrar());
  const tokenProfessor = await criarProfessorELogar(api);
  await api.post("/professores/alunos", ALUNO, { token: tokenProfessor });

  // Esgota as tentativas do CPF do professor.
  for (let i = 0; i < 4; i += 1) {
    await api.post("/login", { cpf: "11111111111", senha: "errada" });
  }
  const professorBloqueado = await api.post("/login", { cpf: "11111111111", senha: "senha123" });

  // O aluno, do mesmo IP, continua conseguindo entrar: a chave é IP + CPF.
  const alunoEntra = await api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha });

  assert.equal(professorBloqueado.status, 429);
  assert.equal(alunoEntra.status, 200);
});

test("login correto não consome o limite", async (t) => {
  const api = await criarApiDeTeste({ limites: { loginMaximo: 3 } });
  t.after(() => api.encerrar());
  await criarProfessorELogar(api);

  for (let i = 0; i < 6; i += 1) {
    const resposta = await api.post("/login", { cpf: "11111111111", senha: "senha123" });
    assert.equal(resposta.status, 200, `login válido nº ${i + 1} foi barrado`);
  }
});

test("trocar de IPv6 dentro da mesma faixa não fura o limite", async (t) => {
  // Um cliente IPv6 normalmente dispõe de um /64 inteiro. Chaveando pelo
  // endereço cru, bastaria mudar o último bloco a cada tentativa para nunca
  // ser barrado. A chave tem que agrupar a faixa.
  const api = await criarApiDeTeste({ limites: { loginMaximo: 3 }, proxiesConfiaveis: 1 });
  t.after(() => api.encerrar());
  await criarProfessorELogar(api);

  const status = [];
  for (let i = 1; i <= 5; i += 1) {
    const resposta = await api.post(
      "/login",
      { cpf: "11111111111", senha: "errada" },
      { headers: { "X-Forwarded-For": `2001:db8:1234:5678::${i}` } }
    );
    status.push(resposta.status);
  }

  assert.deepEqual(status, [401, 401, 401, 429, 429]);
});

test("faixas IPv6 diferentes têm limites independentes", async (t) => {
  const api = await criarApiDeTeste({ limites: { loginMaximo: 2 }, proxiesConfiaveis: 1 });
  t.after(() => api.encerrar());
  await criarProfessorELogar(api);

  for (let i = 0; i < 3; i += 1) {
    await api.post(
      "/login",
      { cpf: "11111111111", senha: "errada" },
      { headers: { "X-Forwarded-For": "2001:db8:aaaa:1111::5" } }
    );
  }

  const outraFaixa = await api.post(
    "/login",
    { cpf: "11111111111", senha: "errada" },
    { headers: { "X-Forwarded-For": "2001:db8:bbbb:2222::5" } }
  );

  assert.equal(outraFaixa.status, 401, "o bloqueio não pode vazar para outra faixa");
});

test("teto geral de requisições responde 429", async (t) => {
  const api = await criarApiDeTeste({ limites: { geralMaximo: 10 } });
  t.after(() => api.encerrar());

  const status = [];
  for (let i = 0; i < 12; i += 1) {
    status.push((await api.get("/health")).status);
  }

  assert.equal(status.filter((s) => s === 200).length, 10);
  assert.equal(status.filter((s) => s === 429).length, 2);
});

/* ----------------------------------------------------------------- CORS */

test("CORS libera só as origens configuradas", async (t) => {
  const { api } = await cenario();
  t.after(() => api.encerrar());

  const permitida = await api.get("/health", {
    headers: { Origin: "http://localhost:5173" },
  });
  const bloqueada = await api.get("/health", {
    headers: { Origin: "http://site-malicioso.example" },
  });

  assert.equal(
    permitida.headers.get("access-control-allow-origin"),
    "http://localhost:5173"
  );
  assert.equal(
    bloqueada.headers.get("access-control-allow-origin"),
    null,
    "origem não configurada não pode receber liberação de CORS"
  );
});

/* ------------------------------------------------ vazamento de informação */

test("resposta de erro não traz stack trace nem detalhe interno", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const respostas = await Promise.all([
    api.get("/professores/aluno/999999", { token: tokenProfessor }),
    api.get("/rota-inexistente"),
    api.post("/professores/treino", { id_aluno: "x" }, { token: tokenProfessor }),
    api.post("/login", { cpf: "00000000000", senha: "errada" }),
  ]);

  for (const resposta of respostas) {
    const texto = JSON.stringify(resposta.corpo);
    for (const proibido of ["at Object.", "node_modules", "SELECT", "INSERT", "pg-mem", "stack"]) {
      assert.ok(!texto.includes(proibido), `resposta vazou "${proibido}": ${texto.slice(0, 200)}`);
    }
  }
});

test("login não revela se um CPF está cadastrado", async (t) => {
  const { api } = await cenario();
  t.after(() => api.encerrar());

  const existente = await api.post("/login", { cpf: ALUNO.cpf, senha: "senha-errada" });
  const inexistente = await api.post("/login", { cpf: "98765432100", senha: "senha-errada" });

  assert.equal(existente.status, inexistente.status);
  assert.deepEqual(existente.corpo, inexistente.corpo);
});

test("usuário desativado não consegue entrar nem usar o token antigo", async (t) => {
  const { api, tokenProfessor, aluno } = await cenario();
  t.after(() => api.encerrar());

  await api.put("/professores/alunos/desativar", { cpf: ALUNO.cpf }, { token: tokenProfessor });

  const login = await api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha });
  const comTokenAntigo = await api.get("/alunos/meutreino", { token: aluno.token });

  assert.equal(login.status, 401);
  assert.equal(comTokenAntigo.status, 401);
});

/* --------------------------------------- edição de treino: ids do corpo */

// O PUT de treino aceita o id de cada linha para saber o que atualizar. Sem
// conferir a quem esses ids pertencem, mandar o id de outro treino faria
// UPDATE na ficha alheia — IDOR de escrita, não só de leitura.
test("id de exercício de outro treino não é atualizado pelo PUT", async (t) => {
  const { api, tokenProfessor, aluno } = await cenario();
  t.after(() => api.encerrar());

  const outro = await api.post(
    "/professores/alunos",
    { ...ALUNO, cpf: "33333333333", titulo: "333333333333", email: "outro@teste.com" },
    { token: tokenProfessor }
  );
  const idOutro = outro.corpo.aluno.id;

  for (const id of [aluno.id, idOutro]) {
    const resposta = await api.post(
      "/professores/treino",
      { id_aluno: id, blocos: [{ nome: null, exercicios: [EXERCICIO] }] },
      { token: tokenProfessor }
    );
    assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
  }

  const meu = await api.get(`/professores/aluno/${aluno.id}/treino`, { token: tokenProfessor });
  const alheio = await api.get(`/professores/aluno/${idOutro}/treino`, { token: tokenProfessor });
  const linhaAlheia = alheio.corpo.blocos[0].exercicios[0];

  const resposta = await api.put(
    `/professores/treino/${meu.corpo.treino.id_treino}`,
    {
      blocos: [
        {
          id_bloco: meu.corpo.blocos[0].id_bloco,
          nome: null,
          exercicios: [{ ...linhaAlheia, carga: 999 }],
        },
      ],
    },
    { token: tokenProfessor }
  );

  assert.ok(resposta.status >= 400, `esperava recusa, veio ${resposta.status}`);

  const depois = await api.get(`/professores/aluno/${idOutro}/treino`, { token: tokenProfessor });
  assert.equal(depois.corpo.blocos[0].exercicios[0].carga, linhaAlheia.carga, "a ficha alheia mudou");
});

test("id de bloco de outro treino não é atualizado pelo PUT", async (t) => {
  const { api, tokenProfessor, aluno } = await cenario();
  t.after(() => api.encerrar());

  const outro = await api.post(
    "/professores/alunos",
    { ...ALUNO, cpf: "33333333333", titulo: "333333333333", email: "outro@teste.com" },
    { token: tokenProfessor }
  );
  const idOutro = outro.corpo.aluno.id;

  for (const id of [aluno.id, idOutro]) {
    await api.post(
      "/professores/treino",
      { id_aluno: id, blocos: [{ nome: "Original", exercicios: [EXERCICIO] }] },
      { token: tokenProfessor }
    );
  }

  const meu = await api.get(`/professores/aluno/${aluno.id}/treino`, { token: tokenProfessor });
  const alheio = await api.get(`/professores/aluno/${idOutro}/treino`, { token: tokenProfessor });

  const resposta = await api.put(
    `/professores/treino/${meu.corpo.treino.id_treino}`,
    {
      blocos: [
        { id_bloco: alheio.corpo.blocos[0].id_bloco, nome: "Sequestrado", exercicios: [EXERCICIO] },
      ],
    },
    { token: tokenProfessor }
  );

  assert.ok(resposta.status >= 400, `esperava recusa, veio ${resposta.status}`);

  const depois = await api.get(`/professores/aluno/${idOutro}/treino`, { token: tokenProfessor });
  assert.equal(depois.corpo.blocos[0].nome, "Original", "o bloco alheio foi renomeado");
});

test("aluno não edita o próprio treino pelo PUT de professor", async (t) => {
  const { api, tokenProfessor, aluno } = await cenario();
  t.after(() => api.encerrar());

  await api.post(
    "/professores/treino",
    { id_aluno: aluno.id, blocos: [{ nome: null, exercicios: [EXERCICIO] }] },
    { token: tokenProfessor }
  );
  const meu = await api.get(`/professores/aluno/${aluno.id}/treino`, { token: tokenProfessor });

  const resposta = await api.put(
    `/professores/treino/${meu.corpo.treino.id_treino}`,
    { blocos: [{ nome: null, exercicios: [{ ...EXERCICIO, carga: 500 }] }] },
    { token: aluno.token }
  );

  assert.equal(resposta.status, 403);
});
