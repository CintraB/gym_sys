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

async function cenario() {
  const api = await criarApiDeTeste();
  const tokenProfessor = await criarProfessorELogar(api);
  return { api, tokenProfessor };
}

async function comAluno(api, tokenProfessor) {
  const criado = await api.post("/professores/alunos", ALUNO, { token: tokenProfessor });
  assert.equal(criado.status, 201, JSON.stringify(criado.corpo));

  const login = await api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha });
  assert.equal(login.status, 200, JSON.stringify(login.corpo));

  return { id: criado.corpo.aluno.id, token: login.corpo.token };
}

test("health check responde sem autenticação", async (t) => {
  const { api } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.get("/health");
  assert.equal(resposta.status, 200);
  assert.deepEqual(resposta.corpo, { status: "ok" });
});

test("login devolve token e o nome do usuário", async (t) => {
  const { api } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.post("/login", { cpf: "11111111111", senha: "senha123" });

  assert.equal(resposta.status, 200);
  assert.ok(resposta.corpo.token);
  assert.equal(resposta.corpo.usuario.nome, "Professor Teste");
  assert.equal(resposta.corpo.usuario.cargo, "professor");
});

test("login com senha errada devolve 401 sem revelar se o CPF existe", async (t) => {
  const { api } = await cenario();
  t.after(() => api.encerrar());

  const senhaErrada = await api.post("/login", { cpf: "11111111111", senha: "errada" });
  const cpfInexistente = await api.post("/login", { cpf: "99999999999", senha: "errada" });

  assert.equal(senhaErrada.status, 401);
  assert.equal(cpfInexistente.status, 401);
  assert.equal(senhaErrada.corpo.message, cpfInexistente.corpo.message);
});

test("login aceita CPF com máscara", async (t) => {
  const { api } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.post("/login", { cpf: "111.111.111-11", senha: "senha123" });
  assert.equal(resposta.status, 200);
});

test("rota protegida exige token", async (t) => {
  const { api } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.get("/professores/alunos");
  assert.equal(resposta.status, 401);
});

test("token de aluno não acessa rotas de professor", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const aluno = await comAluno(api, tokenProfessor);
  const resposta = await api.get("/professores/alunos", { token: aluno.token });

  assert.equal(resposta.status, 403);
});

test("token de professor não acessa rotas de aluno", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.get("/alunos/meutreino", { token: tokenProfessor });
  assert.equal(resposta.status, 403);
});

test("cadastro de aluno valida os dados de entrada", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const cpfCurto = await api.post(
    "/professores/alunos",
    { ...ALUNO, cpf: "123" },
    { token: tokenProfessor }
  );
  const senhaCurta = await api.post(
    "/professores/alunos",
    { ...ALUNO, senha: "123" },
    { token: tokenProfessor }
  );

  assert.equal(cpfCurto.status, 400);
  assert.match(cpfCurto.corpo.message, /CPF/);
  assert.equal(senhaCurta.status, 400);
  assert.match(senhaCurta.corpo.message, /Senha/);
});

test("cadastro rejeita CPF duplicado", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  await comAluno(api, tokenProfessor);
  const repetido = await api.post("/professores/alunos", ALUNO, { token: tokenProfessor });

  assert.equal(repetido.status, 409);
});

test("treino usa o professor do token, ignorando id_professor do corpo", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const aluno = await comAluno(api, tokenProfessor);

  const criado = await api.post(
    "/professores/treino",
    {
      id_aluno: aluno.id,
      id_professor: 9999, // tentativa de registrar em nome de outro professor
      exercicios: [
        { id_exercicio: 1, numero_serie: 4, repeticoes: "10 a 15", carga: 20 },
        { id_exercicio: 2, numero_serie: 3, repeticoes: "12", carga: 15 },
      ],
    },
    { token: tokenProfessor }
  );

  assert.equal(criado.status, 201, JSON.stringify(criado.corpo));

  const treino = await api.get("/alunos/meutreino", { token: aluno.token });
  assert.equal(treino.corpo.treino.nome_professor, "Professor Teste");
  assert.equal(treino.corpo.blocos.length, 1, "sem divisão, vira um bloco A");
  assert.equal(treino.corpo.blocos[0].letra, "A");
  assert.equal(treino.corpo.blocos[0].exercicios.length, 2);
});

test("treino rejeita exercícios incompletos", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const aluno = await comAluno(api, tokenProfessor);

  const semExercicios = await api.post(
    "/professores/treino",
    { id_aluno: aluno.id, exercicios: [] },
    { token: tokenProfessor }
  );
  const seriesNegativas = await api.post(
    "/professores/treino",
    {
      id_aluno: aluno.id,
      exercicios: [
        { id_exercicio: 1, numero_serie: 4, repeticoes: "10" },
        { id_exercicio: 2, numero_serie: -1, repeticoes: "10" },
      ],
    },
    { token: tokenProfessor }
  );

  assert.equal(semExercicios.status, 400);
  assert.equal(seriesNegativas.status, 400);
  assert.match(seriesNegativas.corpo.message, /Exercício 2/);
});

