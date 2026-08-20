# Painel de admin, leva 1 — plano de implementação

> **Para quem executa:** use `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans` para tocar tarefa a tarefa. Os passos usam `- [ ]` para
> acompanhamento.

**Objetivo:** criar o perfil de admin e fechar o buraco da senha — qualquer um troca a própria,
o admin redefine a de quem esqueceu, e trocar a senha derruba as sessões abertas.

**Arquitetura:** flag `admin` no `usuario`, ao lado de `aluno` e `professor`. `exigirPerfil()` já
aceita o novo perfil sem alteração. A invalidação de sessão sai da comparação entre o `iat` do JWT
e uma coluna `senha_alterada_em`.

**Spec:** `docs/superpowers/specs/2026-08-20-painel-admin-design.md`

## Restrições globais

- **pt-BR** em nomes, mensagens e comentários.
- **Senha nunca aparece em resposta, log ou mensagem de erro.** Nem a antiga, nem a nova.
- **`CAMPOS_PUBLICOS` nunca inclui `senha`** — é a constante que o `professorController` usa nos
  `RETURNING`.
- **Erro de senha atual errada é 401**, com a mesma mensagem de "não autenticado" — não confirmar
  que a senha atual estava certa mas outra coisa falhou.
- Nada de `console.error` em teste que passa.
- **Não editar arquivo-fonte com `sed -i`** e não mandar texto acentuado por `curl` no Git Bash:
  no Windows deste projeto, o primeiro quebra o watcher do Vite e o segundo corrompe UTF-8. Use
  script Node.
- **`db/schema.sql` é a fonte da verdade** e os testes rodam esse mesmo arquivo no `pg-mem`.
  Divergência entre schema e código aparece como teste vermelho.
- Commits em português, no imperativo, **sem `Co-Authored-By`**, direto na `main`, **sem push**.
- **Método de prova:** onde o teste for escrito contra código que já existe, provar quebrando a
  linha protegida e confirmando o vermelho. Onde for código novo, TDD normal: teste primeiro,
  vermelho, implementação, verde.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `backend/db/schema.sql` | colunas `admin` e `senha_alterada_em` |
| `backend/db/migracao-v6-admin.sql` | as mesmas colunas, para banco existente |
| `backend/src/middlewares/auth.js` | carrega `admin`; recusa token anterior à troca de senha |
| `backend/src/controllers/authController.js` | `perfilDe`/`perfisDe` com admin; `trocarMinhaSenha` |
| `backend/src/controllers/adminController.js` | **novo** — listar usuários, redefinir senha |
| `backend/src/routes/adminRoutes.js` | **novo** — rotas sob `/admin` |
| `backend/src/routes/index.js` | monta `/admin` e `PUT /me/senha` |
| `backend/src/lib/validacao.js` | `validarTrocaDeSenha` |
| `backend/scripts/criarAdmin.js` | **novo** — primeiro admin, com os três perfis |
| `backend/scripts/demo.js` | admin de exemplo |
| `backend/test/senha.test.js` | **novo** — troca, redefinição, invalidação |
| `backend/test/admin.test.js` | **novo** — perfil, listagem, travas |
| `frontend/src/types.ts` | `Cargo` com admin; `perfis.admin` |
| `frontend/src/components/TrocarArea.tsx` | seletor de áreas em vez de alternador |
| `frontend/src/components/TrocarSenha.tsx` | **novo** — modal de trocar a própria senha |
| `frontend/src/pages/admin/AdminLayout.tsx` | **novo** |
| `frontend/src/pages/admin/Usuarios.tsx` | **novo** — listagem, filtro, redefinir senha |
| `frontend/src/pages/aluno/Perfil.tsx` | botão "Trocar minha senha" |
| `frontend/src/App.tsx` | rotas de `/admin` |

---

## Tarefa 1: a flag `admin` atravessa a autenticação

Sem UI ainda. Ao fim, um usuário com `admin = TRUE` passa por `exigirPerfil('admin')` e o `/me`
devolve o perfil.

**Arquivos:**
- Modificar: `backend/db/schema.sql`
- Criar: `backend/db/migracao-v6-admin.sql`
- Modificar: `backend/src/middlewares/auth.js`
- Modificar: `backend/src/controllers/authController.js`
- Criar: `backend/test/admin.test.js`
- Modificar: `backend/test/helpers.js`

**Interfaces produzidas:**

```js
// test/helpers.js — usado pelas tarefas seguintes
export async function criarAdminELogar(api, { cpf = "99999999999", senha = "senha123" } = {}): Promise<string>
```

- [ ] **Passo 1: escrever o teste**

Criar `backend/test/admin.test.js`:

```js
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
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `cd backend && node --test test/admin.test.js`
Esperado: FALHA — `criarAdminELogar` não existe.

- [ ] **Passo 3: acrescentar a coluna ao schema**

Em `backend/db/schema.sql`, na tabela `usuario`, ao lado de `aluno` e `professor`:

```sql
    admin           BOOLEAN      NOT NULL DEFAULT FALSE,
```

- [ ] **Passo 4: criar `backend/db/migracao-v6-admin.sql`**

```sql
-- Migração para um banco que já existe: perfil de admin e troca de senha.
--
-- Só é necessária se você já tem dados. Em banco novo, use schema.sql direto.
-- Faça backup antes:
--   pg_dump -U <usuario> <banco> > backup.sql
--
--   psql -U <usuario> -d <banco> -f db/migracao-v6-admin.sql

BEGIN;

ALTER TABLE usuario ADD COLUMN IF NOT EXISTS admin BOOLEAN NOT NULL DEFAULT FALSE;

-- NULL quer dizer "nunca trocou a senha". Precisa nascer NULL: um DEFAULT NOW()
-- aqui invalidaria, de uma vez, o token de todo mundo que está logado.
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS senha_alterada_em TIMESTAMPTZ;

