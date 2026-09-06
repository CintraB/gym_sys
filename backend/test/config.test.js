import test from "node:test";
import assert from "node:assert/strict";
import { carregarConfig } from "../src/config/env.js";

// carregarConfig() le process.env a cada chamada — nada e capturado no topo do
// modulo. E o que permite variar as variaveis daqui de dentro.
//
// As obrigatorias precisam existir antes da primeira chamada, senao o fail-fast
// dispara e o teste falha por outro motivo. O `??=` respeita o backend/.env
// desta maquina, que o `import "dotenv/config"` do env.js ja carregou.
process.env.DB_USER ??= "teste";
process.env.DB_HOST ??= "localhost";
process.env.DB_NAME ??= "teste";
process.env.DB_PASSWORD ??= "teste";
process.env.DB_PORT ??= "5432";
process.env.TOKEN_SEG ??= "segredo-de-teste-nao-usar-em-producao";

/** Restaura a variavel ao valor que tinha antes do teste mexer nela. */
function preservar(t, nome) {
  const original = process.env[nome];
  t.after(() => {
    if (original === undefined) delete process.env[nome];
    else process.env[nome] = original;
  });
}

test("DB_SSL ausente ou 'false' deixa a conexão sem SSL", (t) => {
  // Postgres local em container não tem certificado; ligar SSL por padrão
  // quebraria o desenvolvimento de todo mundo.
  preservar(t, "DB_SSL");

  delete process.env.DB_SSL;
  assert.equal(carregarConfig().db.ssl, false);

  process.env.DB_SSL = "";
  assert.equal(carregarConfig().db.ssl, false);

  process.env.DB_SSL = "false";
  assert.equal(carregarConfig().db.ssl, false);
});

test("DB_SSL=true exige certificado válido", (t) => {
  preservar(t, "DB_SSL");

  process.env.DB_SSL = "true";
  assert.deepEqual(carregarConfig().db.ssl, { rejectUnauthorized: true });
});

test("o teto do pool tem padrão e é ajustável", (t) => {
  preservar(t, "DB_POOL_MAX");

  delete process.env.DB_POOL_MAX;
  assert.equal(carregarConfig().db.max, 10);

  process.env.DB_POOL_MAX = "6";
  assert.equal(carregarConfig().db.max, 6);
});

test("DB_SSL e DB_POOL_MAX não entram na lista de obrigatórias", (t) => {
  // As duas tem padrao. Torna-las obrigatorias quebraria todo .env existente,
  // inclusive o do container local.
  preservar(t, "DB_SSL");
  preservar(t, "DB_POOL_MAX");

  delete process.env.DB_SSL;
  delete process.env.DB_POOL_MAX;

  assert.doesNotThrow(() => carregarConfig());
});