test("treino aceita exercício de cardio sem séries nem carga", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const aluno = await comAluno(api, tokenProfessor);

  // ESTEIRA — registrada só com a observação de tempo e intensidade.
  const criado = await api.post(
    "/professores/treino",
    {
      id_aluno: aluno.id,
      exercicios: [
        {
          id_exercicio: 36,
          numero_serie: 0,
          repeticoes: "",
          carga: "",
          observacao_ex_usuario: "20 min / moderado",
        },
      ],
    },
    { token: tokenProfessor }
  );

  assert.equal(criado.status, 201, JSON.stringify(criado.corpo));

  const treino = await api.get("/alunos/meutreino", { token: aluno.token });
  assert.equal(treino.corpo.blocos[0].exercicios[0].carga, 0);
  assert.equal(treino.corpo.blocos[0].exercicios[0].observacao_ex_usuario, "20 min / moderado");
});

test("novo treino substitui o anterior em vez de acumular exercícios", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const aluno = await comAluno(api, tokenProfessor);

  await api.post(
    "/professores/treino",
    {
      id_aluno: aluno.id,
      exercicios: [{ id_exercicio: 1, numero_serie: 4, repeticoes: "10", carga: 20 }],
    },
    { token: tokenProfessor }
  );
  await api.post(
    "/professores/treino",
    {
      id_aluno: aluno.id,
      exercicios: [
        { id_exercicio: 3, numero_serie: 3, repeticoes: "12", carga: 30 },
        { id_exercicio: 4, numero_serie: 3, repeticoes: "12", carga: 40 },
      ],
    },
    { token: tokenProfessor }
  );

  const treino = await api.get("/alunos/meutreino", { token: aluno.token });
  assert.equal(treino.corpo.blocos[0].exercicios.length, 2);

  const historico = await api.get("/alunos/historico", { token: aluno.token });
  assert.equal(historico.corpo.length, 2, "os dois treinos ficam no histórico");
});

test("aluno sem treino recebe resposta vazia, não erro", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const aluno = await comAluno(api, tokenProfessor);
  const treino = await api.get("/alunos/meutreino", { token: aluno.token });

  assert.equal(treino.status, 200);
  assert.equal(treino.corpo.treino, null);
  assert.deepEqual(treino.corpo.blocos, []);
});

test("pedido de treino não pode ser duplicado", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const aluno = await comAluno(api, tokenProfessor);

  const primeiro = await api.post("/alunos/pedidotreino", { observacao: "joelho" }, { token: aluno.token });
  const segundo = await api.post("/alunos/pedidotreino", { observacao: "de novo" }, { token: aluno.token });

  assert.equal(primeiro.status, 201);
  assert.equal(segundo.status, 409);
});

test("montar o treino encerra o pedido em aberto do aluno", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const aluno = await comAluno(api, tokenProfessor);
  await api.post("/alunos/pedidotreino", { observacao: "quero treino novo" }, { token: aluno.token });

  const antes = await api.get("/professores/treino/pedidos", { token: tokenProfessor });
  assert.equal(antes.corpo.length, 1);
  assert.equal(antes.corpo[0].nome_aluno, ALUNO.nome);

  await api.post(
    "/professores/treino",
    {
      id_aluno: aluno.id,
      exercicios: [{ id_exercicio: 1, numero_serie: 4, repeticoes: "10", carga: 20 }],
    },
    { token: tokenProfessor }
  );

  const depois = await api.get("/professores/treino/pedidos", { token: tokenProfessor });
  assert.equal(depois.corpo.length, 0);
});

test("desativar aluno impede novo login", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  await comAluno(api, tokenProfessor);
  const desativado = await api.put(
    "/professores/alunos/desativar",
    { cpf: ALUNO.cpf },
    { token: tokenProfessor }
  );
  assert.equal(desativado.status, 200);

  const login = await api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha });
  assert.equal(login.status, 401);
});

test("token de aluno desativado para de funcionar imediatamente", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const aluno = await comAluno(api, tokenProfessor);
  await api.put("/professores/alunos/desativar", { cpf: ALUNO.cpf }, { token: tokenProfessor });

  const resposta = await api.get("/alunos/meutreino", { token: aluno.token });
  assert.equal(resposta.status, 401);
});