COMMIT;
```

- [ ] **Passo 5: acrescentar o helper de teste**

Em `backend/test/helpers.js`, ao lado de `criarProfessorELogar`:

```js
/** Insere um admin com os três perfis e devolve o token dele. */
export async function criarAdminELogar(api, { cpf = "99999999999", senha = "senha123" } = {}) {
  const { criarHashComSal } = await import("../src/lib/senha.js");
  const hash = await criarHashComSal(senha);

  api.memoria.public.none(`
    INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
    VALUES ('${cpf}', 'Admin Teste', '${hash}', 'admin@teste.com', '999999999999', TRUE, TRUE, TRUE, TRUE)
  `);

  const resposta = await api.post("/login", { cpf, senha });
  return resposta.corpo.token;
}
```

- [ ] **Passo 6: carregar a coluna no `autenticar`**

Em `backend/src/middlewares/auth.js`, na consulta, trocar

```js
    "SELECT id, nome, cpf, email, titulo, aluno, professor, ativo FROM usuario WHERE id = $1 AND ativo = TRUE",
```

por

```js
    `SELECT id, nome, cpf, email, titulo, aluno, professor, admin, ativo, senha_alterada_em
       FROM usuario WHERE id = $1 AND ativo = TRUE`,
```

`senha_alterada_em` entra agora porque a Tarefa 2 depende dela; deixá-la de fora obrigaria a mexer
na mesma consulta duas vezes.

- [ ] **Passo 7: incluir admin no cargo e nos perfis**

Em `backend/src/controllers/authController.js`, trocar as duas funções por:

```js
/**
 * Perfil principal — o que decide para onde o app abre.
 *
 * `aluno`, `professor` e `admin` são flags independentes: a mesma pessoa pode
 * ser as três (quem administra o sistema, dá aula e treina na academia). Por
 * isso o cargo sozinho não basta, e a resposta leva junto `perfis`.
 */
function perfilDe(usuario) {
  if (usuario.admin) return "admin";
  return usuario.professor ? "professor" : "aluno";
}

function perfisDe(usuario) {
  return {
    aluno: Boolean(usuario.aluno),
    professor: Boolean(usuario.professor),
    admin: Boolean(usuario.admin),
  };
}
```

- [ ] **Passo 8: rodar**

Run: `node --test test/admin.test.js`
Esperado: os três passando.

Run: `node --test`
Esperado: a suíte inteira verde. Se algum teste antigo quebrar por causa de `perfis`, é sinal de que
ele afirmava a forma do objeto — atualizar a asserção é correto aqui, porque a forma mudou de
propósito.

- [ ] **Passo 9: commit**

```bash
cd ..
git add backend/db/schema.sql backend/db/migracao-v6-admin.sql backend/src/middlewares/auth.js backend/src/controllers/authController.js backend/test/admin.test.js backend/test/helpers.js
git commit -F - <<'EOF'
Cria o perfil de admin como flag no usuario

Flag ao lado de aluno e professor, e nao a tabela admin_user que esta no
schema sem uso: usa-la significaria um segundo caminho de autenticacao,
com login, token e middleware lidando com duas origens de identidade —
superficie de ataque a mais por pouco ganho.

exigirPerfil() ja e parametrizado e aceita 'admin' sem alteracao. O
cargo principal passa a ser admin > professor > aluno.

senha_alterada_em entra na mesma consulta do autenticar, ja pensando na
invalidacao de token da proxima etapa. Nasce NULL de proposito: um
DEFAULT NOW() invalidaria o token de todo mundo na migracao.
EOF
```

---

## Tarefa 2: trocar a própria senha, e a sessão antiga cair

**Arquivos:**
- Modificar: `backend/src/lib/validacao.js`
- Modificar: `backend/src/controllers/authController.js`
- Modificar: `backend/src/middlewares/auth.js`
- Modificar: `backend/src/routes/index.js`
- Criar: `backend/test/senha.test.js`

**Interfaces produzidas:**

```js
// src/lib/validacao.js
export function validarTrocaDeSenha(corpo): { senhaAtual: string, senhaNova: string }
// src/controllers/authController.js
export const trocarMinhaSenha  // PUT /me/senha
```

- [ ] **Passo 1: escrever o teste**

Criar `backend/test/senha.test.js`:

```js
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

  const resposta = await api.put(
    "/me/senha",
    { senha_atual: SENHA, senha_nova: "123" },
    { token }
  );

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
  assert.ok(!texto.includes(":"), `parece hash de senha no corpo: ${texto}`);
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
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `node --test test/senha.test.js`
Esperado: FALHA — a rota `PUT /me/senha` não existe (404).

- [ ] **Passo 3: validação**

Em `backend/src/lib/validacao.js`, acrescentar ao fim:

```js
/**
 * Valida a troca de senha.
 *
 * O mínimo de 6 é o mesmo do cadastro — deixar a troca mais frouxa que o
 * cadastro permitiria enfraquecer a senha depois de criada.
 */
export function validarTrocaDeSenha(corpo) {
  const senhaAtual = typeof corpo?.senha_atual === "string" ? corpo.senha_atual : "";
  const senhaNova = typeof corpo?.senha_nova === "string" ? corpo.senha_nova : "";

  if (senhaNova.length < 6) {
    throw erroRequisicao("A senha nova deve ter ao menos 6 caracteres");
  }
  if (senhaNova === senhaAtual) {
    throw erroRequisicao("A senha nova precisa ser diferente da atual");
  }

  return { senhaAtual, senhaNova };
}
```

- [ ] **Passo 4: o controller**

Em `backend/src/controllers/authController.js`, acrescentar ao fim (e completar os imports com
`criarHashComSal` de `../lib/senha.js`, `validarTrocaDeSenha` de `../lib/validacao.js` e
`erroProibido` de `../lib/erros.js`):

```js
/**
 * Troca a senha do próprio usuário.
 *
 * Exige a senha atual: sem isso, quem pega o aparelho destravado troca a senha
 * e toma a conta sem nunca ter sabido a original.
 *
 * Devolve um token novo porque gravar `senha_alterada_em` invalida todos os
 * emitidos antes — inclusive o de quem está trocando.
 */
export const trocarMinhaSenha = asyncHandler(async (req, res) => {
  const { senhaAtual, senhaNova } = validarTrocaDeSenha(req.body);

  const { rows } = await db.query("SELECT senha FROM usuario WHERE id = $1", [req.usuario.id]);
  if (rows.length === 0 || !(await verificarSenha(rows[0].senha, senhaAtual))) {
    // Mesma resposta de "não autenticado": não confirma que a senha atual
    // estava certa e outra coisa falhou.
    throw erroNaoAutorizado("CPF ou senha incorretos");
  }

  const hash = await criarHashComSal(senhaNova);
  await db.query("UPDATE usuario SET senha = $1, senha_alterada_em = NOW() WHERE id = $2", [
    hash,
    req.usuario.id,
  ]);

  const token = await gerarToken({ id: req.usuario.id, cargo: perfilDe(req.usuario) });
  res.json({ message: "Senha alterada com sucesso", token });
});
```

