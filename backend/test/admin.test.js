import test from "node:test";
import assert from "node:assert/strict";
import { criarApiDeTeste, criarAdminELogar, criarProfessorELogar } from "./helpers.js";

test("o /me de um admin traz cargo e perfis com admin", async (t) => {
  const api = await criarApiDeTeste();
  t.after(() => api.encerrar());
  const token = await criarAdminELogar(api);

  const resposta = await api.get("/me", { token });

  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
  assert.equal(resposta.corpo.cargo, "admin");
  assert.equal(resposta.corpo.perfis.admin, true);
});

// admin > professor > aluno: quem acumula os três abre no painel de admin.
test("o cargo principal de quem tem os três perfis é admin", async (t) => {
  const api = await criarApiDeTeste();
  t.after(() => api.encerrar());
  const token = await criarAdminELogar(api);

  const resposta = await api.get("/me", { token });

  assert.equal(resposta.corpo.cargo, "admin");
  assert.deepEqual(resposta.corpo.perfis, { aluno: true, professor: true, admin: true });
});

test("professor sem a flag admin não é admin", async (t) => {
  const api = await criarApiDeTeste();
  t.after(() => api.encerrar());
  const token = await criarProfessorELogar(api);

  const resposta = await api.get("/me", { token });

  assert.equal(resposta.corpo.cargo, "professor");
  assert.equal(resposta.corpo.perfis.admin, false);
});

const ALUNO = {
  cpf: "22222222222",
  nome: "Aluno Teste",
  senha: "senha123",
  email: "aluno@teste.com",
  titulo: "222222222222",
};

/** Admin logado, com um aluno já cadastrado. */
async function cenarioComAluno() {
  const api = await criarApiDeTeste();
  const token = await criarAdminELogar(api);
  const criado = await api.post("/professores/alunos", ALUNO, { token });
  assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
  return { api, token, idAluno: criado.corpo.aluno.id };
}

test("admin lista todos os usuários, de qualquer perfil", async (t) => {
  const { api, token } = await cenarioComAluno();
  t.after(() => api.encerrar());

  const resposta = await api.get("/admin/usuarios", { token });

  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
  assert.equal(resposta.corpo.length, 2);
  assert.ok(resposta.corpo.every((u) => u.senha === undefined), "a listagem vazou senha");
});

test("filtra a listagem por perfil", async (t) => {
  const { api, token } = await cenarioComAluno();
  t.after(() => api.encerrar());

  const admins = await api.get("/admin/usuarios?perfil=admin", { token });
  assert.equal(admins.corpo.length, 1);
  assert.equal(admins.corpo[0].admin, true);

  // O admin do cenário também é aluno: são dois.
  const alunos = await api.get("/admin/usuarios?perfil=aluno", { token });
  assert.equal(alunos.corpo.length, 2);
});

// O nome do perfil entra na SQL, então aceitá-lo cru seria injeção pelo
// nome do campo.
test("recusa perfil fora da lista fechada", async (t) => {
  const { api, token } = await cenarioComAluno();
  t.after(() => api.encerrar());

  const resposta = await api.get("/admin/usuarios?perfil=ativo", { token });
  assert.equal(resposta.status, 400);
});

test("filtra a listagem por status", async (t) => {
  const { api, token } = await cenarioComAluno();
  t.after(() => api.encerrar());

  await api.put("/professores/alunos/desativar", { cpf: ALUNO.cpf }, { token });

  const ativos = await api.get("/admin/usuarios?status=ativos", { token });
  assert.equal(ativos.corpo.length, 1);

  const inativos = await api.get("/admin/usuarios?status=inativos", { token });
  assert.equal(inativos.corpo.length, 1);
  assert.equal(inativos.corpo[0].cpf, ALUNO.cpf);
});

