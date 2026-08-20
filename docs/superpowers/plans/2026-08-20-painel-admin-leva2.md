# Painel de admin, leva 2 — plano de implementação

> **Para quem executa:** use `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans` para tocar tarefa a tarefa. Os passos usam `- [ ]` para
> acompanhamento.

**Objetivo:** o admin edita os dados de qualquer usuário e muda os perfis de qualquer um, sem
conseguir deixar o sistema sem administrador.

**Arquitetura:** duas rotas novas em `adminController.js`, sobre a fundação da leva 1. As travas
ficam no controller, cada uma com teste de segurança próprio.

**Spec:** `docs/superpowers/specs/2026-08-20-painel-admin-design.md`

## Restrições globais

- **pt-BR** em nomes, mensagens e comentários.
- **Senha nunca entra nem sai por estas rotas.** Trocar senha é `/me/senha` e
  `/admin/usuarios/:id/senha`, que já existem. Um campo `senha` no corpo é ignorado, como já é
  ignorado no cadastro de aluno.
- **Nada de `console.error` em teste que passa.**
- **Não editar arquivo-fonte com `sed -i`**; use script Node.
- **`db/schema.sql` é a fonte da verdade** — mas esta leva **não muda o schema**.
- Commits em português, no imperativo, **sem `Co-Authored-By`**, direto na `main`, **sem push**.
- **TDD de verdade aqui:** o código é novo, então o ciclo normal vale — teste primeiro, ver
  vermelho, implementar, ver verde. Nada de "escrever contra o que já existe".

## As quatro travas

Cada uma vira um teste em `seguranca.test.js`, não só um `if`:

1. **O admin não retira o próprio `admin`.** Senão o sistema fica sem quem o administre, e o
   caminho de volta é SQL na mão.
2. **Não é possível tirar o `admin` do último admin ativo**, mesmo sendo outra pessoa. É a regra 1
   pela porta dos fundos.
3. **Nenhum usuário fica sem perfil.** Sem `aluno`, `professor` nem `admin`, a pessoa entra e não
   alcança tela nenhuma — o `RotaProtegida` a manda para uma área que ela não pode ver, e ela fica
   presa num redirecionamento sem destino.
4. **Os perfis vêm de uma lista fechada**, e nada mais no corpo toca a tabela.

A regra 2 vale também para `desativarUsuario`, que já existe no `professorController`: desativar o
último admin ativo tem o mesmo efeito que rebaixá-lo.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `backend/src/controllers/adminController.js` | `alterarUsuario` e `alterarPerfis` |
| `backend/src/routes/adminRoutes.js` | as duas rotas novas |
| `backend/src/controllers/professorController.js` | trava do último admin em `desativarUsuario` |
| `backend/test/admin.test.js` | casos de sucesso |
| `backend/test/seguranca.test.js` | as quatro travas |
| `frontend/src/pages/admin/EditarUsuario.tsx` | **novo** — modal de dados e perfis |
| `frontend/src/pages/admin/Usuarios.tsx` | botão "Editar" |

---

## Tarefa 1: editar os dados de qualquer usuário

**Arquivos:**
- Modificar: `backend/src/controllers/adminController.js`
- Modificar: `backend/src/routes/adminRoutes.js`
- Modificar: `backend/test/admin.test.js`
- Modificar: `backend/test/seguranca.test.js`

**Interfaces produzidas:**

```js
export const alterarUsuario   // PUT /admin/usuarios/:id  { nome?, cpf?, email?, titulo? }
```

- [ ] **Passo 1: escrever o teste**

Acrescentar a `backend/test/admin.test.js`:

```js
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

  const resposta = await api.put(
    `/admin/usuarios/${idAluno}`,
    { cpf: eu.corpo.cpf },
    { token }
  );

  assert.equal(resposta.status, 409, JSON.stringify(resposta.corpo));
});
```

E, em `backend/test/seguranca.test.js`:

```js
// Mesma regra do cadastro de aluno: flag de privilégio no corpo é ignorada.
// Aqui importa mais, porque a rota é de admin e o alvo é qualquer conta.
test("alterar usuário ignora perfis e senha vindos no corpo", async (t) => {
  const { api, aluno } = await cenario();
  t.after(() => api.encerrar());

  const { criarAdminELogar } = await import("./helpers.js");
  const token = await criarAdminELogar(api, { cpf: "99999999999" });

  const resposta = await api.put(
    `/admin/usuarios/${aluno.id}`,
    {
      nome: "Nome Novo",
      admin: true,
      professor: true,
      ativo: false,
      senha: "senha-injetada",
      id: 1,
    },
    { token }
  );

  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
  assert.equal(resposta.corpo.usuario.admin, false, "virou admin pelo corpo");
  assert.equal(resposta.corpo.usuario.professor, false, "virou professor pelo corpo");
  assert.equal(resposta.corpo.usuario.ativo, true, "foi desativado pelo corpo");

  // A senha antiga tem que continuar valendo: o campo não pode ter passado.
  const login = await api.post("/login", { cpf: ALUNO.cpf, senha: ALUNO.senha });
  assert.equal(login.status, 200, "a senha foi trocada por esta rota");
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `cd backend && node --test test/admin.test.js`
Esperado: FALHA com 404 — a rota não existe.

- [ ] **Passo 3: implementar**

Em `backend/src/controllers/adminController.js`, acrescentar:

```js
/**
 * Altera os dados de qualquer usuário.
 *
 * A rota do professor (`PUT /professores/aluno/:id`) só alcança aluno; esta
 * alcança qualquer conta, inclusive a do próprio admin.
 *
 * A lista de campos é fechada: perfis, `ativo` e `senha` não entram por aqui,
 * mesmo que venham no corpo. Perfil tem rota própria, com as travas; senha tem
 * duas; e `ativo` continua sendo desativar/reativar, que propagam para treino e
 * exercícios.
 */
export const alterarUsuario = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  const campos = {
    nome: typeof req.body?.nome === "string" ? req.body.nome.trim() : undefined,
    cpf: req.body?.cpf !== undefined ? normalizarDigitos(req.body.cpf) : undefined,
    email: typeof req.body?.email === "string" ? req.body.email.trim() : undefined,
    titulo: req.body?.titulo !== undefined ? normalizarDigitos(req.body.titulo) : undefined,
  };

  const atualizacoes = [];
  const valores = [];
  for (const [coluna, valor] of Object.entries(campos)) {
    if (valor) {
      valores.push(valor);
      atualizacoes.push(`${coluna} = $${valores.length}`);
    }
  }

  if (atualizacoes.length === 0) {
    throw erroRequisicao("Nenhum dado para atualizar");
  }

  // cpf e titulo são UNIQUE: conferir antes devolve 409 com mensagem em vez de
  // deixar o erro do Postgres subir.
  if (campos.cpf || campos.titulo) {
    const { rows: conflitos } = await db.query(
      `SELECT id FROM usuario
        WHERE id <> $1 AND (($2::text IS NOT NULL AND cpf = $2) OR ($3::text IS NOT NULL AND titulo = $3))`,
      [id, campos.cpf ?? null, campos.titulo ?? null]
    );
    if (conflitos.length > 0) {
      throw erroConflito("Já existe um usuário com esse CPF ou título");
    }
  }

  valores.push(req.usuario.id);
  atualizacoes.push(`atualizado_por = $${valores.length}`);
  valores.push(id);

  const { rows } = await db.query(
    `UPDATE usuario SET ${atualizacoes.join(", ")}
      WHERE id = $${valores.length}
      RETURNING ${CAMPOS_PUBLICOS}`,
    valores
  );

  if (rows.length === 0) {
    throw erroNaoEncontrado("Usuário não encontrado");
  }

  res.json({ message: "Dados alterados com sucesso", usuario: rows[0] });
});
```

Completar o import de `../lib/erros.js` com `erroConflito`.

- [ ] **Passo 4: a rota**

Em `backend/src/routes/adminRoutes.js`, antes da rota de senha:

```js
rotas.put("/usuarios/:id", admin.alterarUsuario);
```

- [ ] **Passo 5: rodar**

Run: `node --test`
Esperado: a suíte inteira verde.

- [ ] **Passo 6: provar que a lista fechada segura**

Em `alterarUsuario`, acrescentar `admin: req.body?.admin` ao objeto `campos`.

Run: `node --test test/seguranca.test.js`
Esperado: **"alterar usuário ignora perfis e senha vindos no corpo" fica vermelho.**

Desfazer e confirmar o verde.

- [ ] **Passo 7: commit**

```bash
cd ..
git add backend/src backend/test
git commit -F - <<'EOF'
Permite ao admin editar os dados de qualquer usuario