- [ ] **Passo 5: a comparação no `autenticar`**

Em `backend/src/middlewares/auth.js`, depois de `req.usuario = rows[0]` virar acessível (isto é,
logo antes dela), inserir:

```js
  const usuario = rows[0];

  // Token emitido antes da última troca de senha não vale mais. O JWT é
  // stateless e dura sete dias: sem isto, trocar a senha não expulsaria quem
  // roubou o token, que é justamente o motivo de trocá-la.
  //
  // `iat` tem resolução de segundos, então a comparação é estritamente menor:
  // o token emitido no mesmo segundo da troca — o que a própria rota devolve —
  // continua valendo. Coluna nula quer dizer "nunca trocou": não invalida nada.
  if (usuario.senha_alterada_em) {
    const trocadaEm = Math.floor(new Date(usuario.senha_alterada_em).getTime() / 1000);
    if (typeof payload.iat === "number" && payload.iat < trocadaEm) {
      throw erroNaoAutorizado("Sessão expirada. Entre de novo.");
    }
  }

  req.usuario = usuario;
```

- [ ] **Passo 6: a rota**

Em `backend/src/routes/index.js`, ao lado de `rotas.get("/me", ...)`:

```js
rotas.put("/me/senha", autenticar, trocarMinhaSenha);
```

E completar o import de `../controllers/authController.js` com `trocarMinhaSenha`.

- [ ] **Passo 7: rodar**

Run: `node --test test/senha.test.js` — esperado: os sete passando.
Run: `node --test` — esperado: a suíte inteira verde.

- [ ] **Passo 8: provar a invalidação por outro caminho**

Comentar o bloco `if (usuario.senha_alterada_em) { … }` do `autenticar`.

Run: `node --test test/senha.test.js`
Esperado: **"o token anterior à troca deixa de valer" fica vermelho**, e só ele.

Descomentar e confirmar o verde.

- [ ] **Passo 9: commit**

```bash
cd ..
git add backend/src backend/test/senha.test.js
git commit -F - <<'EOF'
Permite trocar a propria senha, derrubando as sessoes antigas

Ate agora nao havia troca de senha nenhuma: senha esquecida ou vazada so
se resolvia recriando o usuario ou mexendo no banco.

A troca exige a senha atual, senao quem pega o aparelho destravado toma
a conta sem nunca ter sabido a original. Senha atual errada responde o
mesmo 401 de nao autenticado, para nao confirmar que ela estava certa e
outra coisa falhou.

E derruba as sessoes abertas, comparando o iat do token com
senha_alterada_em. Sem isso o JWT de sete dias sobreviveria a troca —
exatamente o cenario em que a senha e trocada. A comparacao e
estritamente menor porque iat tem resolucao de segundos, e a rota
devolve um token novo para quem trocou nao se desconectar.
EOF
```

---

## Tarefa 3: rotas de admin — listar usuários e redefinir senha

**Arquivos:**
- Criar: `backend/src/controllers/adminController.js`
- Criar: `backend/src/routes/adminRoutes.js`
- Modificar: `backend/src/routes/index.js`
- Modificar: `backend/test/admin.test.js`
- Modificar: `backend/test/seguranca.test.js`

**Interfaces consumidas:** `criarAdminELogar` da Tarefa 1.

**Interfaces produzidas:**

```js
// src/controllers/adminController.js
export const listarUsuarios     // GET  /admin/usuarios?perfil=&status=&busca=
export const redefinirSenha     // PUT  /admin/usuarios/:id/senha
```

- [ ] **Passo 1: escrever os testes de admin**

Acrescentar a `backend/test/admin.test.js`:

```js
test("admin lista todos os usuários, de qualquer perfil", async (t) => {
  const api = await criarApiDeTeste();
  t.after(() => api.encerrar());
  const token = await criarAdminELogar(api);

  await api.post(
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

  const resposta = await api.get("/admin/usuarios", { token });

  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
  assert.equal(resposta.corpo.length, 2);
  assert.ok(resposta.corpo.every((u) => u.senha === undefined), "a listagem vazou senha");
});

test("filtra a listagem por perfil", async (t) => {
  const api = await criarApiDeTeste();
  t.after(() => api.encerrar());
  const token = await criarAdminELogar(api);

  await api.post(
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

  const admins = await api.get("/admin/usuarios?perfil=admin", { token });
  assert.equal(admins.corpo.length, 1);
  assert.equal(admins.corpo[0].admin, true);

  const alunos = await api.get("/admin/usuarios?perfil=aluno", { token });
  // O admin do cenário também é aluno: são dois.
  assert.equal(alunos.corpo.length, 2);
});

test("filtra a listagem por status", async (t) => {
  const api = await criarApiDeTeste();
  t.after(() => api.encerrar());
  const token = await criarAdminELogar(api);

  await api.post(
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
  await api.put("/professores/alunos/desativar", { cpf: "22222222222" }, { token });

  const ativos = await api.get("/admin/usuarios?status=ativos", { token });
  assert.equal(ativos.corpo.length, 1);

  const inativos = await api.get("/admin/usuarios?status=inativos", { token });
  assert.equal(inativos.corpo.length, 1);
  assert.equal(inativos.corpo[0].cpf, "22222222222");
});

test("admin redefine a senha de outro usuário", async (t) => {
  const api = await criarApiDeTeste();
  t.after(() => api.encerrar());
  const token = await criarAdminELogar(api);

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
    `/admin/usuarios/${criado.corpo.aluno.id}/senha`,
    { senha_nova: "senhaTemporaria1" },
    { token }
  );
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

  const comNova = await api.post("/login", { cpf: "22222222222", senha: "senhaTemporaria1" });
  assert.equal(comNova.status, 200);
});

// Se o motivo da redefinição foi conta comprometida, deixar a sessão do
// invasor de pé anularia o propósito.
test("redefinir a senha derruba as sessões daquele usuário", async (t) => {
  const api = await criarApiDeTeste();
  t.after(() => api.encerrar());
  const tokenAdmin = await criarAdminELogar(api);

  const criado = await api.post(
    "/professores/alunos",
    {
      cpf: "22222222222",
      nome: "Aluno Teste",
      senha: "senha123",
      email: "aluno@teste.com",
      titulo: "222222222222",
    },
    { token: tokenAdmin }
  );
  const login = await api.post("/login", { cpf: "22222222222", senha: "senha123" });
  const tokenAluno = login.corpo.token;

  assert.equal((await api.get("/me", { token: tokenAluno })).status, 200);

  api.memoria.public.none(
    `UPDATE usuario SET senha_alterada_em = NOW() + INTERVAL '10 seconds' WHERE id = ${criado.corpo.aluno.id}`
  );

  assert.equal((await api.get("/me", { token: tokenAluno })).status, 401);
});

// A rota de admin não pede a senha atual. Se o admin pudesse usá-la em si
// mesmo, a exigência da senha atual em /me/senha viraria decorativa
// justamente para a conta que mais importa.
test("admin não redefine a própria senha pela rota de admin", async (t) => {
  const api = await criarApiDeTeste();
  t.after(() => api.encerrar());
  const token = await criarAdminELogar(api);

  const eu = await api.get("/me", { token });

  const resposta = await api.put(
    `/admin/usuarios/${eu.corpo.id}/senha`,
    { senha_nova: "senhaTemporaria1" },
    { token }
  );

  assert.equal(resposta.status, 403, JSON.stringify(resposta.corpo));
});

test("redefinir senha de usuário inexistente devolve 404", async (t) => {
  const api = await criarApiDeTeste();
  t.after(() => api.encerrar());
  const token = await criarAdminELogar(api);

  const resposta = await api.put(
    "/admin/usuarios/9999/senha",
    { senha_nova: "senhaTemporaria1" },
    { token }
  );

  assert.equal(resposta.status, 404);
});
```

