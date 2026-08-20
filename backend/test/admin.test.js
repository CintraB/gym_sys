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
