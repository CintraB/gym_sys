# Histórico de sessão mais rico — plano de implementação

> **Para quem executa:** use `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans` para tocar tarefa a tarefa. Os passos usam `- [ ]` para
> acompanhamento.

**Objetivo:** guardar peso/repetição real por série lançada, observação e calorias opcionais ao
finalizar, e mostrar tempo por exercício e ordem real de execução no detalhe do histórico.

**Arquitetura:** tabela nova `sessao_serie` (filha de `sessao_exercicio`, um lançamento por série),
duas colunas nulas em `sessao_treino`. Dois endpoints novos para lançar/remover série, `finalizarSessao`
passa a aceitar corpo opcional, `carregarSessao` (usada pelos quatro endpoints de sessão) passa a
trazer os campos novos. "Tempo por exercício e ordem" não muda o banco — usa `concluido_em`, que já
existe, calculado no front.

**Tech Stack:** Express + PostgreSQL (produção) / SQLite via `dialetoSqlite.js` (APK) no backend;
React + TypeScript + Vitest no frontend.

**Spec:** `docs/superpowers/specs/2026-08-27-historico-sessao-rico-design.md`

## Restrições globais

- **pt-BR** em nomes, mensagens e comentários.
- `npm test` **e** `npm run test:sqlite` (backend) verdes ao final — os dois bancos rodam a mesma
  suíte, sem código dependendo de qual está ativo.
- `npm test`, `npm run lint` e `npm run build` (frontend) verdes; `npx tsc --noEmit` limpo.
- **`src/local/rotas.js` espelha toda rota nova do Express** — o teste cruzado já existe e acusa
  sozinho se uma rota ficar de fora, mas a rota só funciona no APK se entrar lá.
- **Sem coluna de "número da série"** em `sessao_serie` — a ordem de lançamento vem de `id`/
  `criado_em`, mesmo padrão que `sessao_exercicio` e `ex_usuario` já usam.
- **Validação do lançamento**: `carga` inteiro ≥ 0 (`0` é válido); `repeticoes` string não vazia
  depois de `trim()`.
- **A ordem visual do histórico não muda** — continua a do bloco prescrito; só um selo mostra a
  ordem real de execução, sem reordenar a lista.
- **Guarda de sessão aberta e de dono** em toda rota de sessão nova, no mesmo padrão de
  `alternarExercicio`: só alcança item de uma sessão **aberta** do **próprio** aluno logado.
- Não editar arquivo-fonte com `sed -i` (quebra o watcher do Vite no Windows deste projeto).
- Commits em português, no imperativo, sem `Co-Authored-By`, direto na `main`, sem push — só quando
  pedido.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `backend/db/schema.sql` | tabela `sessao_serie`; colunas `observacao`/`calorias` em `sessao_treino` |
| `backend/src/controllers/sessaoController.js` | `carregarSessao` traz `series`; `adicionarSerie`; `removerSerie`; `finalizarSessao` aceita corpo |
| `backend/src/routes/alunoRoutes.js` | duas rotas novas de série |
| `backend/test/sessao.test.js` | testes das rotas e do schema novo |
| `backend/README.md` | documenta as rotas novas |
| `frontend/src/local/rotas.js` | espelha as duas rotas novas para o APK |
| `frontend/src/types.ts` | `SessaoSerie`; `SessaoExercicio.series`; `Sessao.observacao`/`calorias` |
| `frontend/src/lib/formato.ts` | `formatarSerieRealizada` |
| `frontend/src/lib/formato.test.ts` | teste do formatador novo |
| `frontend/src/pages/aluno/MeuTreino.tsx` | acordeão de séries na execução; observação/calorias ao finalizar |
| `frontend/src/pages/aluno/MeuTreino.test.tsx` | testes das duas telas acima |
| `frontend/src/pages/aluno/Historico.tsx` | séries, ordem, tempo, observação, calorias no detalhe |
| `frontend/src/pages/aluno/Historico.test.tsx` | **novo** — testes do detalhe |

---

## Tarefa 1: Schema — `sessao_serie` e colunas novas em `sessao_treino`

Sem controller ainda. Ao fim, o schema aceita lançamentos de série e observação/calorias da sessão,
provado com SQL direto nos dois dialetos.

**Arquivos:**
- Modificar: `backend/db/schema.sql`
- Modificar: `backend/test/sessao.test.js`

**Interfaces produzidas:**
```sql
-- tabela sessao_serie: id, id_sessao_exercicio, carga, repeticoes, criado_em
-- sessao_treino ganha: observacao (nulo), calorias (nulo)
```

- [ ] **Passo 1: escrever o teste**

Adicionar ao fim de `backend/test/sessao.test.js` (antes do bloco `/* visão do professor */`):

```js
/* ------------------------------------------------------- séries realizadas */

test("sessao_serie guarda peso e repetição por lançamento", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const sessao = await api.post("/alunos/treino/sessao", null, { token });
  const idItem = sessao.corpo.exercicios[0].id;

  api.executar(
    `INSERT INTO sessao_serie (id_sessao_exercicio, carga, repeticoes) VALUES (${idItem}, 20, '10')`
  );
  const linhas = api.consultar(
    `SELECT carga, repeticoes FROM sessao_serie WHERE id_sessao_exercicio = ${idItem}`
  );

  assert.equal(linhas.length, 1);
  assert.equal(Number(linhas[0].carga), 20);
  assert.equal(linhas[0].repeticoes, "10");
});

test("sessao_treino aceita observação e calorias", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const sessao = await api.post("/alunos/treino/sessao", null, { token });
  const idSessao = sessao.corpo.sessao.id_sessao;

  api.executar(
    `UPDATE sessao_treino SET observacao = 'rendeu pouco', calorias = 350 WHERE id_sessao = ${idSessao}`
  );
  const linhas = api.consultar(
    `SELECT observacao, calorias FROM sessao_treino WHERE id_sessao = ${idSessao}`
  );

  assert.equal(linhas[0].observacao, "rendeu pouco");
  assert.equal(Number(linhas[0].calorias), 350);
});
```

- [ ] **Passo 2: rodar e confirmar que falha**

```bash
cd backend && npm test -- --test-name-pattern "sessao_serie guarda|aceita observação"
```

Esperado: as duas falham — `sessao_serie` e as colunas não existem ainda.

- [ ] **Passo 3: mudar o schema**

Em `backend/db/schema.sql`, no `CREATE TABLE IF NOT EXISTS sessao_treino`, adicionar as duas
colunas ao final (antes do `)`):

```sql
CREATE TABLE IF NOT EXISTS sessao_treino (
    id_sessao         SERIAL PRIMARY KEY,
    id_treino         INTEGER   NOT NULL REFERENCES treino (id_treino) ON DELETE CASCADE,
    id_bloco          INTEGER   REFERENCES treino_bloco (id_bloco),
    id_aluno          INTEGER   NOT NULL REFERENCES usuario (id),
    iniciado_em       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finalizado_em     TIMESTAMPTZ,
    duracao_segundos  INTEGER,
    -- Livres, preenchidos ao finalizar. NULL é o estado de toda sessão já
    -- registrada antes desta coluna existir.
    observacao        VARCHAR(200),
    calorias          INTEGER
);
```

Logo depois de `CREATE TABLE IF NOT EXISTS sessao_exercicio (...)`, adicionar a tabela nova:

```sql
-- Um lançamento por série realizada (peso e repetição de verdade, não o
-- prescrito). Sem coluna de "número da série": a ordem de lançamento (id/
-- criado_em) já numera, mesmo padrão de sessao_exercicio e ex_usuario.
CREATE TABLE IF NOT EXISTS sessao_serie (
    id                   SERIAL PRIMARY KEY,
    id_sessao_exercicio  INTEGER   NOT NULL REFERENCES sessao_exercicio (id) ON DELETE CASCADE,
    carga                INTEGER   NOT NULL,
    repeticoes           VARCHAR(30) NOT NULL,
    criado_em            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

E junto aos `CREATE INDEX` existentes, mais abaixo no arquivo:

```sql
CREATE INDEX IF NOT EXISTS idx_sessao_serie_exercicio ON sessao_serie (id_sessao_exercicio);
```

- [ ] **Passo 4: rodar e confirmar que passa, nos dois bancos**

```bash
cd backend && npm test -- --test-name-pattern "sessao_serie guarda|aceita observação"
npm run test:sqlite -- --test-name-pattern "sessao_serie guarda|aceita observação"
```

Esperado: PASS nas duas chamadas. Se o SQLite falhar, o problema é o tradutor
(`backend/src/lib/dialetoSqlite.js`) — mas `SERIAL`, `TIMESTAMPTZ` e `VARCHAR` já são convertidos de
forma genérica, então não deveria precisar mudar nada lá.

- [ ] **Passo 5: rodar a suíte inteira, nos dois bancos**

```bash
npm test
npm run test:sqlite
```

Esperado: tudo verde — o schema não pode quebrar nada que já existia.

- [ ] **Passo 6: commit**

```bash
git add backend/db/schema.sql backend/test/sessao.test.js
git commit -m "adiciona sessao_serie e observacao/calorias em sessao_treino"
```

---

## Tarefa 2: `carregarSessao` traz séries, observação e calorias

Ao fim, `GET /alunos/treino/sessao` (e os outros três endpoints que passam por `carregarSessao`)
devolvem `series: []` em cada exercício e `observacao`/`calorias` na sessão — mesmo sem lançamento
nenhum ainda.

**Arquivos:**
- Modificar: `backend/src/controllers/sessaoController.js`
- Modificar: `backend/test/sessao.test.js`

**Interfaces consumidas:** a tabela `sessao_serie` da Tarefa 1.

**Interfaces produzidas:**
```js
// carregarSessao(idSessao) agora devolve:
// { sessao: { ...como antes, observacao: string|null, calorias: number|null },
//   exercicios: [{ ...como antes, series: [{ id, carga, repeticoes, criado_em }] }] }
```

- [ ] **Passo 1: escrever o teste**

Adicionar em `backend/test/sessao.test.js`, na mesma seção da Tarefa 1:

```js
test("sessão traz as séries lançadas por exercício", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const sessao = await api.post("/alunos/treino/sessao", null, { token });
  const idItem = sessao.corpo.exercicios[0].id;

  api.executar(
    `INSERT INTO sessao_serie (id_sessao_exercicio, carga, repeticoes) VALUES (${idItem}, 20, '10')`
  );

  const atual = await api.get("/alunos/treino/sessao", { token });
  const exercicio = atual.corpo.exercicios.find((e) => e.id === idItem);

  assert.equal(exercicio.series.length, 1);
  assert.equal(Number(exercicio.series[0].carga), 20);
  assert.equal(exercicio.series[0].repeticoes, "10");
});

test("exercício sem lançamento traz series vazio, não ausente", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const sessao = await api.post("/alunos/treino/sessao", null, { token });

  assert.ok(Array.isArray(sessao.corpo.exercicios[0].series));
  assert.equal(sessao.corpo.exercicios[0].series.length, 0);
});
```

- [ ] **Passo 2: rodar e confirmar que falha**

```bash
cd backend && npm test -- --test-name-pattern "traz as séries|series vazio"
```

Esperado: FAIL — `exercicio.series` é `undefined`.

- [ ] **Passo 3: implementar**

Em `backend/src/controllers/sessaoController.js`, adicionar a consulta de séries logo depois de
`SQL_EXERCICIOS_DA_SESSAO`:

```js
const SQL_SERIES_DA_SESSAO = `
  SELECT ss.id, ss.id_sessao_exercicio, ss.carga, ss.repeticoes, ss.criado_em
    FROM sessao_serie ss
    JOIN sessao_exercicio se ON se.id = ss.id_sessao_exercicio
   WHERE se.id_sessao = $1
   ORDER BY ss.id
`;
```

Trocar a consulta de sessão dentro de `carregarSessao` para trazer as colunas novas, e agrupar as
séries por exercício:

```js
async function carregarSessao(idSessao) {
  const { rows } = await db.query(
    `SELECT s.id_sessao, s.id_treino, s.id_bloco, s.id_aluno, s.iniciado_em,
            s.finalizado_em, s.duracao_segundos, s.observacao, s.calorias,
            u.nome AS nome_professor,
            b.letra AS bloco_letra, b.nome AS bloco_nome
       FROM sessao_treino s
       JOIN treino t ON t.id_treino = s.id_treino
       JOIN usuario u ON u.id = t.id_professor
       LEFT JOIN treino_bloco b ON b.id_bloco = s.id_bloco
      WHERE s.id_sessao = $1`,
    [idSessao]
  );

  if (rows.length === 0) return null;

  const { rows: exercicios } = await db.query(SQL_EXERCICIOS_DA_SESSAO, [idSessao]);
  const { rows: series } = await db.query(SQL_SERIES_DA_SESSAO, [idSessao]);

  const seriesPorExercicio = new Map();
  for (const serie of series) {
    const lista = seriesPorExercicio.get(serie.id_sessao_exercicio) ?? [];
    lista.push({ id: serie.id, carga: serie.carga, repeticoes: serie.repeticoes, criado_em: serie.criado_em });
    seriesPorExercicio.set(serie.id_sessao_exercicio, lista);
  }

  return {
    sessao: rows[0],
    exercicios: exercicios.map((exercicio) => ({
      ...exercicio,
      series: seriesPorExercicio.get(exercicio.id) ?? [],
    })),
  };
}
```

- [ ] **Passo 4: rodar e confirmar que passa, nos dois bancos**

```bash
npm test -- --test-name-pattern "traz as séries|series vazio"
npm run test:sqlite -- --test-name-pattern "traz as séries|series vazio"
```

- [ ] **Passo 5: suíte inteira, nos dois bancos**

```bash
npm test
npm run test:sqlite
```

- [ ] **Passo 6: commit**

```bash
git add backend/src/controllers/sessaoController.js backend/test/sessao.test.js
git commit -m "carregarSessao traz series, observacao e calorias"
```

---

## Tarefa 3: `POST .../exercicio/:id/serie` — lançar uma série

**Arquivos:**
- Modificar: `backend/src/controllers/sessaoController.js`
- Modificar: `backend/src/routes/alunoRoutes.js`
- Modificar: `frontend/src/local/rotas.js`
- Modificar: `backend/test/sessao.test.js`

**Interfaces consumidas:** `sessao_serie` (Tarefa 1), `carregarSessao` com `series` (Tarefa 2).

**Interfaces produzidas:**
```js
// POST /alunos/treino/sessao/exercicio/:id/serie
// corpo: { carga: number, repeticoes: string }
// 201: { id, carga, repeticoes, criado_em }
```

- [ ] **Passo 1: escrever os testes**

```js
test("lança peso e repetição numa série", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const sessao = await api.post("/alunos/treino/sessao", null, { token });
  const idItem = sessao.corpo.exercicios[0].id;

  const resposta = await api.post(
    `/alunos/treino/sessao/exercicio/${idItem}/serie`,
    { carga: 20, repeticoes: "10" },
    { token }
  );

  assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
  assert.equal(Number(resposta.corpo.carga), 20);
  assert.equal(resposta.corpo.repeticoes, "10");
  assert.ok(resposta.corpo.id);
});

test("carga precisa ser inteiro não negativo", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const sessao = await api.post("/alunos/treino/sessao", null, { token });
  const idItem = sessao.corpo.exercicios[0].id;

  for (const carga of [-1, 1.5, "20", null]) {
    const resposta = await api.post(
      `/alunos/treino/sessao/exercicio/${idItem}/serie`,
      { carga, repeticoes: "10" },
      { token }
    );
    assert.equal(resposta.status, 400, `aceitou carga ${JSON.stringify(carga)}`);
  }
});