A rota do professor so alcanca aluno; esta alcanca qualquer conta,
inclusive a do proprio admin.

A lista de campos e fechada: perfil, ativo e senha nao entram por aqui
mesmo que venham no corpo. Perfil tem rota propria, com as travas;
senha tem duas; e ativo continua sendo desativar/reativar, que propagam
para treino e exercicios.
EOF
```

---

## Tarefa 2: promover e rebaixar perfis, com as travas

**Arquivos:**
- Modificar: `backend/src/controllers/adminController.js`
- Modificar: `backend/src/routes/adminRoutes.js`
- Modificar: `backend/src/controllers/professorController.js`
- Modificar: `backend/test/admin.test.js`
- Modificar: `backend/test/seguranca.test.js`

**Interfaces produzidas:**

```js
export const alterarPerfis   // PUT /admin/usuarios/:id/perfis  { aluno, professor, admin }
```

- [ ] **Passo 1: escrever os testes de sucesso**

Em `backend/test/admin.test.js`:

```js
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
```

- [ ] **Passo 2: escrever os testes das quatro travas**

Em `backend/test/seguranca.test.js`:

```js
/* ------------------------------------------- travas de perfil do admin */

async function cenarioAdmin() {
  const api = await criarApiDeTeste();
  const { criarAdminELogar } = await import("./helpers.js");
  const token = await criarAdminELogar(api, { cpf: "99999999999" });
  const eu = await api.get("/me", { token });
  return { api, token, idAdmin: eu.corpo.id };
}

// Sem isto, um clique distraído deixa o sistema sem quem o administre, e o
// caminho de volta é SQL na mão.
test("admin não retira o próprio perfil de admin", async (t) => {
  const { api, token, idAdmin } = await cenarioAdmin();
  t.after(() => api.encerrar());

  const resposta = await api.put(
    `/admin/usuarios/${idAdmin}/perfis`,
    { aluno: true, professor: true, admin: false },
    { token }
  );

  assert.ok(resposta.status >= 400, `esperava recusa, veio ${resposta.status}`);

  const depois = await api.get("/me", { token });
  assert.equal(depois.corpo.perfis.admin, true, "o admin perdeu o próprio perfil");
});

// A regra acima pela porta dos fundos: dois admins, um rebaixa o outro e
// depois sai — ou simplesmente rebaixa o último que restou.
test("não é possível rebaixar o último admin ativo", async (t) => {
  const { api, token, idAdmin } = await cenarioAdmin();
  t.after(() => api.encerrar());

  const criado = await api.post(
    "/professores/alunos",
    {
      cpf: "22222222222",
      nome: "Segundo Admin",
      senha: "senha123",
      email: "segundo@teste.com",
      titulo: "222222222222",
    },
    { token }
  );
  const idSegundo = criado.corpo.aluno.id;

  await api.put(
    `/admin/usuarios/${idSegundo}/perfis`,
    { aluno: true, professor: false, admin: true },
    { token }
  );

  const login = await api.post("/login", { cpf: "22222222222", senha: "senha123" });
  const tokenSegundo = login.corpo.token;

  // O segundo rebaixa o primeiro: legítimo, ainda sobra um.
  const primeiro = await api.put(
    `/admin/usuarios/${idAdmin}/perfis`,
    { aluno: true, professor: true, admin: false },
    { token: tokenSegundo }
  );
  assert.equal(primeiro.status, 200, JSON.stringify(primeiro.corpo));

  // Agora o segundo é o único. Rebaixar a si mesmo já é barrado pela outra
  // trava, então quem tenta é o primeiro — que não é mais admin e leva 403.
  const tentativa = await api.put(
    `/admin/usuarios/${idSegundo}/perfis`,
    { aluno: true, professor: false, admin: false },
    { token }
  );
  assert.equal(tentativa.status, 403, "quem não é mais admin não pode mexer em perfis");

  const aindaEhAdmin = await api.get("/me", { token: tokenSegundo });
  assert.equal(aindaEhAdmin.corpo.perfis.admin, true);
});