- [ ] **Passo 2: escrever os testes de segurança**

Acrescentar ao fim de `backend/test/seguranca.test.js`:

```js
/* ------------------------------------------------------ area de admin */

test("professor sem a flag admin não alcança as rotas de admin", async (t) => {
  const { api, tokenProfessor } = await cenario();
  t.after(() => api.encerrar());

  const tentativas = [
    api.get("/admin/usuarios", { token: tokenProfessor }),
    api.put("/admin/usuarios/1/senha", { senha_nova: "outraSenha1" }, { token: tokenProfessor }),
  ];

  for (const resposta of await Promise.all(tentativas)) {
    assert.equal(resposta.status, 403);
  }
});

test("aluno não alcança as rotas de admin", async (t) => {
  const { api, aluno } = await cenario();
  t.after(() => api.encerrar());

  const resposta = await api.get("/admin/usuarios", { token: aluno.token });
  assert.equal(resposta.status, 403);
});

// A claim do token não é autorização: o perfil vem do banco.
test("token que se diz admin não vira admin", async (t) => {
  const { api, aluno } = await cenario();
  t.after(() => api.encerrar());

  const mentiroso = await new SignJWT({ id: aluno.id, cargo: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(SEGREDO);

  const resposta = await api.get("/admin/usuarios", { token: mentiroso });
  assert.equal(resposta.status, 403);
});

test("a listagem de admin nunca devolve a coluna senha", async (t) => {
  const { api } = await cenario();
  t.after(() => api.encerrar());
  const { criarAdminELogar } = await import("./helpers.js");
  const token = await criarAdminELogar(api, { cpf: "99999999999" });

  const resposta = await api.get("/admin/usuarios", { token });
  const texto = JSON.stringify(resposta.corpo);

  assert.ok(!texto.includes('"senha"'), `a listagem trouxe o campo senha: ${texto.slice(0, 200)}`);
  assert.ok(!/[0-9a-f]{64}/.test(texto), `parece hash de senha na resposta: ${texto.slice(0, 200)}`);
});
```

- [ ] **Passo 3: rodar e ver falhar**

Run: `node --test test/admin.test.js test/seguranca.test.js`
Esperado: os testes novos falhando com 404 — as rotas `/admin` não existem.

- [ ] **Passo 4: o controller**

Criar `backend/src/controllers/adminController.js`:

```js
import { db } from "../config/db.js";
import { criarHashComSal } from "../lib/senha.js";
import { asyncHandler, erroNaoEncontrado, erroProibido, erroRequisicao } from "../lib/erros.js";

// A senha jamais entra aqui. É a mesma lista do professorController, com admin.
const CAMPOS_PUBLICOS = "id, nome, cpf, email, titulo, aluno, professor, admin, ativo";

const PERFIS = ["aluno", "professor", "admin"];

/**
 * Lista todos os usuários, com filtro por perfil e status.
 *
 * O professor só enxerga alunos; esta é a única visão do sistema inteiro.
 */
export const listarUsuarios = asyncHandler(async (req, res) => {
  const perfil = (req.query.perfil ?? "").toString().trim();
  const status = (req.query.status ?? "").toString().trim();
  const busca = (req.query.busca ?? "").toString().trim();

  const condicoes = [];
  const valores = [];

  // Lista fechada: o nome da coluna entra na SQL, então não pode vir do
  // cliente sem conferência — seria injeção pelo nome do campo.
  if (perfil) {
    if (!PERFIS.includes(perfil)) {
      throw erroRequisicao("Perfil inválido");
    }
    condicoes.push(`${perfil} = TRUE`);
  }

  if (status === "ativos") condicoes.push("ativo = TRUE");
  if (status === "inativos") condicoes.push("ativo = FALSE");

  if (busca) {
    valores.push(`%${busca}%`, `%${busca.replace(/\D/g, "") || busca}%`);
    condicoes.push(`(nome ILIKE $${valores.length - 1} OR cpf LIKE $${valores.length})`);
  }

  const onde = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
  const { rows } = await db.query(
    `SELECT ${CAMPOS_PUBLICOS} FROM usuario ${onde} ORDER BY nome`,
    valores
  );

  res.json(rows);
});

/**
 * Redefine a senha de outro usuário, sem pedir a senha atual — é o caso de
 * quem esqueceu.
 *
 * Não serve para o próprio admin: para si mesmo ele usa PUT /me/senha, com a
 * senha atual. Sem esta trava, a exigência da senha atual viraria decorativa
 * justamente para a conta que mais importa.
 *
 * Gravar senha_alterada_em derruba as sessões abertas daquele usuário. É
 * intencional: se a redefinição foi por conta comprometida, deixar a sessão do
 * invasor de pé anularia o propósito.
 */
export const redefinirSenha = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const senhaNova = typeof req.body?.senha_nova === "string" ? req.body.senha_nova : "";

  if (senhaNova.length < 6) {
    throw erroRequisicao("A senha nova deve ter ao menos 6 caracteres");
  }
  if (id === req.usuario.id) {
    throw erroProibido("Use a troca de senha comum para a sua própria conta");
  }

  const hash = await criarHashComSal(senhaNova);
  const { rows } = await db.query(
    `UPDATE usuario SET senha = $1, senha_alterada_em = NOW(), atualizado_por = $2
      WHERE id = $3
      RETURNING ${CAMPOS_PUBLICOS}`,
    [hash, req.usuario.id, id]
  );

  if (rows.length === 0) {
    throw erroNaoEncontrado("Usuário não encontrado");
  }

  res.json({ message: "Senha redefinida. A pessoa precisará entrar de novo.", usuario: rows[0] });
});
```