test("repetições não pode ficar vazio", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const sessao = await api.post("/alunos/treino/sessao", null, { token });
  const idItem = sessao.corpo.exercicios[0].id;

  const resposta = await api.post(
    `/alunos/treino/sessao/exercicio/${idItem}/serie`,
    { carga: 20, repeticoes: "   " },
    { token }
  );
  assert.equal(resposta.status, 400);
});

test("não lança série em exercício de outro aluno", async (t) => {
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

  const invasao = await api.post(
    `/alunos/treino/sessao/exercicio/${idItem}/serie`,
    { carga: 20, repeticoes: "10" },
    { token: loginOutro.corpo.token }
  );
  assert.equal(invasao.status, 404);
});

test("não lança série depois de finalizar a sessão", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const sessao = await api.post("/alunos/treino/sessao", null, { token });
  const idItem = sessao.corpo.exercicios[0].id;
  await api.post("/alunos/treino/sessao/finalizar", null, { token });

  const resposta = await api.post(
    `/alunos/treino/sessao/exercicio/${idItem}/serie`,
    { carga: 20, repeticoes: "10" },
    { token }
  );
  assert.equal(resposta.status, 404);
});
```

- [ ] **Passo 2: rodar e confirmar que falham**

```bash
cd backend && npm test -- --test-name-pattern "lança peso|carga precisa|repetições não pode|não lança série"
```

Esperado: FAIL com 404 de rota (a rota não existe ainda).

- [ ] **Passo 3: implementar o controller**

Em `backend/src/controllers/sessaoController.js`, adicionar depois de `alternarExercicio`:

```js
/** Lança peso/repetição de uma série realizada. */
export const adicionarSerie = asyncHandler(async (req, res) => {
  const idItem = Number(req.params.id);
  if (!Number.isInteger(idItem) || idItem <= 0) {
    throw erroRequisicao("Identificador inválido");
  }

  const carga = req.body?.carga;
  if (typeof carga !== "number" || !Number.isInteger(carga) || carga < 0) {
    throw erroRequisicao("Informe a carga como um número inteiro maior ou igual a zero");
  }

  const repeticoes = typeof req.body?.repeticoes === "string" ? req.body.repeticoes.trim() : "";
  if (!repeticoes) {
    throw erroRequisicao("Informe as repetições");
  }

  // INSERT ... SELECT ... WHERE EXISTS: a mesma consulta garante a posse e
  // grava, sem corrida entre checar e inserir.
  const { rows } = await db.query(
    `INSERT INTO sessao_serie (id_sessao_exercicio, carga, repeticoes)
     SELECT $1, $2, $3
      WHERE EXISTS (
          SELECT 1 FROM sessao_exercicio se
           WHERE se.id = $1
             AND se.id_sessao IN (
                 SELECT id_sessao FROM sessao_treino
                  WHERE id_aluno = $4 AND finalizado_em IS NULL
             )
      )
     RETURNING id, carga, repeticoes, criado_em`,
    [idItem, carga, repeticoes, req.usuario.id]
  );

  if (rows.length === 0) {
    throw erroNaoEncontrado("Exercício não encontrado na sessão em andamento");
  }

  res.status(201).json(rows[0]);
});
```

Em `backend/src/routes/alunoRoutes.js`, adicionar depois da linha de `alternarExercicio`:

```js
rotas.post("/treino/sessao/exercicio/:id/serie", sessao.adicionarSerie);
```

Em `frontend/src/local/rotas.js`, adicionar depois da linha equivalente de `alternarExercicio`:

```js
{ metodo: 'POST', caminho: '/alunos/treino/sessao/exercicio/:id/serie', autenticado: true, perfil: 'aluno', acao: sessao.adicionarSerie },
```

- [ ] **Passo 4: rodar e confirmar que passam, nos dois bancos**

```bash
npm test -- --test-name-pattern "lança peso|carga precisa|repetições não pode|não lança série"
npm run test:sqlite -- --test-name-pattern "lança peso|carga precisa|repetições não pode|não lança série"
```

- [ ] **Passo 5: suíte inteira, nos dois bancos, e o teste cruzado de rotas**

```bash
npm test
npm run test:sqlite
cd ../frontend && npm test -- rotas
```

- [ ] **Passo 6: commit**

```bash
git add backend/src/controllers/sessaoController.js backend/src/routes/alunoRoutes.js \
        frontend/src/local/rotas.js backend/test/sessao.test.js
git commit -m "adiciona rota para lancar serie realizada"
```

---

## Tarefa 4: `DELETE .../exercicio/:id/serie/:idSerie` — remover um lançamento

**Arquivos:**
- Modificar: `backend/src/controllers/sessaoController.js`
- Modificar: `backend/src/routes/alunoRoutes.js`
- Modificar: `frontend/src/local/rotas.js`
- Modificar: `backend/test/sessao.test.js`

**Interfaces consumidas:** `adicionarSerie` (Tarefa 3), para criar o lançamento a remover no teste.

**Interfaces produzidas:**
```js
// DELETE /alunos/treino/sessao/exercicio/:id/serie/:idSerie
// 200: { message: "Série removida" }
```

- [ ] **Passo 1: escrever os testes**

```js
test("remove um lançamento de série", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const sessao = await api.post("/alunos/treino/sessao", null, { token });
  const idItem = sessao.corpo.exercicios[0].id;
  const serie = await api.post(
    `/alunos/treino/sessao/exercicio/${idItem}/serie`,
    { carga: 20, repeticoes: "10" },
    { token }
  );

  const removida = await api.requisicao(
    "DELETE",
    `/alunos/treino/sessao/exercicio/${idItem}/serie/${serie.corpo.id}`,
    { token }
  );
  assert.equal(removida.status, 200);

  const atual = await api.get("/alunos/treino/sessao", { token });
  const exercicio = atual.corpo.exercicios.find((e) => e.id === idItem);
  assert.equal(exercicio.series.length, 0);
});

test("não remove série de outro aluno", async (t) => {
  const { api, tokenProfessor, token } = await cenario();
  t.after(() => api.encerrar());

  const sessao = await api.post("/alunos/treino/sessao", null, { token });
  const idItem = sessao.corpo.exercicios[0].id;
  const serie = await api.post(
    `/alunos/treino/sessao/exercicio/${idItem}/serie`,
    { carga: 20, repeticoes: "10" },
    { token }
  );

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

  const invasao = await api.requisicao(
    "DELETE",
    `/alunos/treino/sessao/exercicio/${idItem}/serie/${serie.corpo.id}`,
    { token: loginOutro.corpo.token }
  );
  assert.equal(invasao.status, 404);
});