test("admin redefine a senha de outro usuário", async (t) => {
  const { api, token, idAluno } = await cenarioComAluno();
  t.after(() => api.encerrar());

  const resposta = await api.put(
    `/admin/usuarios/${idAluno}/senha`,
    { senha_nova: "senhaTemporaria1" },
    { token }
  );
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

  const comNova = await api.post("/login", { cpf: ALUNO.cpf, senha: "senhaTemporaria1" });
  assert.equal(comNova.status, 200);
});

// Se o motivo da redefinição foi conta comprometida, deixar a sessão do
// invasor de pé anularia o propósito.
test("redefinir a senha derruba as sessões daquele usuário", async (t) => {
  const { api, token, idAluno } = await cenarioComAluno();
  t.after(() => api.encerrar());

  const login = await api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha });
  const tokenAluno = login.corpo.token;
  assert.equal((await api.get("/me", { token: tokenAluno })).status, 200);

  await api.put(`/admin/usuarios/${idAluno}/senha`, { senha_nova: "senhaTemporaria1" }, { token });

  // O corte precisa ficar depois do iat, que tem resolução de segundos.
  api.memoria.public.none(
    `UPDATE usuario SET sessoes_invalidadas_em = NOW() + INTERVAL '10 seconds' WHERE id = ${idAluno}`
  );

  assert.equal((await api.get("/me", { token: tokenAluno })).status, 401);
});

// A rota de admin não pede a senha atual. Se o admin pudesse usá-la em si
// mesmo, a exigência da senha atual em /me/senha viraria decorativa
// justamente para a conta que mais importa.
test("admin não redefine a própria senha pela rota de admin", async (t) => {
  const { api, token } = await cenarioComAluno();
  t.after(() => api.encerrar());

  const eu = await api.get("/me", { token });

  const resposta = await api.put(
    `/admin/usuarios/${eu.corpo.id}/senha`,
    { senha_nova: "senhaTemporaria1" },
    { token }
  );

  assert.equal(resposta.status, 403, JSON.stringify(resposta.corpo));
});

test("redefinir senha de usuário inexistente devolve 404", async (t) => {
  const { api, token } = await cenarioComAluno();
  t.after(() => api.encerrar());

  const resposta = await api.put(
    "/admin/usuarios/9999/senha",
    { senha_nova: "senhaTemporaria1" },
    { token }
  );

  assert.equal(resposta.status, 404);
});

test("redefinir com senha curta demais devolve 400", async (t) => {
  const { api, token, idAluno } = await cenarioComAluno();
  t.after(() => api.encerrar());

  const resposta = await api.put(
    `/admin/usuarios/${idAluno}/senha`,
    { senha_nova: "123" },
    { token }
  );

  assert.equal(resposta.status, 400);
});

/* ------------------------------------------ alteracao de dados */

test("admin altera os dados de um aluno", async (t) => {
  const { api, token, idAluno } = await cenarioComAluno();
  t.after(() => api.encerrar());

  const resposta = await api.put(
    `/admin/usuarios/${idAluno}`,
    { nome: "Ana Maria Souza", email: "ana.maria@teste.com" },
    { token }
  );

  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
  assert.equal(resposta.corpo.usuario.nome, "Ana Maria Souza");
  assert.equal(resposta.corpo.usuario.email, "ana.maria@teste.com");
});

// A rota de professor só edita aluno; esta é a única que alcança qualquer um.
test("admin altera os dados de um professor", async (t) => {
  const { api, token } = await cenarioComAluno();
  t.after(() => api.encerrar());

  const criado = await api.post(
    "/professores/professores",
    {
      cpf: "44444444444",
      nome: "Professor Novo",
      senha: "senha123",
      email: "prof.novo@teste.com",
      titulo: "444444444444",
    },
    { token }
  );

  const resposta = await api.put(
    `/admin/usuarios/${criado.corpo.professor.id}`,
    { nome: "Professor Renomeado" },
    { token }
  );

  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
  assert.equal(resposta.corpo.usuario.nome, "Professor Renomeado");
});