- [ ] **Passo 5: as rotas**

Criar `backend/src/routes/adminRoutes.js`:

```js
import { Router } from "express";
import * as admin from "../controllers/adminController.js";
import { erroRequisicao } from "../lib/erros.js";

const rotas = Router();

// Mesmo motivo do professorRoutes: sem isto, /usuarios/abc/senha chegaria ao
// Postgres e viraria 500 em vez de um 400 explicando o problema.
rotas.param("id", (_req, _res, next, valor) => {
  const id = Number(valor);
  next(Number.isInteger(id) && id > 0 ? undefined : erroRequisicao("Identificador inválido"));
});

rotas.get("/usuarios", admin.listarUsuarios);
rotas.put("/usuarios/:id/senha", admin.redefinirSenha);

export default rotas;
```

Em `backend/src/routes/index.js`, ao lado dos outros `rotas.use`:

```js
rotas.use("/admin", autenticar, exigirPerfil("admin"), adminRoutes);
```

E o import correspondente.

- [ ] **Passo 6: rodar**

Run: `node --test`
Esperado: a suíte inteira verde.

- [ ] **Passo 7: provar as duas travas**

| Quebra | Teste que deve ficar vermelho |
|---|---|
| Em `adminController.js`, remover o `if (id === req.usuario.id)` | "admin não redefine a própria senha pela rota de admin" |
| Em `routes/index.js`, tirar o `exigirPerfil("admin")` do `rotas.use("/admin", …)` | os três testes de acesso em `seguranca.test.js` |

Rodar após cada quebra, confirmar o vermelho, desfazer.

- [ ] **Passo 8: commit**

```bash
cd ..
git add backend/src backend/test/admin.test.js backend/test/seguranca.test.js
git commit -F - <<'EOF'
Adiciona as rotas de admin: listar usuarios e redefinir senha

A listagem e a unica visao do sistema inteiro — o professor so enxerga
alunos. Filtro por perfil e por status, com o perfil conferido contra
lista fechada: o nome dele entra na SQL, entao aceita-lo cru seria
injecao pelo nome do campo.

A redefinicao nao pede a senha atual, que e o caso de quem esqueceu, e
por isso mesmo nao serve para o proprio admin: para si ele usa
/me/senha. Sem essa trava, a exigencia da senha atual viraria decorativa
justamente para a conta que mais importa.

Redefinir tambem grava senha_alterada_em, derrubando as sessoes daquele
usuario. Se o motivo foi conta comprometida, deixar a sessao do invasor
de pe anularia o proposito.
EOF
```

---

## Tarefa 4: `criar-admin` e o admin do modo demo

**Arquivos:**
- Criar: `backend/scripts/criarAdmin.js`
- Modificar: `backend/package.json`
- Modificar: `backend/scripts/demo.js`

- [ ] **Passo 1: criar o script**

Criar `backend/scripts/criarAdmin.js`:

```js
/**
 * Cria o primeiro admin do sistema.
 *
 * Existe pelo mesmo motivo do criar-professor: a rota de criar admin exige um
 * token de admin, então em banco novo não haveria como criar o primeiro.
 *
 * Nasce com os três perfis. Não é atalho: quem administra este sistema também
 * dá aula e treina na própria academia, e precisa alcançar as três áreas. A
 * flag `aluno` é ainda o que faz a pessoa aparecer na lista de alunos do
 * professor, sem o que ninguém poderia montar um treino para ela.
 *
 *   npm run criar-admin -- --cpf 12345678901 --nome "Cristhian" \
 *     --senha "umaSenhaBoa" --email cristhian@exemplo.com [--titulo 123456789012]
 *     [--sem-aluno]
 */
import { parseArgs } from "node:util";
import { db } from "../src/config/db.js";
import { criarHashComSal } from "../src/lib/senha.js";
import { validarCadastroUsuario } from "../src/lib/validacao.js";

const { values } = parseArgs({
  options: {
    cpf: { type: "string" },
    nome: { type: "string" },
    senha: { type: "string" },
    email: { type: "string" },
    titulo: { type: "string" },
    "sem-aluno": { type: "boolean", default: false },
  },
});

try {
  const dados = validarCadastroUsuario(values);
  const comoAluno = !values["sem-aluno"];

  const { rows: existentes } = await db.query("SELECT id FROM usuario WHERE cpf = $1", [dados.cpf]);
  if (existentes.length > 0) {
    console.error(`Já existe um usuário com o CPF ${dados.cpf}.`);
    process.exit(1);
  }

  const hashSenha = await criarHashComSal(dados.senha);
  const { rows } = await db.query(
    `INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE, TRUE)
     RETURNING id, nome, cpf`,
    [dados.cpf, dados.nome, hashSenha, dados.email, dados.titulo, comoAluno]
  );

  const perfis = comoAluno ? "admin, professor e aluno" : "admin e professor";
  console.log(`Admin criado: ${rows[0].nome} (id ${rows[0].id}), com os perfis ${perfis}.`);
  process.exit(0);
} catch (erro) {
  console.error(erro.message ?? erro);
  process.exit(1);
}
```