test("remover série inexistente dá 404", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  const sessao = await api.post("/alunos/treino/sessao", null, { token });
  const idItem = sessao.corpo.exercicios[0].id;

  const resposta = await api.requisicao(
    "DELETE",
    `/alunos/treino/sessao/exercicio/${idItem}/serie/999999`,
    { token }
  );
  assert.equal(resposta.status, 404);
});
```

- [ ] **Passo 2: rodar e confirmar que falham**

```bash
cd backend && npm test -- --test-name-pattern "remove um lançamento|não remove série|inexistente"
```

- [ ] **Passo 3: implementar**

Em `backend/src/controllers/sessaoController.js`, depois de `adicionarSerie`:

```js
/** Remove um lançamento errado — só enquanto a sessão segue aberta. */
export const removerSerie = asyncHandler(async (req, res) => {
  const idItem = Number(req.params.id);
  const idSerie = Number(req.params.idSerie);
  if (!Number.isInteger(idItem) || idItem <= 0 || !Number.isInteger(idSerie) || idSerie <= 0) {
    throw erroRequisicao("Identificador inválido");
  }

  const { rows } = await db.query(
    `DELETE FROM sessao_serie
      WHERE id = $1
        AND id_sessao_exercicio = $2
        AND id_sessao_exercicio IN (
            SELECT se.id FROM sessao_exercicio se
             WHERE se.id_sessao IN (
                 SELECT id_sessao FROM sessao_treino
                  WHERE id_aluno = $3 AND finalizado_em IS NULL
             )
        )
      RETURNING id`,
    [idSerie, idItem, req.usuario.id]
  );

  if (rows.length === 0) {
    throw erroNaoEncontrado("Série não encontrada na sessão em andamento");
  }
  res.json({ message: "Série removida" });
});
```

Em `backend/src/routes/alunoRoutes.js`, depois da linha de `adicionarSerie`:

```js
rotas.delete("/treino/sessao/exercicio/:id/serie/:idSerie", sessao.removerSerie);
```

Em `frontend/src/local/rotas.js`, depois da linha equivalente:

```js
{ metodo: 'DELETE', caminho: '/alunos/treino/sessao/exercicio/:id/serie/:idSerie', autenticado: true, perfil: 'aluno', acao: sessao.removerSerie },
```

- [ ] **Passo 4: rodar e confirmar que passam, nos dois bancos**

```bash
npm test -- --test-name-pattern "remove um lançamento|não remove série|inexistente"
npm run test:sqlite -- --test-name-pattern "remove um lançamento|não remove série|inexistente"
```

- [ ] **Passo 5: suíte inteira, nos dois bancos, e o teste cruzado de rotas**

```bash
npm test
npm run test:sqlite
cd ../frontend && npm test -- rotas
```

- [ ] **Passo 6: commit**

```bash
git add backend/src/controllers/sessaoController.js backend/src/routes/alunoRoutes.js \
        frontend/src/local/rotas.js backend/test/sessao.test.js
git commit -m "adiciona rota para remover lancamento de serie"
```

---

## Tarefa 5: `finalizarSessao` aceita observação e calorias

**Arquivos:**
- Modificar: `backend/src/controllers/sessaoController.js`
- Modificar: `backend/test/sessao.test.js`

**Interfaces consumidas:** `carregarSessao` com `observacao`/`calorias` (Tarefa 2).

- [ ] **Passo 1: escrever os testes**

```js
test("finalizar grava observação e calorias opcionais", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  await api.post("/alunos/treino/sessao", null, { token });
  const finalizada = await api.post(
    "/alunos/treino/sessao/finalizar",
    { observacao: " hoje rendeu pouco ", calorias: 350 },
    { token }
  );

  assert.equal(finalizada.corpo.sessao.observacao, "hoje rendeu pouco");
  assert.equal(Number(finalizada.corpo.sessao.calorias), 350);
});

test("finalizar sem observação nem calorias grava nulo", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  await api.post("/alunos/treino/sessao", null, { token });
  const finalizada = await api.post("/alunos/treino/sessao/finalizar", null, { token });

  assert.equal(finalizada.corpo.sessao.observacao, null);
  assert.equal(finalizada.corpo.sessao.calorias, null);
});

