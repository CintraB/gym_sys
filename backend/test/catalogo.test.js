import test from "node:test";
import assert from "node:assert/strict";
import { criarApiDeTeste, criarProfessorELogar } from "./helpers.js";

async function cenario() {
  const api = await criarApiDeTeste();
  const token = await criarProfessorELogar(api);
  return { api, token };
}

const buscarPorNome = (lista, nome) => lista.filter((e) => e.nome_exercicio === nome);

test("cadastra um exercício e ele passa a aparecer na listagem", async () => {
  const { api, token } = await cenario();
  try {
    const criado = await api.post(
      "/professores/exercicios",
      { nome_exercicio: "PRANCHA LATERAL", tipo: "ABDOMEN" },
      { token }
    );

    assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
    assert.equal(criado.corpo.nome_exercicio, "PRANCHA LATERAL");
    assert.equal(criado.corpo.tipo, "ABDOMEN");
    assert.ok(Number.isInteger(criado.corpo.id_exercicio));

    const lista = await api.get("/professores/exercicios", { token });
    const achados = buscarPorNome(lista.corpo, "PRANCHA LATERAL");
    assert.equal(achados.length, 1);
    assert.equal(achados[0].id_exercicio, criado.corpo.id_exercicio);
  } finally {
    await api.encerrar();
  }
});

test("normaliza nome e grupo: maiúsculas, sem espaço sobrando", async () => {
  const { api, token } = await cenario();
  try {
    const criado = await api.post(
      "/professores/exercicios",
      { nome_exercicio: "  remador   unilateral ", tipo: " costas " },
      { token }
    );

    assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
    assert.equal(criado.corpo.nome_exercicio, "REMADOR UNILATERAL");
    assert.equal(criado.corpo.tipo, "COSTAS");
  } finally {
    await api.encerrar();
  }
});

test("recusa grupo muscular que não existe no catálogo", async () => {
  const { api, token } = await cenario();
  try {
    const resposta = await api.post(
      "/professores/exercicios",
      { nome_exercicio: "AGACHAMENTO SUMÔ", tipo: "GLÚTEO" },
      { token }
    );

    assert.equal(resposta.status, 400);
    assert.match(resposta.corpo.message, /grupo/i);
  } finally {
    await api.encerrar();
  }
});

test("recusa exercício repetido dentro do mesmo grupo", async () => {
  const { api, token } = await cenario();
  try {
    const resposta = await api.post(
      "/professores/exercicios",
      { nome_exercicio: "supino sentado", tipo: "PEITO" },
      { token }
    );

    assert.equal(resposta.status, 409, JSON.stringify(resposta.corpo));
  } finally {
    await api.encerrar();
  }
});

// CROSS OVER existe em BÍCEPS e em TRÍCEPS: o nome é único por grupo, não no
// catálogo inteiro. Um UNIQUE em nome_exercicio quebraria o seed.
test("aceita o mesmo nome em outro grupo muscular", async () => {
  const { api, token } = await cenario();
  try {
    const resposta = await api.post(
      "/professores/exercicios",
      { nome_exercicio: "SUPINO SENTADO", tipo: "COSTAS" },
      { token }
    );

    assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
  } finally {
    await api.encerrar();
  }
});

test("grava a observação quando ela vem preenchida", async () => {
  const { api, token } = await cenario();
  try {
    const criado = await api.post(
      "/professores/exercicios",
      {
        nome_exercicio: "ELEVAÇÃO PÉLVICA",
        tipo: "PERNA",
        observacao: "Apoiar as escápulas no banco",
      },
      { token }
    );

    assert.equal(criado.status, 201, JSON.stringify(criado.corpo));

    const [linha] = api.memoria.public.many(
      `SELECT observacao FROM exercicio WHERE id_exercicio = ${criado.corpo.id_exercicio}`
    );
    assert.equal(linha.observacao, "Apoiar as escápulas no banco");
  } finally {
    await api.encerrar();
  }
});

test("recusa nome vazio", async () => {
  const { api, token } = await cenario();
  try {
    const resposta = await api.post(
      "/professores/exercicios",
      { nome_exercicio: "   ", tipo: "PEITO" },
      { token }
    );

    assert.equal(resposta.status, 400);
    assert.match(resposta.corpo.message, /nome/i);
  } finally {
    await api.encerrar();
  }
});

// VARCHAR(90) no schema: sem checagem na aplicação o Postgres responde 500.
test("recusa nome maior que 90 caracteres", async () => {
  const { api, token } = await cenario();
  try {
    const resposta = await api.post(
      "/professores/exercicios",
      { nome_exercicio: "A".repeat(91), tipo: "PEITO" },
      { token }
    );

    assert.equal(resposta.status, 400);
    assert.match(resposta.corpo.message, /nome/i);
  } finally {
    await api.encerrar();
  }
});

test("recusa observação maior que 255 caracteres", async () => {
  const { api, token } = await cenario();
  try {
    const resposta = await api.post(
      "/professores/exercicios",
      { nome_exercicio: "PULLOVER NA POLIA", tipo: "COSTAS", observacao: "x".repeat(256) },
      { token }
    );

    assert.equal(resposta.status, 400);
    assert.match(resposta.corpo.message, /observa/i);
  } finally {
    await api.encerrar();
  }
});