- [ ] **Passo 2: o script no `package.json`**

Em `backend/package.json`, ao lado de `criar-professor`:

```json
    "criar-admin": "node scripts/criarAdmin.js",
```

- [ ] **Passo 3: admin no modo demo**

Em `backend/scripts/demo.js`, no `INSERT INTO usuario`, a primeira linha (o professor Cristhian
Cintra) passa a ser admin, professor e aluno. Trocar o INSERT inteiro por:

```js
await pool.query(
  `INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo) VALUES
     ('11111111111', 'Cristhian Cintra', $1, 'professor@demo.com', '111111111111', TRUE,  TRUE,  TRUE,  TRUE),
     ('22222222222', 'Ana Souza',        $1, 'ana@demo.com',       '222222222222', TRUE,  FALSE, FALSE, TRUE),
     ('33333333333', 'Bruno Lima',       $1, 'bruno@demo.com',     '333333333333', TRUE,  FALSE, FALSE, TRUE),
     ('44444444444', 'Carla Dias',       $1, 'carla@demo.com',     '444444444444', TRUE,  FALSE, FALSE, TRUE)`,
  [senha]
);
```

E, no `console.log` do fim, trocar a linha do professor por:

```js
  console.log(`\n  admin      CPF 111.111.111-11  senha demo123  (admin + professor + aluno)`);
```

- [ ] **Passo 4: conferir de verdade**

```bash
cd backend && npm run demo
```

Em outro terminal:

```bash
node -e "
const base='http://127.0.0.1:8080';
fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cpf:'11111111111',senha:'demo123'})})
  .then(r=>r.json()).then(({token,usuario})=>{
    console.log('cargo:', usuario.cargo, '| perfis:', JSON.stringify(usuario.perfis));
    return fetch(base+'/admin/usuarios',{headers:{Authorization:'Bearer '+token}});
  }).then(r=>r.json()).then(u=>console.log('usuarios:', u.length, '| tem senha?', 'senha' in u[0]));
"
```

Esperado: `cargo: admin`, `perfis: {"aluno":true,"professor":true,"admin":true}`, quatro usuários e
`tem senha? false`.

Derrubar o demo depois.

- [ ] **Passo 5: commit**

```bash
cd ..
git add backend/scripts backend/package.json
git commit -F - <<'EOF'
Cria o script do primeiro admin e poe um no modo demo

O admin nasce com os tres perfis. Nao e atalho: quem administra este
sistema tambem da aula e treina na propria academia, e precisa alcancar
as tres areas. A flag aluno e ainda o que faz a pessoa aparecer em
listarAlunos, sem o que ninguem poderia montar um treino para ela.

--sem-aluno cobre quem administra sem treinar.
EOF
```

---

## Tarefa 5: front — área de admin, seletor de áreas e troca de senha

**Arquivos:**
- Modificar: `frontend/src/types.ts`
- Modificar: `frontend/src/components/TrocarArea.tsx`
- Criar: `frontend/src/components/TrocarSenha.tsx`
- Criar: `frontend/src/pages/admin/AdminLayout.tsx`
- Criar: `frontend/src/pages/admin/Usuarios.tsx`
- Modificar: `frontend/src/pages/aluno/Perfil.tsx`
- Modificar: `frontend/src/App.tsx`
- Modificar: `frontend/src/pages/paginas.test.tsx`

- [ ] **Passo 1: tipos**

Em `frontend/src/types.ts`:

```ts
export type Cargo = 'professor' | 'aluno' | 'admin'
```

e, na interface `Usuario`, trocar a linha de `perfis` por:

```ts
  /** As três capacidades. Quem administra, dá aula e treina tem as três. */
  perfis: { aluno: boolean; professor: boolean; admin: boolean }
```

Acrescentar ao fim do arquivo:

```ts
/** Um usuário na visão do admin: o sistema inteiro, não só alunos. */
export interface UsuarioAdmin {
  id: number
  nome: string
  cpf: string
  email: string | null
  titulo: string | null
  aluno: boolean
  professor: boolean
  admin: boolean
  ativo: boolean
}
```

- [ ] **Passo 2: `TrocarArea` vira seletor**

Substituir o conteúdo de `frontend/src/components/TrocarArea.tsx` por:

```tsx
import { Link, useLocation } from 'react-router-dom'
import { Dumbbell, GraduationCap, ShieldCheck, type LucideIcon } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import type { Cargo } from '../types'

const AREAS: { cargo: Cargo; destino: string; rotulo: string; icone: LucideIcon }[] = [
  { cargo: 'admin', destino: '/admin', rotulo: 'Administração', icone: ShieldCheck },
  { cargo: 'professor', destino: '/professor', rotulo: 'Área do professor', icone: GraduationCap },
  { cargo: 'aluno', destino: '/aluno', rotulo: 'Meu treino', icone: Dumbbell },
]

/**
 * Leva para as outras áreas que a pessoa tem acesso.
 *
 * Era um alternador binário, de quando só existiam professor e aluno. Com três
 * áreas possíveis, "o outro lado" deixou de ser uma coisa só. Para quem tem um
 * perfil só, continua não existindo.
 */
export function TrocarArea({ compacto = false }: { compacto?: boolean }) {
  const { usuario } = useAuth()
  const { pathname } = useLocation()

  const destinos = AREAS.filter(
    (area) => usuario?.perfis[area.cargo] && !pathname.startsWith(area.destino),
  )

  if (!usuario || destinos.length === 0) {
    return null
  }

  if (compacto) {
    return (
      <div className="flex items-center gap-1">
        {destinos.map(({ destino, rotulo, icone: Icone }) => (
          <Link
            key={destino}
            to={destino}
            aria-label={rotulo}
            title={rotulo}
            className="rounded-xl p-2 text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
          >
            <Icone className="size-5" aria-hidden />
          </Link>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {destinos.map(({ destino, rotulo, icone: Icone }) => (
        <Link
          key={destino}
          to={destino}
          className="flex items-center gap-2 rounded-xl border border-borda px-3 py-2.5 text-sm text-texto-suave transition-colors hover:border-acento/40 hover:text-texto"
        >
          <Icone className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{rotulo}</span>
        </Link>
      ))}
    </div>
  )
}
```