test("calorias inválida é ignorada, não quebra o finalizar", async (t) => {
  const { api, token } = await cenario();
  t.after(() => api.encerrar());

  await api.post("/alunos/treino/sessao", null, { token });
  const finalizada = await api.post(
    "/alunos/treino/sessao/finalizar",
    { calorias: "muitas" },
    { token }
  );

  assert.equal(finalizada.status, 200);
  assert.equal(finalizada.corpo.sessao.calorias, null);
});
```

- [ ] **Passo 2: rodar e confirmar que falham**

```bash
cd backend && npm test -- --test-name-pattern "finalizar grava observação|sem observação nem calorias|calorias inválida"
```

Esperado: FAIL — `observacao`/`calorias` vêm `undefined` porque `finalizarSessao` ainda ignora o
corpo inteiro.

- [ ] **Passo 3: implementar**

Em `backend/src/controllers/sessaoController.js`, trocar `finalizarSessao`:

```js
export const finalizarSessao = asyncHandler(async (req, res) => {
  const idSessao = await buscarSessaoAberta(req.usuario.id);
  if (!idSessao) {
    throw erroConflito("Nenhum treino em andamento");
  }

  // A duração sai de iniciado_em, gravado pelo servidor — nunca do corpo da
  // requisição. Observação e calorias são as duas únicas coisas que o corpo
  // pode influenciar aqui.
  const { rows } = await db.query(
    "SELECT iniciado_em FROM sessao_treino WHERE id_sessao = $1",
    [idSessao]
  );

  const fim = new Date();
  const duracao = Math.max(
    0,
    Math.round((fim.getTime() - new Date(rows[0].iniciado_em).getTime()) / 1000)
  );

  const observacao =
    typeof req.body?.observacao === "string" && req.body.observacao.trim()
      ? req.body.observacao.trim().slice(0, 200)
      : null;
  const calorias =
    typeof req.body?.calorias === "number" &&
    Number.isInteger(req.body.calorias) &&
    req.body.calorias >= 0
      ? req.body.calorias
      : null;

  await db.query(
    `UPDATE sessao_treino
        SET finalizado_em = $2, duracao_segundos = $3, observacao = $4, calorias = $5
      WHERE id_sessao = $1`,
    [idSessao, fim, duracao, observacao, calorias]
  );

  res.json(await carregarSessao(idSessao));
});
```

- [ ] **Passo 4: rodar e confirmar que passam, nos dois bancos**

```bash
npm test -- --test-name-pattern "finalizar grava observação|sem observação nem calorias|calorias inválida"
npm run test:sqlite -- --test-name-pattern "finalizar grava observação|sem observação nem calorias|calorias inválida"
```

- [ ] **Passo 5: suíte inteira, nos dois bancos**

```bash
npm test
npm run test:sqlite
```

Conferir em especial que `"o cliente não consegue inflar a duração"` continua passando — corpo
extra não pode voltar a valer para tempo.

- [ ] **Passo 6: commit**

```bash
git add backend/src/controllers/sessaoController.js backend/test/sessao.test.js
git commit -m "finalizarSessao aceita observacao e calorias opcionais"
```

---

## Tarefa 6: documentar as rotas novas no `backend/README.md`

**Arquivos:**
- Modificar: `backend/README.md`

- [ ] **Passo 1: adicionar as duas linhas na tabela de rotas de aluno**

Na tabela onde já está a linha de `PUT /alunos/treino/sessao/exercicio/:id`, adicionar logo abaixo:

```markdown
| POST | `/alunos/treino/sessao/exercicio/:id/serie` | Lança peso/repetição de uma série realizada |
| DELETE | `/alunos/treino/sessao/exercicio/:id/serie/:idSerie` | Remove um lançamento, só com a sessão aberta |
```

- [ ] **Passo 2: nota sobre o corpo do finalizar**

Perto do trecho que já explica que o corpo de finalizar é ignorado para o tempo (linha ~149),
acrescentar:

```markdown
`observacao` (texto, até 200 caracteres) e `calorias` (inteiro ≥ 0) são os dois campos que o corpo
de `POST .../finalizar` pode de fato influenciar — ambos opcionais, gravados como `NULL` quando
ausentes ou inválidos.
```

- [ ] **Passo 3: commit**

```bash
git add backend/README.md
git commit -m "documenta as rotas de serie e o corpo do finalizar"
```

---

## Tarefa 7: tipos e formatador de série no frontend

Ao fim, o TypeScript conhece os campos novos e existe uma função só para formatar "20kg×10".

**Arquivos:**
- Modificar: `frontend/src/types.ts`
- Modificar: `frontend/src/lib/formato.ts`
- Modificar: `frontend/src/lib/formato.test.ts`

**Interfaces produzidas:**
```ts
export interface SessaoSerie {
  id: number
  carga: string | number
  repeticoes: string
  criado_em: string
}
// SessaoExercicio.series: SessaoSerie[]
// Sessao.observacao: string | null
// Sessao.calorias: number | null
export function formatarSerieRealizada(carga: number, repeticoes: string): string
```

- [ ] **Passo 1: escrever o teste do formatador**

Em `frontend/src/lib/formato.test.ts`, adicionar (perto de `describe('descreverSerieCurta', ...)`):

```ts
describe('formatarSerieRealizada', () => {
  it('junta carga e repetições', () => {
    expect(formatarSerieRealizada(20, '10')).toBe('20kg×10')
  })

  it('aceita carga zero', () => {
    expect(formatarSerieRealizada(0, '15')).toBe('0kg×15')
  })
})
```

E importar `formatarSerieRealizada` junto com os outros imports do topo do arquivo.

- [ ] **Passo 2: rodar e confirmar que falha**

```bash
cd frontend && npx vitest run src/lib/formato.test.ts -t "formatarSerieRealizada"
```

- [ ] **Passo 3: implementar o formatador**

Em `frontend/src/lib/formato.ts`, adicionar depois de `descreverSerieCurta`:

```ts
/** "20kg×10" — carga e repetição de uma série realmente lançada. */
export function formatarSerieRealizada(carga: number, repeticoes: string) {
  return `${carga}kg×${repeticoes}`
}
```

- [ ] **Passo 4: rodar e confirmar que passa**

```bash
npx vitest run src/lib/formato.test.ts -t "formatarSerieRealizada"
```

- [ ] **Passo 5: atualizar os tipos**

Em `frontend/src/types.ts`, adicionar antes de `export interface SessaoExercicio`:

```ts
/** Um lançamento de peso/repetição real numa série. */
export interface SessaoSerie {
  id: number
  carga: string | number
  repeticoes: string
  criado_em: string
}
```

Em `SessaoExercicio`, adicionar o campo (a interface existente não muda, só ganha uma linha):

```ts
export interface SessaoExercicio {
  id: number
  concluido: boolean
  concluido_em: string | null
  id_ex_usuario: number
  numero_serie: number
  repeticoes: string
  carga: string | number | null
  observacao_ex_usuario: string | null
  nome_exercicio: string
  tipo: string | null
  series: SessaoSerie[]
}
```

Em `Sessao`, adicionar os dois campos:

```ts
export interface Sessao {
  id_sessao: number
  id_treino: number
  id_bloco: number | null
  id_aluno: number
  iniciado_em: string
  finalizado_em: string | null
  duracao_segundos: number | null
  nome_professor: string
  bloco_letra: string | null
  bloco_nome: string | null
  observacao: string | null
  calorias: number | null
}
```

- [ ] **Passo 6: type-check e suíte inteira**

```bash
npx tsc --noEmit
npx vitest run
```

Esperado: `tsc` limpo. A suíte pode acusar os fixtures de `SessaoCompleta`/`Sessao`/`SessaoExercicio`
já existentes em outros testes (`MeuTreino.test.tsx`, `AppShell.test.tsx`, `paginas.test.tsx`) que
não têm os campos novos — se acusar, adicionar `series: []` aos exercícios dos fixtures e
`observacao: null, calorias: null` aos objetos de sessão desses arquivos antes de seguir.

- [ ] **Passo 7: commit**

```bash
git add frontend/src/types.ts frontend/src/lib/formato.ts frontend/src/lib/formato.test.ts
git commit -m "adiciona tipos e formatador de serie realizada"
```

---

## Tarefa 8: lançar e remover série na tela de execução

Ao fim, cada exercício da execução tem uma seta que abre um formulário de carga/repetição, lista o
que já foi lançado e deixa apagar um lançamento errado.

**Arquivos:**
- Modificar: `frontend/src/pages/aluno/MeuTreino.tsx`
- Modificar: `frontend/src/pages/aluno/MeuTreino.test.tsx`

**Interfaces consumidas:** `SessaoSerie`, `formatarSerieRealizada` (Tarefa 7); `POST`/`DELETE
.../serie` (Tarefas 3 e 4).

**Interfaces produzidas:** nenhuma consumida por tarefa seguinte — é folha da árvore.

- [ ] **Passo 1: atualizar o fixture e escrever os testes**

Em `frontend/src/pages/aluno/MeuTreino.test.tsx`, adicionar `series: []` ao exercício de
`SESSAO_ATIVA` (o objeto já existe no arquivo — só falta o campo):

```ts
const SESSAO_ATIVA = {
  sessao: { /* ...como já está... */ },
  exercicios: [
    {
      id: 1,
      concluido: false,
      concluido_em: null,
      id_ex_usuario: 1,
      numero_serie: 4,
      repeticoes: '10 a 15',
      carga: 30,
      observacao_ex_usuario: null,
      nome_exercicio: 'SUPINO SENTADO',
      tipo: 'PEITO',
      series: [],
    },
  ],
}
```

Adicionar `del` no topo do arquivo, junto com `get`/`post` (ele hoje só existe dentro do describe
de descartar — mover a declaração para o topo, e apagar a linha duplicada de dentro do describe):

```ts
const get = vi.mocked(api.get)
const post = vi.mocked(api.post)
const del = vi.mocked(api.delete)
```

E remover a linha `const del = vi.mocked(api.delete)` de dentro de
`describe('MeuTreino — confirmar antes de descartar', ...)`.

Adicionar um novo describe, antes do describe de descartar:

```ts
describe('MeuTreino — lançar séries na execução', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    post.mockResolvedValue({ data: {} } as never)
    del.mockResolvedValue({ data: {} } as never)
  })

  it('a seta abre o formulário de lançar série', async () => {
    const usuario = userEvent.setup()
    responder({ '/alunos/treino/sessao': SESSAO_ATIVA })
    renderizar(<MeuTreino />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: /lançar peso e repetição/i }))

    expect(screen.getByLabelText(/carga/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^adicionar$/i })).toBeInTheDocument()
  })

  it('lança uma série e mostra na lista depois de salvar', async () => {
    const usuario = userEvent.setup()
    // `responder()` congela o mapa de respostas na hora em que é chamada — para o
    // GET seguinte devolver algo diferente, o mock precisa ler de uma variável que
    // o teste ainda pode reatribuir, não do objeto que foi passado a `responder()`.
    let sessaoAtual: typeof SESSAO_ATIVA = SESSAO_ATIVA
    get.mockImplementation((url: string) => {
      if (url === '/alunos/treino/sessao') return Promise.resolve({ data: sessaoAtual } as never)
      if (url === '/alunos/meutreino') return Promise.resolve({ data: TREINO_UM_BLOCO } as never)
      if (url === '/alunos/pedidotreino') return Promise.resolve({ data: null } as never)
      return Promise.resolve({ data: [] } as never)
    })
    post.mockResolvedValue({
      data: { id: 1, carga: 20, repeticoes: '10', criado_em: '2026-08-27T10:00:00Z' },
    } as never)

    renderizar(<MeuTreino />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: /lançar peso e repetição/i }))
    await usuario.type(screen.getByLabelText(/carga/i), '20')
    await usuario.type(screen.getByLabelText(/repetições/i), '10')

    // depois de salvar, o próximo GET devolve a sessão já com a série lançada
    sessaoAtual = {
      ...SESSAO_ATIVA,
      exercicios: [
        {
          ...SESSAO_ATIVA.exercicios[0],
          series: [{ id: 1, carga: 20, repeticoes: '10', criado_em: '2026-08-27T10:00:00Z' }],
        },
      ],
    }

    await usuario.click(screen.getByRole('button', { name: /^adicionar$/i }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/alunos/treino/sessao/exercicio/1/serie', {
        carga: 20,
        repeticoes: '10',
      })
    })
    expect(await screen.findByText('20kg×10')).toBeInTheDocument()
  })

  it('não deixa adicionar sem preencher repetições', async () => {
    const usuario = userEvent.setup()
    responder({ '/alunos/treino/sessao': SESSAO_ATIVA })
    renderizar(<MeuTreino />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: /lançar peso e repetição/i }))

    expect(screen.getByRole('button', { name: /^adicionar$/i })).toBeDisabled()
  })

  it('remove um lançamento já feito', async () => {
    const usuario = userEvent.setup()
    let sessaoAtual: typeof SESSAO_ATIVA = {
      ...SESSAO_ATIVA,
      exercicios: [
        {
          ...SESSAO_ATIVA.exercicios[0],
          series: [{ id: 9, carga: 20, repeticoes: '10', criado_em: '2026-08-27T10:00:00Z' }],
        },
      ],
    }
    get.mockImplementation((url: string) => {
      if (url === '/alunos/treino/sessao') return Promise.resolve({ data: sessaoAtual } as never)
      if (url === '/alunos/meutreino') return Promise.resolve({ data: TREINO_UM_BLOCO } as never)
      if (url === '/alunos/pedidotreino') return Promise.resolve({ data: null } as never)
      return Promise.resolve({ data: [] } as never)
    })

    renderizar(<MeuTreino />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: /lançar peso e repetição/i }))
    expect(await screen.findByText('20kg×10')).toBeInTheDocument()

    sessaoAtual = SESSAO_ATIVA
    await usuario.click(screen.getByRole('button', { name: /remover este lançamento/i }))

    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('/alunos/treino/sessao/exercicio/1/serie/9')
    })
  })
})
```

- [ ] **Passo 2: rodar e confirmar que falham**

```bash
cd frontend && npx vitest run src/pages/aluno/MeuTreino.test.tsx -t "lançar séries"
```

Esperado: FAIL — não existe botão "Lançar peso e repetição" ainda.

- [ ] **Passo 3: implementar**

Em `frontend/src/pages/aluno/MeuTreino.tsx`, trocar a linha de import dos ícones:

```tsx
import { Check, ChevronDown, Dumbbell, Flag, Play, Send, Timer, Trash2, X } from 'lucide-react'
```

Trocar o import de `Campo`:

```tsx
import { AreaTexto, Campo } from '../../components/ui/Campo'
```

Em `ModoExecucao`, adicionar o estado do acordeão e as duas funções de série, logo depois da
declaração de `otimistas`:

```tsx
const [exercicioExpandido, setExercicioExpandido] = useState<number | null>(null)