// Sem perfil nenhum a pessoa entra e não alcança tela alguma: o
// RotaProtegida a manda para uma área que ela não pode ver, e ela fica presa
// num redirecionamento sem destino.
test("usuário não pode ficar sem nenhum perfil", async (t) => {
  const { api, token } = await cenarioAdmin();
  t.after(() => api.encerrar());

  const criado = await api.post(
    "/professores/alunos",
    {
      cpf: "22222222222",
      nome: "Aluno Teste",
      senha: "senha123",
      email: "aluno@teste.com",
      titulo: "222222222222",
    },
    { token }
  );

  const resposta = await api.put(
    `/admin/usuarios/${criado.corpo.aluno.id}/perfis`,
    { aluno: false, professor: false, admin: false },
    { token }
  );

  assert.equal(resposta.status, 400, JSON.stringify(resposta.corpo));
});

test("desativar o último admin ativo é recusado", async (t) => {
  const { api, token } = await cenarioAdmin();
  t.after(() => api.encerrar());

  const resposta = await api.put(
    "/professores/alunos/desativar",
    { cpf: "99999999999" },
    { token }
  );

  assert.ok(resposta.status >= 400, `esperava recusa, veio ${resposta.status}`);

  const aindaEntra = await api.post("/login", { cpf: "99999999999", senha: "senha123" });
  assert.equal(aindaEntra.status, 200, "o último admin foi desativado");
});

test("professor não muda perfis de ninguém", async (t) => {
  const { api, tokenProfessor, aluno } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.put(
    `/admin/usuarios/${aluno.id}/perfis`,
    { aluno: true, professor: true, admin: true },
    { token: tokenProfessor }
  );

  assert.equal(resposta.status, 403);
});
```

- [ ] **Passo 3: rodar e ver falhar**

Run: `node --test test/admin.test.js test/seguranca.test.js`
Esperado: os testes novos falhando — a rota de perfis não existe.

- [ ] **Passo 4: implementar `alterarPerfis`**

Em `backend/src/controllers/adminController.js`:

```js
/**
 * Promove e rebaixa perfis.
 *
 * Quatro travas, e cada uma existe por um caminho concreto de deixar o sistema
 * inutilizável:
 *
 * 1. O admin não retira o próprio `admin` — um clique distraído deixaria o
 *    sistema sem quem o administre.
 * 2. O último admin ativo não perde o `admin`, mesmo sendo outra pessoa: é a
 *    regra 1 pela porta dos fundos.
 * 3. Ninguém fica sem perfil nenhum. Sem `aluno`, `professor` nem `admin` a
 *    pessoa entra e não alcança tela alguma — o RotaProtegida a manda para uma
 *    área que ela não pode ver, e ela fica presa num redirecionamento.
 * 4. Só estes três campos são lidos. É a mesma regra do cadastro de aluno,
 *    onde mandar `professor: true` no corpo é ignorado.
 */
export const alterarPerfis = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const perfis = {
    aluno: req.body?.aluno === true,
    professor: req.body?.professor === true,
    admin: req.body?.admin === true,
  };

  if (!perfis.aluno && !perfis.professor && !perfis.admin) {
    throw erroRequisicao("O usuário precisa ter ao menos um perfil");
  }
  if (id === req.usuario.id && !perfis.admin) {
    throw erroProibido("Você não pode retirar o seu próprio perfil de admin");
  }

  const cliente = await db.connect();
  try {
    await cliente.query("BEGIN");

    const { rows: alvos } = await cliente.query("SELECT admin FROM usuario WHERE id = $1", [id]);
    if (alvos.length === 0) {
      throw erroNaoEncontrado("Usuário não encontrado");
    }

    // Só interessa quando o alvo está deixando de ser admin.
    if (alvos[0].admin && !perfis.admin) {
      const { rows } = await cliente.query(
        "SELECT COUNT(*)::int AS total FROM usuario WHERE admin = TRUE AND ativo = TRUE"
      );
      if (rows[0].total <= 1) {
        throw erroConflito("Este é o único admin ativo do sistema");
      }
    }

    const { rows } = await cliente.query(
      `UPDATE usuario SET aluno = $1, professor = $2, admin = $3, atualizado_por = $4
        WHERE id = $5
        RETURNING ${CAMPOS_PUBLICOS}`,
      [perfis.aluno, perfis.professor, perfis.admin, req.usuario.id, id]
    );

    await cliente.query("COMMIT");
    res.json({ message: "Perfis alterados com sucesso", usuario: rows[0] });
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }
});
```

- [ ] **Passo 5: a trava no `desativarUsuario`**

Em `backend/src/controllers/professorController.js`, dentro da transação de `desativarUsuario`,
**antes** do `UPDATE` que desativa:

```js
    // Desativar o último admin tem o mesmo efeito de rebaixá-lo: o sistema
    // fica sem quem o administre. A conferência é dentro da transação para
    // duas desativações simultâneas não passarem juntas.
    const { rows: alvos } = await cliente.query(
      "SELECT admin FROM usuario WHERE cpf = $1 AND ativo = TRUE",
      [cpf]
    );
    if (alvos[0]?.admin) {
      const { rows: contagem } = await cliente.query(
        "SELECT COUNT(*)::int AS total FROM usuario WHERE admin = TRUE AND ativo = TRUE"
      );
      if (contagem[0].total <= 1) {
        await cliente.query("ROLLBACK");
        throw erroConflito("Este é o único admin ativo do sistema");
      }
    }