- [ ] **Passo 3: modal de trocar a própria senha**

Criar `frontend/src/components/TrocarSenha.tsx`, no mesmo molde do `NovoExercicio.tsx` (portal,
Escape fecha, foco no primeiro campo, erro dentro do modal sem perder o digitado):

```tsx
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { api, mensagemDeErro, tokenArmazenado } from '../lib/api'
import { Botao } from './ui/Botao'
import { CampoSenha } from './ui/Campo'
import { Aviso } from './ui/Aviso'

/**
 * Troca a senha do próprio usuário.
 *
 * O servidor devolve um token novo porque a troca derruba todas as sessões
 * anteriores — inclusive esta. Sem gravar o token da resposta, quem acabou de
 * trocar a senha cairia no login na requisição seguinte.
 */
export function TrocarSenha({ aoFechar }: { aoFechar: () => void }) {
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const primeiroCampo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    primeiroCampo.current?.focus()

    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflowAnterior
    }
  }, [aoFechar])

  async function salvar() {
    setErro(null)

    // Conferir aqui evita gastar uma ida ao servidor para um erro de digitação
    // que o próprio formulário enxerga.
    if (nova !== repetida) {
      setErro('A repetição não confere com a senha nova.')
      return
    }

    setEnviando(true)
    try {
      const { data } = await api.put<{ token: string }>('/me/senha', {
        senha_atual: atual,
        senha_nova: nova,
      })
      tokenArmazenado.gravar(data.token)
      setSucesso(true)
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível trocar a senha.'))
    } finally {
      setEnviando(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <button
        type="button"
        aria-label="Fechar"
        onClick={aoFechar}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="trocar-senha-titulo"
        onSubmit={(e) => {
          e.preventDefault()
          void salvar()
        }}
        className="relative w-full max-w-sm space-y-4 rounded-2xl border border-borda bg-superficie p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="trocar-senha-titulo" className="font-semibold">
            Trocar minha senha
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={aoFechar}
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-texto-suave transition-colors hover:bg-borda/40 hover:text-texto"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {sucesso ? (
          <>
            <Aviso tipo="sucesso">Senha alterada. Os outros aparelhos vão pedir login de novo.</Aviso>
            <Botao type="button" onClick={aoFechar} className="w-full">
              Fechar
            </Botao>
          </>
        ) : (
          <>
            <CampoSenha
              ref={primeiroCampo}
              rotulo="Senha atual"
              value={atual}
              onChange={(e) => setAtual(e.target.value)}
              autoComplete="current-password"
            />
            <CampoSenha
              rotulo="Senha nova"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              autoComplete="new-password"
              dica="Ao menos 6 caracteres."
            />
            <CampoSenha
              rotulo="Repita a senha nova"
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
              autoComplete="new-password"
            />

            {erro && <Aviso tipo="erro">{erro}</Aviso>}

            <div className="flex gap-3">
              <Botao type="button" variante="secundario" onClick={aoFechar} className="flex-1">
                Cancelar
              </Botao>
              <Botao
                type="submit"
                className="flex-1"
                carregando={enviando}
                disabled={!atual || nova.length < 6 || !repetida}
              >
                Trocar
              </Botao>
            </div>
          </>
        )}
      </form>
    </div>,
    document.body,
  )
}
```

`CampoSenha` precisa de `forwardRef`, como `Campo` já ganhou. Aplicar a mesma mudança em
`frontend/src/components/ui/Campo.tsx`: trocar `export function CampoSenha({ … }: CampoSenhaProps) {`
por `export const CampoSenha = forwardRef<HTMLInputElement, CampoSenhaProps>(function CampoSenha({ … }, ref) {`,
passar `ref={ref}` ao `<input>` e fechar com `})` em vez de `}`.

- [ ] **Passo 4: botão no Perfil**

Em `frontend/src/pages/aluno/Perfil.tsx`, importar `useState` e `TrocarSenha`, e acrescentar antes
do botão de sair:

```tsx
      <Botao variante="secundario" onClick={() => setTrocandoSenha(true)} className="w-full">
        Trocar minha senha
      </Botao>

      {trocandoSenha && <TrocarSenha aoFechar={() => setTrocandoSenha(false)} />}
```

com `const [trocandoSenha, setTrocandoSenha] = useState(false)` no topo do componente.

- [ ] **Passo 5: a área de admin**

Criar `frontend/src/pages/admin/AdminLayout.tsx` copiando a estrutura de
`frontend/src/pages/professor/ProfessorLayout.tsx`, trocando os itens de navegação por um só:
`{ para: '/admin', rotulo: 'Usuários', icone: Users }`.

Criar `frontend/src/pages/admin/Usuarios.tsx`: listagem com `useRequisicao`, busca com
`useDebounce`, filtros de perfil e status, selos indicando os perfis de cada um, e um botão que abre
o modal de redefinir senha. Tratar os quatro estados (carregando, erro, vazio, lista), como toda
listagem do projeto.

O modal de redefinição avisa, antes de confirmar: **"A pessoa vai precisar entrar de novo em todos
os aparelhos."**

- [ ] **Passo 6: as rotas**

Em `frontend/src/App.tsx`, acrescentar antes da rota curinga:

```tsx
          <Route
            path="/admin"
            element={
              <RotaProtegida cargo="admin">
                <AdminLayout />
              </RotaProtegida>
            }
          >
            <Route index element={<Usuarios />} />
          </Route>
```

com os imports correspondentes.

- [ ] **Passo 7: atualizar os testes de front**

Em `frontend/src/test/utils.tsx`, as fixtures ganham `admin` em `perfis`, e entra uma nova:

```tsx
export const ADMIN: Usuario = {
  id: 3,
  nome: 'Cristhian Cintra',
  cpf: '99999999999',
  email: 'admin@teste.com',
  titulo: '999999999999',
  cargo: 'admin',
  perfis: { aluno: true, professor: true, admin: true },
  ativo: true,
}
```

Em `frontend/src/pages/paginas.test.tsx`, acrescentar `/admin/usuarios` às `RESPOSTAS` e a página
`Usuarios` à lista de smoke, com `usuario: ADMIN`.