test("admin altera os próprios dados", async (t) => {
  const { api, token } = await cenarioComAluno();
  t.after(() => api.encerrar());

  const eu = await api.get("/me", { token });

  const resposta = await api.put(
    `/admin/usuarios/${eu.corpo.id}`,
    { nome: "Cristhian B. Cintra" },
    { token }
  );

  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
});

test("alterar usuário inexistente devolve 404", async (t) => {
  const { api, token } = await cenarioComAluno();
  t.after(() => api.encerrar());

  const resposta = await api.put("/admin/usuarios/9999", { nome: "Fantasma" }, { token });
  assert.equal(resposta.status, 404);
});

test("recusa alteração sem nenhum campo válido", async (t) => {
  const { api, token, idAluno } = await cenarioComAluno();
  t.after(() => api.encerrar());

  const resposta = await api.put(`/admin/usuarios/${idAluno}`, {}, { token });
  assert.equal(resposta.status, 400);
});

test("recusa CPF que já pertence a outro usuário", async (t) => {
  const { api, token, idAluno } = await cenarioComAluno();
  t.after(() => api.encerrar());

  const eu = await api.get("/me", { token });

  const resposta = await api.put(`/admin/usuarios/${idAluno}`, { cpf: eu.corpo.cpf }, { token });

  assert.equal(resposta.status, 409, JSON.stringify(resposta.corpo));
});

/* ------------------------------------------------ perfis */

test("promove um aluno a professor", async (t) => {
  const { api, token, idAluno } = await cenarioComAluno();
  t.after(() => api.encerrar());

  const resposta = await api.put(
    `/admin/usuarios/${idAluno}/perfis`,
    { aluno: true, professor: true, admin: false },
    { token }
  );

  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
  assert.equal(resposta.corpo.usuario.professor, true);

  // O cargo principal muda junto, e é o que decide para onde o app abre.
  const login = await api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha });
  assert.equal(login.corpo.usuario.cargo, "professor");
});

test("rebaixa um professor a aluno", async (t) => {
  const { api, token, idAluno } = await cenarioComAluno();
  t.after(() => api.encerrar());

  await api.put(
    `/admin/usuarios/${idAluno}/perfis`,
    { aluno: true, professor: true, admin: false },
    { token }
  );
  const resposta = await api.put(
    `/admin/usuarios/${idAluno}/perfis`,
    { aluno: true, professor: false, admin: false },
    { token }
  );

  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
  assert.equal(resposta.corpo.usuario.professor, false);
});

test("promove alguém a admin", async (t) => {
  const { api, token, idAluno } = await cenarioComAluno();
  t.after(() => api.encerrar());

  const resposta = await api.put(
    `/admin/usuarios/${idAluno}/perfis`,
    { aluno: true, professor: false, admin: true },
    { token }
  );

  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

  const login = await api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha });
  assert.equal(login.corpo.usuario.cargo, "admin");

  const alcanca = await api.get("/admin/usuarios", { token: login.corpo.token });
  assert.equal(alcanca.status, 200, "o admin novo não alcançou a própria área");
});

// Com outro admin no ar, rebaixar um deles é legítimo.
test("rebaixa um admin quando existe outro", async (t) => {
  const { api, token, idAluno } = await cenarioComAluno();
  t.after(() => api.encerrar());

  await api.put(
    `/admin/usuarios/${idAluno}/perfis`,
    { aluno: true, professor: false, admin: true },
    { token }
  );

  const resposta = await api.put(
    `/admin/usuarios/${idAluno}/perfis`,
    { aluno: true, professor: false, admin: false },
    { token }
  );

  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
});

test("alterar perfis de usuário inexistente devolve 404", async (t) => {
  const { api, token } = await cenarioComAluno();
  t.after(() => api.encerrar());

  const resposta = await api.put(
    "/admin/usuarios/9999/perfis",
    { aluno: true, professor: false, admin: false },
    { token }
  );

  assert.equal(resposta.status, 404);
});