async function adicionarSerie(item: SessaoExercicio, dados: { carga: number; repeticoes: string }) {
  await api.post(`/alunos/treino/sessao/exercicio/${item.id}/serie`, dados)
  aoMudar()
}

async function removerSerie(item: SessaoExercicio, idSerie: number) {
  try {
    await api.delete(`/alunos/treino/sessao/exercicio/${item.id}/serie/${idSerie}`)
    aoMudar()
  } catch (e) {
    setErro(mensagemDeErro(e, 'Não foi possível remover a série.'))
  }
}
```

Trocar o `.map()` que renderiza `LinhaExecucao` para passar as props novas:

```tsx
{itens.map((item) => (
  <LinhaExecucao
    key={item.id}
    item={item}
    aoAlternar={() => alternar(item, !item.concluido)}
    expandido={exercicioExpandido === item.id}
    aoAlternarExpandido={() =>
      setExercicioExpandido((atual) => (atual === item.id ? null : item.id))
    }
    aoAdicionarSerie={(dados) => adicionarSerie(item, dados)}
    aoRemoverSerie={(idSerie) => removerSerie(item, idSerie)}
  />
))}
```

Trocar o componente `LinhaExecucao` inteiro:

```tsx
function LinhaExecucao({
  item,
  aoAlternar,
  expandido,
  aoAlternarExpandido,
  aoAdicionarSerie,
  aoRemoverSerie,
}: {
  item: SessaoExercicio
  aoAlternar: () => void
  expandido: boolean
  aoAlternarExpandido: () => void
  aoAdicionarSerie: (dados: { carga: number; repeticoes: string }) => Promise<void>
  aoRemoverSerie: (idSerie: number) => Promise<void>
}) {
  const detalhe = descreverSerie(item.numero_serie, item.repeticoes, item.carga)

  return (
    <li className="space-y-2">
      <div
        className={cn(
          'flex items-stretch gap-1 rounded-2xl border transition-colors',
          item.concluido
            ? 'border-acento/40 bg-acento/[0.08]'
            : 'border-borda bg-superficie hover:border-borda/80',
        )}
      >
        <button
          type="button"
          onClick={aoAlternar}
          aria-pressed={item.concluido}
          className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left"
        >
          <span
            className={cn(
              'grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors',
              item.concluido ? 'border-acento bg-acento text-sobre-acento' : 'border-borda',
            )}
            aria-hidden
          >
            {item.concluido && <Check className="size-3.5" strokeWidth={3} />}
          </span>

          <span className="min-w-0 flex-1">
            <span
              className={cn(
                'block truncate font-medium',
                item.concluido && 'text-texto-suave line-through decoration-texto-suave/50',
              )}
            >
              {item.nome_exercicio}
            </span>
            {detalhe && (
              <span className="mt-0.5 block text-sm tabular-nums text-texto-suave">{detalhe}</span>
            )}
            {item.observacao_ex_usuario && (
              <span className="mt-1 block text-xs text-acento-texto">
                {item.observacao_ex_usuario}
              </span>
            )}
          </span>
        </button>

        <button
          type="button"
          onClick={aoAlternarExpandido}
          aria-expanded={expandido}
          aria-label={expandido ? 'Fechar séries lançadas' : 'Lançar peso e repetição'}
          className="grid w-12 shrink-0 place-items-center text-texto-suave transition-colors hover:text-texto"
        >
          <ChevronDown
            className={cn('size-5 transition-transform', expandido && 'rotate-180')}
            aria-hidden
          />
        </button>
      </div>

      {expandido && (
        <FormularioSerie
          series={item.series}
          aoAdicionar={aoAdicionarSerie}
          aoRemover={aoRemoverSerie}
        />
      )}
    </li>
  )
}

