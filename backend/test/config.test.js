import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { X509Certificate } from "node:crypto";
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
  assert.equal(carregarConfig().db.ssl.rejectUnauthorized, true);
});

test("DB_SSL=true carrega a CA junto, e não só liga a verificação", (t) => {
  // Este teste existe por causa de um erro real: a primeira versao desta
  // config devolvia `{ rejectUnauthorized: true }` sem `ca`, passava nos
  // testes e nao fechava uma conexao com o Supabase — a raiz deles nao esta na
  // loja do Node, e o `pg` estourava SELF_SIGNED_CERT_IN_CHAIN. Verificacao
  // ligada sem ancora de confianca nao verifica nada; recusa tudo.
  preservar(t, "DB_SSL");
  preservar(t, "DB_SSL_CA");

  process.env.DB_SSL = "true";
  delete process.env.DB_SSL_CA;

  assert.match(carregarConfig().db.ssl.ca, /^-----BEGIN CERTIFICATE-----/);
});

test("a CA embutida é a raiz do Supabase, e não um arquivo qualquer", (t) => {
  preservar(t, "DB_SSL");
  preservar(t, "DB_SSL_CA");

  process.env.DB_SSL = "true";
  delete process.env.DB_SSL_CA;

  const cert = new X509Certificate(carregarConfig().db.ssl.ca);
  assert.match(cert.subject, /CN=Supabase Root 2021 CA/);
  assert.ok(cert.ca, "o arquivo precisa ser um certificado de CA");

  // Vencida, a verificacao passa a recusar toda conexao em producao — e nada
  // nos testes contaria. Quando esta asserçao quebrar, baixe a CA nova em
  // Settings -> Database -> SSL Configuration e substitua o arquivo.
  assert.ok(new Date(cert.validTo) > new Date(), "a CA do Supabase venceu");
});

test("DB_SSL_CA aponta outra CA, para quem não usa Supabase", (t) => {
  preservar(t, "DB_SSL");
  preservar(t, "DB_SSL_CA");

  const arquivo = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "gym-ca-")),
    "outra.crt"
  );
  fs.writeFileSync(arquivo, "-----BEGIN CERTIFICATE-----\noutra\n");
  t.after(() => fs.rmSync(path.dirname(arquivo), { recursive: true, force: true }));

  process.env.DB_SSL = "true";
  process.env.DB_SSL_CA = arquivo;

  assert.match(carregarConfig().db.ssl.ca, /outra/);
});

test("DB_SSL_CA inexistente falha na carga, e não em silêncio", (t) => {
  // Cair para "sem ca" seria o pior dos mundos: a config parece certa, e a
  // conexao morre com um erro de TLS que nao fala de arquivo nenhum.
  preservar(t, "DB_SSL");
  preservar(t, "DB_SSL_CA");

  process.env.DB_SSL = "true";
  process.env.DB_SSL_CA = path.join(os.tmpdir(), "nao-existe-mesmo.crt");

  assert.throws(() => carregarConfig(), /DB_SSL_CA/);
});

test("DB_SSL desligado não lê arquivo de CA nenhum", (t) => {
  // O container local nao tem certificado. Se a leitura acontecesse sempre,
  // um DB_SSL_CA quebrado derrubaria quem nem usa TLS.
  preservar(t, "DB_SSL");
  preservar(t, "DB_SSL_CA");

  delete process.env.DB_SSL;
  process.env.DB_SSL_CA = path.join(os.tmpdir(), "nao-existe-mesmo.crt");

  assert.equal(carregarConfig().db.ssl, false);
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