test("busca de alunos filtra por nome e por CPF", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  await comAluno(api, tokenProfessor);

  const porNome = await api.get("/professores/alunos?busca=Aluno", { token: tokenProfessor });
  const porCpf = await api.get("/professores/alunos?busca=2222", { token: tokenProfessor });
  const semResultado = await api.get("/professores/alunos?busca=zzzzz", { token: tokenProfessor });

  assert.equal(porNome.corpo.length, 1);
  assert.equal(porCpf.corpo.length, 1);
  assert.equal(semResultado.corpo.length, 0);
});

// A busca precisa achar quem o professor procura, e ninguem digita respeitando
// maiuscula. No PostgreSQL isso e o ILIKE; no SQLite do APK, o LIKE, que ignora
// caixa por conta propria. Sem este teste a traducao de um para o outro nao
// tinha cobertura ponta a ponta: o caso acima busca "Aluno", que casa exato.
//
// Limite conhecido, e por isso o termo aqui e ASCII: o LIKE do SQLite so ignora
// caixa em ASCII. Buscar "JOSE" acha "Jose", mas "JOSÉ" nao acha "José" — no
// PostgreSQL acharia. Esta divergencia esta registrada na spec do app.
test("busca de alunos ignora maiuscula e minuscula", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  await comAluno(api, tokenProfessor);

  const minusculo = await api.get("/professores/alunos?busca=aluno", { token: tokenProfessor });
  const maiusculo = await api.get("/professores/alunos?busca=ALUNO", { token: tokenProfessor });
  const parcial = await api.get("/professores/alunos?busca=lUn", { token: tokenProfessor });

  assert.equal(minusculo.corpo.length, 1, "buscar em minusculas precisa achar");
  assert.equal(maiusculo.corpo.length, 1, "buscar em maiusculas precisa achar");
  assert.equal(parcial.corpo.length, 1, "pedaco do nome, em caixa trocada, precisa achar");
});

test("resumo do dashboard conta alunos e pedidos", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const aluno = await comAluno(api, tokenProfessor);
  await api.post("/alunos/pedidotreino", { observacao: "oi" }, { token: aluno.token });

  const resumo = await api.get("/professores/resumo", { token: tokenProfessor });

  assert.equal(resumo.status, 200);
  assert.equal(resumo.corpo.alunos_ativos, 1);
  assert.equal(resumo.corpo.pedidos_abertos, 1);
});

test("erro do banco não vaza detalhes para o cliente", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  // id não numérico é barrado na rota, antes de virar erro do Postgres
  const resposta = await api.get("/professores/aluno/abc", { token: tokenProfessor });

  assert.equal(resposta.status, 400);
  assert.equal(resposta.corpo.message, "Identificador inválido");
  assert.ok(
    !JSON.stringify(resposta.corpo).includes("SELECT"),
    "a resposta não pode conter a query"
  );
});

test("rota inexistente devolve 404 em JSON", async (t) => {
  const { api } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.get("/nao-existe");
  assert.equal(resposta.status, 404);
  assert.equal(resposta.corpo.message, "Rota não encontrada");
});

test("quem é professor e aluno alcança as duas áreas", async (t) => {
  const { api } = await cenario();
  t.after(() => api.encerrar());

  // O professor do cenário passa a ser aluno também — o caso de quem dá aula
  // e treina na mesma academia.
  api.executar("UPDATE usuario SET aluno = TRUE WHERE cpf = '11111111111'");

  const login = await api.post("/login", { cpf: "11111111111", senha: "senha123" });
  assert.deepEqual(login.corpo.usuario.perfis, { aluno: true, professor: true, admin: false });
  assert.equal(login.corpo.usuario.cargo, "professor", "o cargo principal continua professor");

  const token = login.corpo.token;
  const areaProfessor = await api.get("/professores/alunos", { token });
  const areaAluno = await api.get("/alunos/meutreino", { token });

  assert.equal(areaProfessor.status, 200);
  assert.equal(areaAluno.status, 200, "com aluno = true, a área do aluno abre");
});

test("perfil único não ganha acesso ao outro lado", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const criado = await api.post("/professores/alunos", ALUNO, { token: tokenProfessor });
  assert.equal(criado.status, 201);
  const login = await api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha });

  assert.deepEqual(login.corpo.usuario.perfis, { aluno: true, professor: false, admin: false });
  const tentativa = await api.get("/professores/alunos", { token: login.corpo.token });
  assert.equal(tentativa.status, 403);
});

test("/me devolve o perfil do token", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.get("/me", { token: tokenProfessor });

  assert.equal(resposta.status, 200);
  assert.equal(resposta.corpo.cargo, "professor");
  assert.equal(resposta.corpo.nome, "Professor Teste");
  assert.equal(resposta.corpo.senha, undefined, "a senha nunca pode ser devolvida");
});