function FormularioSerie({
  series,
  aoAdicionar,
  aoRemover,
}: {
  series: SessaoSerie[]
  aoAdicionar: (dados: { carga: number; repeticoes: string }) => Promise<void>
  aoRemover: (idSerie: number) => Promise<void>
}) {
  const [carga, setCarga] = useState('')
  const [repeticoes, setRepeticoes] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function adicionar(evento: FormEvent) {
    evento.preventDefault()
    if (!repeticoes.trim()) return
    setErro(null)
    setSalvando(true)
    try {
      await aoAdicionar({ carga: Number(carga) || 0, repeticoes: repeticoes.trim() })
      setCarga('')
      setRepeticoes('')
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível lançar a série.'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-2 rounded-2xl border border-borda bg-superficie-2 p-3">
      {series.length > 0 && (
        <ul className="space-y-1">
          {series.map((serie) => (
            <li
              key={serie.id}
              className="flex items-center justify-between gap-2 text-sm tabular-nums"
            >
              <span>{formatarSerieRealizada(Number(serie.carga), serie.repeticoes)}</span>
              <button
                type="button"
                onClick={() => aoRemover(serie.id)}
                aria-label="Remover este lançamento"
                className="rounded-lg p-1 text-texto-suave transition-colors hover:text-perigo"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <form onSubmit={adicionar} className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Campo
            rotulo="Carga (kg)"
            type="number"
            inputMode="numeric"
            min={0}
            value={carga}
            onChange={(e) => setCarga(e.target.value)}
          />
          <Campo
            rotulo="Repetições"
            value={repeticoes}
            onChange={(e) => setRepeticoes(e.target.value)}
          />
        </div>
        <Botao
          type="submit"
          tamanho="sm"
          carregando={salvando}
          disabled={!repeticoes.trim()}
          className="w-full"
        >
          Adicionar
        </Botao>
      </form>
    </div>
  )
}
```

Adicionar `SessaoSerie` e `formatarSerieRealizada` aos imports do topo do arquivo (o import de tipos
e o de `../../lib/formato` já existem — só entram os nomes novos):

```tsx
import {
  contar,
  descreverSerie,
  formatarCronometro,
  formatarData,
  formatarDuracao,
  formatarSerieRealizada,
  rotularBloco,
  tempoRelativo,
} from '../../lib/formato'
```

```tsx
import type {
  ExercicioDoTreino,
  PedidoProprio,
  SessaoCompleta,
  SessaoExercicio,
  SessaoSerie,
  TreinoCompleto,
} from '../../types'
```

- [ ] **Passo 4: rodar e confirmar que passam**

```bash
npx vitest run src/pages/aluno/MeuTreino.test.tsx
```

Esperado: toda a suíte do arquivo verde, incluindo os testes da Parte 1 que já existiam — a
reescrita de `LinhaExecucao` não pode quebrá-los.

- [ ] **Passo 5: type-check, lint e suíte inteira**

```bash
npx tsc --noEmit
npx eslint . --report-unused-disable-directives --max-warnings 0
npx vitest run
```

- [ ] **Passo 6: commit**

```bash
git add frontend/src/pages/aluno/MeuTreino.tsx frontend/src/pages/aluno/MeuTreino.test.tsx
git commit -m "lanca e remove serie realizada na execucao do treino"
```

---

## Tarefa 9: observação e calorias ao finalizar

**Arquivos:**
- Modificar: `frontend/src/pages/aluno/MeuTreino.tsx`
- Modificar: `frontend/src/pages/aluno/MeuTreino.test.tsx`

**Interfaces consumidas:** `finalizarSessao` aceitando corpo (Tarefa 5).

- [ ] **Passo 1: escrever os testes**

Adicionar ao describe de descartar (ou um novo describe logo depois dele) em
`frontend/src/pages/aluno/MeuTreino.test.tsx`:

```ts
describe('MeuTreino — observação e calorias ao finalizar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    responder({ '/alunos/treino/sessao': SESSAO_ATIVA })
    post.mockResolvedValue({
      data: { sessao: SESSAO_ATIVA.sessao, exercicios: SESSAO_ATIVA.exercicios },
    } as never)
  })

  it('finaliza com observação e calorias preenchidas', async () => {
    const usuario = userEvent.setup()
    renderizar(<MeuTreino />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: /finalizar treino/i }))
    await usuario.type(await screen.findByLabelText(/observação/i), 'rendeu pouco')
    await usuario.type(screen.getByLabelText(/calorias/i), '350')
    await usuario.click(screen.getByRole('button', { name: /finalizar e salvar/i }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/alunos/treino/sessao/finalizar', {
        observacao: 'rendeu pouco',
        calorias: 350,
      })
    })
  })

  it('finaliza sem observação nem calorias manda corpo vazio', async () => {
    const usuario = userEvent.setup()
    renderizar(<MeuTreino />, { usuario: ALUNO })

    await usuario.click(await screen.findByRole('button', { name: /finalizar treino/i }))
    await usuario.click(await screen.findByRole('button', { name: /finalizar e salvar/i }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/alunos/treino/sessao/finalizar', {})
    })
  })
})
```

- [ ] **Passo 2: rodar e confirmar que falham**

```bash
cd frontend && npx vitest run src/pages/aluno/MeuTreino.test.tsx -t "observação e calorias"
```

Esperado: FAIL — não existem os campos "Observação"/"Calorias" no painel, e `finalizar()` ainda
chama `POST .../finalizar` sem corpo nenhum.

- [ ] **Passo 3: implementar**

Em `ModoExecucao`, adicionar os dois estados novos, junto com os outros `useState`:

```tsx
const [observacaoFinal, setObservacaoFinal] = useState('')
const [caloriasFinal, setCaloriasFinal] = useState('')
```

Trocar `finalizar()`:

```tsx
async function finalizar() {
  setConfirmarFim(false)
  setFinalizando(true)
  try {
    const corpo: { observacao?: string; calorias?: number } = {}
    if (observacaoFinal.trim()) corpo.observacao = observacaoFinal.trim()
    if (caloriasFinal.trim()) corpo.calorias = Number(caloriasFinal)
    const { data } = await api.post<SessaoCompleta>('/alunos/treino/sessao/finalizar', corpo)
    setResumo(data)
  } catch (e) {
    setErro(mensagemDeErro(e, 'Não foi possível finalizar.'))
    setFinalizando(false)
  }
}
```

No `Painel` de `confirmarFim`, adicionar os dois campos logo depois do bloco
`{feitos < total && (...)}` e antes do parágrafo "Descartar apaga esta sessão...":

```tsx
<AreaTexto
  rotulo="Observação (opcional)"
  rows={3}
  value={observacaoFinal}
  onChange={(e) => setObservacaoFinal(e.target.value)}
  placeholder="Ex: hoje rendeu pouco, dor no ombro..."
/>
<Campo
  rotulo="Calorias gastas (opcional)"
  type="number"
  inputMode="numeric"
  min={0}
  value={caloriasFinal}
  onChange={(e) => setCaloriasFinal(e.target.value)}
/>
```

- [ ] **Passo 4: rodar e confirmar que passam**

```bash
npx vitest run src/pages/aluno/MeuTreino.test.tsx
```

- [ ] **Passo 5: type-check, lint e suíte inteira**

```bash
npx tsc --noEmit
npx eslint . --report-unused-disable-directives --max-warnings 0
npx vitest run
```

- [ ] **Passo 6: commit**

```bash
git add frontend/src/pages/aluno/MeuTreino.tsx frontend/src/pages/aluno/MeuTreino.test.tsx
git commit -m "adiciona observacao e calorias opcionais ao finalizar treino"
```

---

## Tarefa 10: séries, ordem, tempo, observação e calorias no histórico

Ao fim, o detalhe de uma sessão no histórico mostra a observação e as calorias da sessão, as séries
lançadas por exercício, e um selo de ordem real + tempo desde o exercício concluído anterior — sem
mudar a ordem visual da lista, que continua a do bloco prescrito.

**Arquivos:**
- Modificar: `frontend/src/pages/aluno/Historico.tsx`
- Criar: `frontend/src/pages/aluno/Historico.test.tsx`

**Interfaces consumidas:** `SessaoSerie`, `Sessao.observacao`/`calorias`, `formatarSerieRealizada`
(Tarefa 7).

- [ ] **Passo 1: escrever o teste**

Criar `frontend/src/pages/aluno/Historico.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ALUNO, renderizar } from '../../test/utils'

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  mensagemDeErro: (_erro: unknown, padrao = 'Algo deu errado. Tente de novo.') => padrao,
  registrarExpiracaoDeSessao: vi.fn(),
  tokenArmazenado: { ler: () => null, gravar: vi.fn(), limpar: vi.fn() },
}))

import { api } from '../../lib/api'
import Historico from './Historico'

const get = vi.mocked(api.get)

const LISTA = [
  {
    id_sessao: 1,
    iniciado_em: '2026-08-27T10:00:00Z',
    finalizado_em: '2026-08-27T10:30:00Z',
    duracao_segundos: 1800,
    nome_professor: 'Cristhian Cintra',
    bloco_letra: 'A',
    bloco_nome: 'Peito e Tríceps',
    total_exercicios: 2,
    concluidos: 2,
  },
]

const DETALHE = {
  sessao: {
    id_sessao: 1,
    id_treino: 1,
    id_bloco: 1,
    id_aluno: 2,
    iniciado_em: '2026-08-27T10:00:00Z',
    finalizado_em: '2026-08-27T10:30:00Z',
    duracao_segundos: 1800,
    nome_professor: 'Cristhian Cintra',
    bloco_letra: 'A',
    bloco_nome: 'Peito e Tríceps',
    observacao: 'hoje rendeu pouco',
    calorias: 350,
  },
  exercicios: [
    {
      id: 1,
      concluido: true,
      concluido_em: '2026-08-27T10:05:00Z',
      id_ex_usuario: 1,
      numero_serie: 4,
      repeticoes: '10',
      carga: 20,
      observacao_ex_usuario: null,
      nome_exercicio: 'SUPINO SENTADO',
      tipo: 'PEITO',
      series: [{ id: 1, carga: 20, repeticoes: '10', criado_em: '2026-08-27T10:05:00Z' }],
    },
    {
      id: 2,
      concluido: true,
      concluido_em: '2026-08-27T10:15:00Z',
      id_ex_usuario: 2,
      numero_serie: 3,
      repeticoes: '12',
      carga: 12,
      observacao_ex_usuario: null,
      nome_exercicio: 'CROSS OVER (CRUCIFIXO)',
      tipo: 'PEITO',
      series: [],
    },
  ],
}