Acrescentar um teste ao `RotaProtegida.test.tsx` para o perfil admin, no mesmo molde dos existentes.

- [ ] **Passo 8: rodar tudo**

```bash
cd frontend && npm test && npm run lint && npm run build
```

Esperado: os três passando, saída limpa.

- [ ] **Passo 9: conferir no navegador**

Subir `npm run demo` no backend e `npm run dev` no frontend. Entrar como `111.111.111-11` /
`demo123` e confirmar, com screenshot:

1. Abre direto em `/admin` (cargo principal é admin)
2. O seletor de áreas oferece **duas** opções: professor e aluno
3. A tela de Usuários lista os quatro, com os perfis certos
4. Redefinir a senha da Ana funciona, e ela consegue entrar com a nova
5. Trocar a própria senha pelo Perfil funciona e **não** desconecta quem trocou

Derrubar os dois processos ao fim.

- [ ] **Passo 10: commit**

```bash
cd ..
git add frontend/src
git commit -F - <<'EOF'
Adiciona a area de admin e a troca de senha no front

TrocarArea deixa de ser alternador binario: com tres areas possiveis,
"o outro lado" deixou de ser uma coisa so. Passa a listar as areas que
a pessoa tem, menos a atual.

O modal de troca grava o token que o servidor devolve. Sem isso, quem
acabou de trocar a senha cairia no login na requisicao seguinte — a
troca derruba todas as sessoes anteriores, inclusive a dele.
EOF
```

---

## Tarefa 6: documentação

**Arquivos:** `backend/README.md`, `frontend/README.md`, `ROADMAP.md`, `CLAUDE.md` (local, não
commitar)

- [ ] **Passo 1: `backend/README.md`**

Acrescentar à tabela de rotas:

| `PUT` | `/me/senha` | Troca a senha do próprio usuário |
| `GET` | `/admin/usuarios` | Lista todos, com filtro por perfil e status |
| `PUT` | `/admin/usuarios/:id/senha` | Admin redefine a senha de alguém |

E uma seção explicando: a exigência da senha atual em `/me/senha` e não na de admin; que o admin não
usa a rota de admin para si; e que a troca derruba as sessões antigas, com o porquê.

Acrescentar `db/migracao-v6-admin.sql` à tabela de migrações, e `npm run criar-admin` à lista de
comandos.

- [ ] **Passo 2: `frontend/README.md`**

Acrescentar a área de admin à seção de telas.

- [ ] **Passo 3: `ROADMAP.md`**

Marcar como feitos: "Trocar e redefinir senha" (2.2 e 3), "Decidir entre flag e admin_user" e
"`exigirPerfil('admin')`" e "Área `/admin` no front" (2.1). Atualizar a contagem de testes.

Acrescentar o que a leva 1 deixou aberto, se não estiver lá: editar dados de qualquer usuário e
promover/rebaixar perfis são a leva 2.

- [ ] **Passo 4: `CLAUDE.md`** (não commitar)

Registrar: a flag `admin` e por que `admin_user` segue sem uso; a invalidação por
`senha_alterada_em` com o detalhe do `iat`; e que o admin criado pelo script nasce com os três
perfis.

- [ ] **Passo 5: verificação final**

```bash
cd backend && npm test
cd ../frontend && npm test && npm run lint && npm run build
```

- [ ] **Passo 6: commit**

```bash
cd ..
git add backend/README.md frontend/README.md ROADMAP.md
git commit -F - <<'EOF'
Documenta o perfil de admin e a troca de senha

Registra por que a tabela admin_user continua sem uso, e o que a
invalidacao de token por senha_alterada_em resolve — o JWT de sete dias
sobreviveria a troca de senha sem ela.
EOF
```

---

## Autorrevisão do plano

**Cobertura da spec (leva 1):**

| Requisito | Tarefa |
|---|---|
| Coluna `admin` e migração | 1 |
| Coluna `senha_alterada_em`, nascendo NULL | 1 (schema/migração), 2 (uso) |
| `perfilDe` admin > professor > aluno | 1 |
| `perfisDe` com admin | 1 |
| `autenticar` carrega admin | 1 |
| Invalidação por `iat` < `senha_alterada_em` | 2 |
| `NULL` não invalida ninguém | 2 (teste próprio) |
| `PUT /me/senha` com senha atual | 2 |
| Senha atual errada responde 401 | 2 |
| Troca devolve token novo | 2 |
| `PUT /admin/usuarios/:id/senha` | 3 |
| Admin não usa a rota de admin em si mesmo | 3 (teste + trava) |
| Redefinição derruba as sessões do usuário | 3 (teste próprio) |
| `GET /admin/usuarios` com filtros | 3 |
| Senha nunca vaza em resposta | 2 e 3 (testes próprios) |
| `npm run criar-admin` com os três perfis | 4 |
| `--sem-aluno` | 4 |
| Admin no `npm run demo` | 4 |
| Área `/admin` no front | 5 |
| `TrocarArea` como seletor | 5 |
| "Trocar minha senha" no Perfil | 5 |
| Conferência no navegador | 5 (passo 9) |
| Documentação | 6 |

Sem lacunas na leva 1. As três travas de perfil (não retirar o próprio admin, não deixar o sistema
sem admin, lista fechada de perfis) pertencem à **leva 2**, junto com a rota que as exige — não há o
que travar antes de existir `PUT /admin/usuarios/:id/perfis`.

**Consistência de nomes:** `criarAdminELogar` é definido na Tarefa 1 e usado nas 3; `listarUsuarios`
e `redefinirSenha` são definidos na 3 e consumidos pelo front na 5; `UsuarioAdmin` (tipo do front)
espelha o `CAMPOS_PUBLICOS` do `adminController`, com `admin` incluído.

**Pontos frágeis, assumidos:**

- O Passo 5 da Tarefa 5 descreve `Usuarios.tsx` em vez de trazer o código pronto — é a única tela
  grande do plano, e escrevê-la inteira aqui duplicaria padrões que `Alunos.tsx` já estabelece. Quem
  executar deve seguir aquele arquivo como molde.
- A Tarefa 1 muda a forma de `perfis`, o que pode quebrar asserções em testes antigos. O passo 8
  diz o que fazer e por que atualizar a asserção é correto nesse caso específico.