```

- [ ] **Passo 6: a rota**

Em `backend/src/routes/adminRoutes.js`:

```js
rotas.put("/usuarios/:id/perfis", admin.alterarPerfis);
```

- [ ] **Passo 7: rodar**

Run: `node --test`
Esperado: a suíte inteira verde.

- [ ] **Passo 8: provar as quatro travas**

Uma quebra por vez em `adminController.js` (e a última em `professorController.js`), rodando e
desfazendo:

| Quebra | Teste que deve ficar vermelho |
|---|---|
| Remover o `if (id === req.usuario.id && !perfis.admin)` | "admin não retira o próprio perfil de admin" |
| Trocar `if (rows[0].total <= 1)` por `if (false)` | "não é possível rebaixar o último admin ativo" |
| Remover o `if (!perfis.aluno && !perfis.professor && !perfis.admin)` | "usuário não pode ficar sem nenhum perfil" |
| Remover o bloco novo de `desativarUsuario` | "desativar o último admin ativo é recusado" |

- [ ] **Passo 9: commit**

```bash
cd ..
git add backend/src backend/test
git commit -F - <<'EOF'
Permite promover e rebaixar perfis, com quatro travas

Cada trava fecha um caminho concreto de deixar o sistema inutilizavel:
retirar o proprio admin, rebaixar o ultimo admin que restou, desativar
esse ultimo admin, e deixar alguem sem perfil nenhum — que entra e nao
alcanca tela alguma, preso num redirecionamento sem destino.

A contagem de admins ativos roda dentro da transacao: fora dela, duas
requisicoes simultaneas leriam "2" e passariam as duas.
EOF
```

---

## Tarefa 3: front — editar dados e perfis

**Arquivos:**
- Criar: `frontend/src/pages/admin/EditarUsuario.tsx`
- Modificar: `frontend/src/pages/admin/Usuarios.tsx`
- Modificar: `frontend/src/pages/paginas.test.tsx`

- [ ] **Passo 1: o modal**

Criar `frontend/src/pages/admin/EditarUsuario.tsx`, no mesmo molde de
`RedefinirSenha.tsx` (portal, Escape fecha, foco no primeiro campo, erro dentro do modal sem perder
o digitado). Conteúdo:

- `Campo` para nome, CPF (com `mascararCpf`), e-mail e título
- Três `checkbox` para os perfis: aluno, professor, admin
- **O checkbox de admin fica desabilitado quando o usuário é o próprio admin logado**, com a
  explicação ao lado: "Você não pode retirar o seu próprio perfil de admin." A trava existe no
  servidor; aqui é só para não oferecer um botão que sempre falha.
- Salvar dispara **duas** requisições, e nesta ordem: `PUT /admin/usuarios/:id` para os dados e
  `PUT /admin/usuarios/:id/perfis` para os perfis, mas **só as que mudaram**. Se nada mudou, o
  botão fica desabilitado.
- Erro de qualquer uma das duas aparece no modal, com o que já foi salvo informado — se os dados
  salvaram e os perfis falharam, a mensagem precisa dizer isso, senão o admin tenta de novo e não
  entende por que o nome já está certo.

- [ ] **Passo 2: o botão na listagem**

Em `frontend/src/pages/admin/Usuarios.tsx`, ao lado do botão "Senha", um "Editar" que abre o modal.
Ao salvar, `usuarios.recarregar()` e uma mensagem de sucesso.

O botão de editar **aparece também para a própria conta** — o admin pode corrigir o próprio nome. É
só o perfil de admin que ele não pode tirar de si.

- [ ] **Passo 3: rodar**

```bash
cd frontend && npm test && npm run lint && npm run build
```

Esperado: os três passando, saída limpa. O smoke de `Usuarios` já existe e continua valendo.

- [ ] **Passo 4: conferir no navegador**

Subir `npm run demo` e `npm run dev`. Entrando como `111.111.111-11` / `demo123`:

1. Editar o nome da Ana e ver a lista atualizar
2. Promover a Ana a professora e conferir que ela ganha o selo
3. Abrir o editar da **própria** conta e confirmar que o checkbox de admin está desabilitado
4. Rebaixar a Ana de volta

Derrubar os processos ao fim.

- [ ] **Passo 5: commit**

```bash
cd ..
git add frontend/src
git commit -F - <<'EOF'
Adiciona edicao de dados e perfis na tela de usuarios