function responder() {
  get.mockImplementation((url: string) => {
    if (url === '/alunos/sessoes') return Promise.resolve({ data: LISTA } as never)
    if (url === '/alunos/sessoes/1') return Promise.resolve({ data: DETALHE } as never)
    return Promise.resolve({ data: [] } as never)
  })
}

describe('Historico — detalhe da sessão', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    responder()
  })

  it('mostra observação e calorias da sessão', async () => {
    const usuario = userEvent.setup()
    renderizar(<Historico />, { usuario: ALUNO })

    await usuario.click(await screen.findByText(/27 de ago/i))

    expect(await screen.findByText('“hoje rendeu pouco”')).toBeInTheDocument()
    expect(screen.getByText(/350 kcal/i)).toBeInTheDocument()
  })

  it('mostra as séries lançadas por exercício', async () => {
    const usuario = userEvent.setup()
    renderizar(<Historico />, { usuario: ALUNO })

    await usuario.click(await screen.findByText(/27 de ago/i))

    expect(await screen.findByText('20kg×10')).toBeInTheDocument()
  })

  it('mostra a ordem real de execução e o tempo desde o exercício anterior', async () => {
    const usuario = userEvent.setup()
    renderizar(<Historico />, { usuario: ALUNO })

    await usuario.click(await screen.findByText(/27 de ago/i))

    // 1º exercício: 5 min depois do início; 2º: 10 min depois do 1º
    expect(await screen.findByText('1º')).toBeInTheDocument()
    expect(screen.getByText('5 min')).toBeInTheDocument()
    expect(screen.getByText('2º')).toBeInTheDocument()
    expect(screen.getByText('10 min')).toBeInTheDocument()
  })
})
```

- [ ] **Passo 2: rodar e confirmar que falha**

```bash
cd frontend && npx vitest run src/pages/aluno/Historico.test.tsx
```

Esperado: FAIL nos três testes — nada disso é exibido ainda.

- [ ] **Passo 3: implementar**

Em `frontend/src/pages/aluno/Historico.tsx`, trocar o import de tipos:

```tsx
import type { ItemHistoricoSessao, SessaoCompleta, SessaoExercicio } from '../../types'
```

Adicionar `formatarSerieRealizada` ao import de `../../lib/formato`.

Adicionar, antes de `function DetalheSessao`:

```tsx
/**
 * Ordem real de execução e tempo gasto em cada exercício concluído, a partir
 * de concluido_em — sem mudar a ordem em que os exercícios aparecem na tela,
 * que continua a do bloco prescrito.
 */
function calcularOrdemETempo(exercicios: SessaoExercicio[], iniciadoEm: string) {
  const concluidos = exercicios
    .filter((e) => e.concluido && e.concluido_em)
    .sort((a, b) => new Date(a.concluido_em!).getTime() - new Date(b.concluido_em!).getTime())

  const mapa = new Map<number, { ordem: number; segundos: number }>()
  let anterior = new Date(iniciadoEm).getTime()
  concluidos.forEach((exercicio, indice) => {
    const agora = new Date(exercicio.concluido_em!).getTime()
    mapa.set(exercicio.id, {
      ordem: indice + 1,
      segundos: Math.max(0, Math.round((agora - anterior) / 1000)),
    })
    anterior = agora
  })
  return mapa
}
```

Trocar `DetalheSessao`:

```tsx
function DetalheSessao({ id, aoFechar }: { id: number | null; aoFechar: () => void }) {
  const detalhe = useRequisicao<SessaoCompleta | null>(
    () => (id ? api.get<SessaoCompleta>(`/alunos/sessoes/${id}`).then((r) => r.data) : Promise.resolve(null)),
    [id],
  )

  const ordemETempo = detalhe.dados
    ? calcularOrdemETempo(detalhe.dados.exercicios, detalhe.dados.sessao.iniciado_em)
    : new Map<number, { ordem: number; segundos: number }>()

  return (
    <Painel aberto={id !== null} aoFechar={aoFechar} titulo="Detalhe do treino">
      {detalhe.carregando ? (
        <Carregando />
      ) : detalhe.dados ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-texto-suave">
            <Timer className="size-4" aria-hidden />
            <span className="tabular-nums">
              {formatarDuracao(detalhe.dados.sessao.duracao_segundos)}
            </span>
            <span aria-hidden>·</span>
            <span>{formatarDataHora(detalhe.dados.sessao.iniciado_em)}</span>
            <span aria-hidden>·</span>
            <span>{tempoRelativo(detalhe.dados.sessao.iniciado_em)}</span>
          </div>

          {detalhe.dados.sessao.observacao && (
            <p className="text-sm text-texto-suave">“{detalhe.dados.sessao.observacao}”</p>
          )}
          {detalhe.dados.sessao.calorias != null && (
            <p className="text-sm text-texto-suave">{detalhe.dados.sessao.calorias} kcal</p>
          )}

          <ul className="space-y-2">
            {detalhe.dados.exercicios.map((exercicio) => {
              const linha = descreverSerie(
                exercicio.numero_serie,
                exercicio.repeticoes,
                exercicio.carga,
              )
              const info = ordemETempo.get(exercicio.id)

              return (
                <li
                  key={exercicio.id}
                  className="flex items-start gap-3 rounded-xl border border-borda p-3"
                >
                  <span
                    className={cn(
                      'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full',
                      exercicio.concluido
                        ? 'bg-acento text-sobre-acento'
                        : 'bg-superficie-2 text-texto-suave',
                    )}
                    aria-hidden
                  >
                    {exercicio.concluido ? (
                      <Check className="size-3" strokeWidth={3} />
                    ) : (
                      <X className="size-3" strokeWidth={3} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-sm font-medium',
                        !exercicio.concluido && 'text-texto-suave',
                      )}
                    >
                      {exercicio.nome_exercicio}
                    </span>
                    {linha && (
                      <span className="block text-xs tabular-nums text-texto-suave">{linha}</span>
                    )}
                    {exercicio.series.length > 0 && (
                      <span className="block text-xs tabular-nums text-texto-suave">
                        {exercicio.series
                          .map((serie) => formatarSerieRealizada(Number(serie.carga), serie.repeticoes))
                          .join(' · ')}
                      </span>
                    )}
                    {info && (
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-texto-suave">
                        <span>{info.ordem}º</span>
                        <span aria-hidden>·</span>
                        <span>{formatarDuracao(info.segundos)}</span>
                      </span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </Painel>
  )
}
```

- [ ] **Passo 4: rodar e confirmar que passa**

```bash
npx vitest run src/pages/aluno/Historico.test.tsx
```

- [ ] **Passo 5: type-check, lint e suíte inteira**

```bash
npx tsc --noEmit
npx eslint . --report-unused-disable-directives --max-warnings 0
npx vitest run
```

- [ ] **Passo 6: commit**

```bash
git add frontend/src/pages/aluno/Historico.tsx frontend/src/pages/aluno/Historico.test.tsx
git commit -m "mostra series, ordem, tempo, observacao e calorias no detalhe do historico"
```

---

## Depois das dez tarefas

- Gerar o APK (`npm run apk` dentro de `frontend/`) e conferir de ponta a ponta no emulador: lançar
  série durante a execução, remover um lançamento, finalizar com observação/calorias, abrir o
  detalhe no histórico e ver os três.
- **Lembrar `adb uninstall` antes de `adb install`** ao testar a correção — `-r` sozinho mantém o
  cache do Service Worker e o JS antigo continua rodando mesmo com o APK reconstruído (achado da
  sessão de 26-27/08, documentado em `Brain: gym_sys-teste-campo-1-melhorias.md`).
- Marcar o item 2 do backlog (`Brain: gym_sys-teste-campo-1-melhorias.md`) como concluído.