O checkbox de admin fica desabilitado na propria conta: a trava esta no
servidor, e aqui e so para nao oferecer um botao que sempre falha.

Salvar dispara duas requisicoes, dados e perfis, e so as que mudaram. Se
uma passar e a outra falhar, a mensagem diz o que ja foi salvo — senao o
admin tenta de novo e nao entende por que o nome ja esta certo.
EOF
```

---

## Tarefa 4: documentação

- [ ] **Passo 1: `backend/README.md`**

Acrescentar à tabela de rotas:

| `PUT` | `/admin/usuarios/:id` | Altera os dados de qualquer usuário |
| `PUT` | `/admin/usuarios/:id/perfis` | Promove e rebaixa perfis |

E, na seção "Senhas e perfis", as quatro travas com o motivo de cada uma.

- [ ] **Passo 2: `ROADMAP.md`**

Marcar como feitos "Editar dados de qualquer usuário" e "Promover e rebaixar perfis". Atualizar a
contagem de testes. Se a seção 2 ficar inteira feita menos "Excluir de verdade", registrar isso.

- [ ] **Passo 3: `CLAUDE.md`** (local, não commitar)

Registrar as quatro travas e o fato de a contagem de admins rodar dentro da transação.

- [ ] **Passo 4: verificação final**

```bash
cd backend && npm test
cd ../frontend && npm test && npm run lint && npm run build
```

- [ ] **Passo 5: commit**

```bash
cd ..
git add backend/README.md ROADMAP.md
git commit -F - <<'EOF'
Documenta a gestao de usuarios do painel de admin

Registra as quatro travas e o caminho concreto que cada uma fecha.
EOF
```

---

## Autorrevisão do plano

**Cobertura da spec (leva 2):**

| Requisito | Tarefa |
|---|---|
| `PUT /admin/usuarios/:id` — editar qualquer usuário | 1 |
| `PUT /admin/usuarios/:id/perfis` | 2 |
| Trava: não retirar o próprio admin | 2 |
| Trava: não rebaixar o último admin ativo | 2 |
| Trava: lista fechada de perfis | 1 (dados) e 2 (perfis) |
| Trava: desativar não deixa o sistema sem admin | 2 (passo 5) |
| Front: edição e troca de perfil | 3 |
| Documentação | 4 |

**Acréscimo à spec:** a quarta trava — ninguém fica sem perfil nenhum — não estava na spec. Entrou
porque a rota de perfis a torna alcançável pela primeira vez: com três checkboxes, desmarcar os três
é um clique. O efeito é uma conta que entra e não vê tela alguma.

**Consistência de nomes:** `cenarioComAluno` e `criarAdminELogar` já existem, da leva 1;
`CAMPOS_PUBLICOS` do `adminController` já inclui `admin`. `alterarUsuario` e `alterarPerfis` são
definidos na 1 e 2, e consumidos pelo front na 3.

**Ponto frágil, assumido:** a Tarefa 3 descreve `EditarUsuario.tsx` em vez de trazer o código —
`RedefinirSenha.tsx`, escrito na leva 1, é o molde direto, e repetir a estrutura inteira aqui só
duplicaria o que aquele arquivo já mostra.
