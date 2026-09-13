# Sincronização do APK — Leva 2: a identidade

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> caixa (`- [ ]`) para acompanhamento.

**Objetivo:** uma Edge Function que troca CPF + senha por um JWT que as políticas da leva 1
aceitam, com a trava de tentativas que já nasceu no banco — sem tocar em nada do aplicativo e com a
Data API ainda fechada.

**Arquitetura:** a função vive em `supabase/functions/identidade/`, dividida em duas peças: um
**núcleo** sem I/O (`nucleo.ts`), que reproduz o scrypt do backend e decide se o login vale, e uma
**borda** (`index.ts`), que fala HTTP, fala com o Postgres e assina o token. O núcleo é testado em
Node, que executa TypeScript direto; a borda é provada contra a função publicada, por uma suíte à
parte que exige rede. A prova final é a ponte entre as duas levas: o token que a função emite,
usado como claims no container de RLS da leva 1.

**Stack:** Deno (Edge runtime do Supabase), TypeScript, `jose`, `node:crypto`, `node --test`,
Postgres 16.

**Spec:** `docs/superpowers/specs/2026-09-07-sincronizacao-do-apk-design.md`

## Global Constraints

- **Node ≥ 20, ESM em tudo.** Não há CommonJS no projeto. Os testes rodam em **Node 25**, que
  executa `.ts` sem transpilar.
- **Nomes e comentários em pt-BR.** Comentário explica **por quê**, não o quê.
- **Um commit por tarefa**, direto na `main`, sem push. Mensagem em pt-BR sem acento no corpo, e
  **sem `Co-Authored-By`** — só o Cristhian assina os commits deste repositório.
- **Nunca usar `sed -i`** em arquivo-fonte nesta máquina, e não mandar texto acentuado por `curl`
  no Git Bash. Para escrever arquivo com acento, usar a ferramenta de escrita ou um script Node.
- **A suíte atual não pode mudar de resultado:** 259 no backend (nos dois bancos), 264 no front,
  53 em `npm run test:rls`. Suíte nova entra em script próprio, nunca no `npm test`.
- **`node --test` precisa de caminho em glob** (`"test-x/*.test.js"`): no Node 25 passar diretório
  falha, e a descoberta recursiva sem caminho varre o projeto inteiro.
- **A Data API continua fechada.** Abri-la é a leva 3. Esta leva não a toca.
- **Nada de `frontend/src/local/` muda.** O APK instalado continua o de hoje.

## O que esta máquina não tem, e o que isso decide

Nem o **Supabase CLI** nem o **Deno** estão instalados, e esta leva **não os instala**. Duas
consequências que moldam todas as tarefas:

- **O deploy é pelo MCP** (`mcp__supabase__deploy_edge_function`), que recebe os arquivos como
  texto. Não há `supabase functions deploy`.
- **Não há como rodar a função localmente.** Por isso o código é dividido: o que dá para testar sem
  o runtime (scrypt, regras de recusa, claims) fica no núcleo e é testado em Node; a borda é fina e
  provada contra a função publicada.

Instalar o Deno depois continua possível e não invalida nada — o núcleo roda nos dois.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/functions/identidade/nucleo.ts` (criar) | Sem I/O: scrypt igual ao do backend, regra de recusa, claims do token |
| `supabase/functions/identidade/index.ts` (criar) | HTTP, Postgres, assinatura do JWT. Fina de propósito |
| `backend/test-identidade/nucleo.test.js` (criar) | O núcleo, em Node. Roda offline, sem rede nem banco |
| `backend/test-identidade/publicada.test.js` (criar) | A função publicada, por HTTP. Exige rede |
| `backend/test-identidade/ponte.test.js` (criar) | O token real alimentando o container de RLS da leva 1 |
| `backend/test-identidade/ajuda.js` (criar) | URL e chave do projeto, `chamarIdentidade()`, e o pulo de limpar `tentativa_login` entre testes |
| `backend/package.json` (modificar) | Scripts `test:identidade` e `test:identidade:offline` |
| `backend/README.md`, `CLAUDE.md`, `backend/test-identidade/README.md` | Documentação |

**Por que o núcleo fora do `backend/src/`:** ele é código que roda no Deno, e o backend não o
importa. Deixá-lo em `src/lib/` sugeriria que a API o usa — ela tem o seu próprio `senha.js`, que
continua sendo a fonte da verdade. O teste cruzado da Tarefa 2 é o que impede os dois de
divergirem.

**Por que o núcleo não importa `jose`:** ele só usa `node:crypto`, que o Deno e o Node têm. Assim o
teste em Node o importa por caminho relativo, de fora do `backend/`, sem precisar resolver
dependência nenhuma. A assinatura do JWT, que precisa do `jose`, fica na borda.

---

### Tarefa 1: O spike — de onde sai a chave que assina

**Arquivos:**
- Criar: `supabase/functions/identidade/index.ts` (primeira versão, só diagnóstico)

**Interfaces:**
- Produz: a resposta de duas perguntas que decidem a Tarefa 3, e a função `identidade` já publicada
  e alcançável.

**Por que isto é uma tarefa, e por que dentro da própria função:** o Supabase injeta
`SUPABASE_JWKS` em toda Edge Function, e o segredo legado HS256 do projeto — o mesmo que assina a
`anon` key — **pode** estar ali como chave simétrica. Se estiver, a função assina sem nenhuma
configuração. Se não estiver, o Cristhian precisa cadastrar o segredo como secret no painel, e isso
é passo humano que o plano tem de prever. Não dá para saber lendo documentação: é preciso olhar.

O spike mora **dentro da função de identidade**, e não numa função descartável, porque **o MCP não
tem ferramenta para apagar Edge Function** — só o painel. Uma função descartável viraria lixo
dependendo dele, como aconteceu com `teste-scrypt-descartavel` em 07/09. As tarefas seguintes
substituem o corpo desta mesma função.

- [ ] **Passo 1: escrever a versão de diagnóstico**

`supabase/functions/identidade/index.ts`:

```ts
// Primeira versao: so diagnostico. As tarefas seguintes substituem este corpo
// pela funcao de identidade de verdade.
//
// Duas perguntas, e nenhuma se responde lendo documentacao:
//
// 1. O SUPABASE_JWKS injetado traz a chave simetrica do segredo legado (a que
//    assina a anon key deste projeto)? Se sim, a funcao assina sem configurar
//    nada. Se nao, o segredo precisa virar secret no painel.
// 2. O SUPABASE_DB_URL conecta, e a conexao alcanca `registrar_tentativa`, que
//    e SECURITY DEFINER e nao foi concedida a ninguem?
//
// NUNCA responder o material da chave -- so a FORMA dela. Um segredo que sai
// numa resposta HTTP esta vazado, mesmo que so eu leia.
import postgres from "npm:postgres@3.4.4";

Deno.serve(async () => {
  const diagnostico: Record<string, unknown> = {};

  const bruto = Deno.env.get("SUPABASE_JWKS");
  diagnostico.jwks_presente = Boolean(bruto);
  if (bruto) {
    try {
      const jwks = JSON.parse(bruto);
      const chaves = Array.isArray(jwks?.keys) ? jwks.keys : [];
      diagnostico.jwks_chaves = chaves.map((chave: Record<string, unknown>) => ({
        kty: chave.kty,
        alg: chave.alg,
        kid: typeof chave.kid === "string" ? `${chave.kid.slice(0, 4)}...` : null,
        // `k` e o material da chave simetrica. So dizemos SE existe e o
        // tamanho -- nunca o valor.
        tem_k: typeof chave.k === "string",
        tamanho_k: typeof chave.k === "string" ? chave.k.length : 0,
      }));
    } catch (erro) {
      diagnostico.jwks_erro = String(erro);
    }
  }

  const url = Deno.env.get("SUPABASE_DB_URL");
  diagnostico.db_url_presente = Boolean(url);
  if (url) {
    // A porta diz qual caminho o Supabase entregou: 5432 e conexao direta,
    // 6543 e o pooler em modo transacao. Muda o que a borda pode fazer.
    diagnostico.db_porta = new URL(url).port;
    const sql = postgres(url, { prepare: false, max: 1 });
    try {
      const [linha] = await sql`SELECT current_user AS papel, version() AS versao`;
      diagnostico.db_papel = linha.papel;
      diagnostico.db_ok = true;

      const [conta] = await sql`SELECT count(*)::int AS total FROM usuario`;
      diagnostico.usuarios_visiveis = conta.total;

      // A funcao da leva 1: SECURITY DEFINER, sem GRANT para ninguem. Se o
      // papel da conexao nao for o dono, isto falha -- e e melhor descobrir
      // agora do que na Tarefa 3.
      const [tentativa] = await sql`SELECT registrar_tentativa('00000000000', TRUE) AS falhas`;
      diagnostico.registrar_tentativa_ok = tentativa.falhas === 0;
    } catch (erro) {
      diagnostico.db_ok = false;
      diagnostico.db_erro = String(erro);
    } finally {
      await sql.end();
    }
  }

  return new Response(JSON.stringify(diagnostico, null, 2), {
    headers: { "content-type": "application/json" },
  });
});
```

- [ ] **Passo 2: publicar**

Pelo MCP, com `mcp__supabase__deploy_edge_function`:

```
name: identidade
verify_jwt: false
files: [{ name: "index.ts", content: <o arquivo acima> }]
```

`verify_jwt: false` desde já: a função é quem **emite** token, então exigir um para entrar nela
seria circular. A proteção dela é a `apikey`, a trava de tentativas e nunca dizer se o erro foi CPF
ou senha.

- [ ] **Passo 3: chamar e ler a resposta**

Pegar a URL com `mcp__supabase__get_project_url` e a chave com
`mcp__supabase__get_publishable_keys` (usar a **publishable**, `sb_publishable_...`).

```bash
curl -s -X POST "<URL>/functions/v1/identidade" \
  -H "apikey: <chave publishable>" \
  -H "content-type: application/json" -d '{}'
```

- [ ] **Passo 4: registrar a decisão no próprio plano**

Escrever a resposta aqui embaixo, nesta caixa, antes de seguir. A Tarefa 3 lê daqui.

> **Resultado do spike — rodado em 13/09/2026:**
>
> - `SUPABASE_JWKS` traz chave com `kty: "oct"`? **NÃO.** Uma chave só, e assimétrica:
>   `{ kty: "EC", alg: "ES256", tem_k: false }`. O projeto já migrou para chaves de assinatura
>   assimétricas, e o que a função recebe é a **pública** — serve para verificar, nunca para
>   assinar.
> - Uma segunda sonda listou os **nomes** de todas as variáveis injetadas (nunca os valores):
>   `DENO_DEPLOYMENT_ID`, `DENO_REGION`, `SB_EXECUTION_ID`, `SB_REGION`, `SUPABASE_ANON_KEY`,
>   `SUPABASE_DB_URL`, `SUPABASE_FUNCTION_SLUG`, `SUPABASE_JWKS`, `SUPABASE_PUBLISHABLE_KEYS`,
>   `SUPABASE_SECRET_KEYS`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`. **Não há segredo de
>   assinatura entre elas.**
> - **Portanto, o passo humano é obrigatório:** o Cristhian cadastra, no painel do projeto, em
>   *Edge Functions → Secrets*, o secret `JWT_SEGREDO` com o valor do *legacy JWT secret*
>   (*Project Settings → API Keys → JWT Settings → JWT Secret*). A Tarefa 3 não roda sem isso.
> - `db_papel` = **postgres** (dono das tabelas, ignora RLS — é o que permite ler a coluna `senha`),
>   `db_porta` = **5432** (conexão direta, não o pooler), `registrar_tentativa_ok` = **true**
>   (a função `SECURITY DEFINER` da leva 1 responde), `usuarios_visiveis` = 3.
>
> **Risco que fica aberto até a leva 3:** o legacy HS256 continuar sendo aceito pelo PostgREST
> agora que a chave corrente é ES256. A evidência a favor é que a `anon` key legada — que é um JWT
> HS256 assinado com esse mesmo segredo — segue ativa (`disabled: false`). A prova definitiva só
> vem quando a Data API abrir, na leva 3; a ponte da Tarefa 5 prova o formato das claims contra as
> políticas, que é o que dá para provar agora.

- [ ] **Passo 5: limpar a tentativa que o spike gravou**

O spike chamou `registrar_tentativa('00000000000', TRUE)`, que grava uma linha. Apagar por
`mcp__supabase__execute_sql`:

```sql
DELETE FROM tentativa_login WHERE cpf = '00000000000';
```

- [ ] **Passo 6: commit**

```bash
git add supabase/functions/identidade/index.ts
git commit -m "spike da identidade: de onde sai a chave que assina o token"
```

---

### Tarefa 2: O núcleo — scrypt e a regra de recusa

**Arquivos:**
- Criar: `supabase/functions/identidade/nucleo.ts`
- Criar: `backend/test-identidade/nucleo.test.js`
- Modificar: `backend/package.json` (script `test:identidade:offline`)

**Interfaces:**
- Produz:
  - `normalizarCpf(valor: unknown): string` — só dígitos, string vazia se não der.
  - `verificarSenha(hashArmazenada: string, senhaInformada: string): Promise<boolean>` — o mesmo
    formato `"<sal_hex>:<hash_hex>"` do backend.
  - `avaliarLogin({ usuario, senha, falhas }): Promise<Decisao>` onde
    `Decisao = { ok: true, id: number, cargo: string, perfis: string[] } |
    { ok: false, motivo: "credencial" | "inativo" | "excesso" }`.
  - `montarClaims(id: number, agoraEmSegundos: number): { sub, role, aud, iat, exp }`.
  - `LIMITE_FALHAS = 20`, `VALIDADE_DIAS = 30`.
- Consome: nada. O núcleo não faz I/O — quem busca o usuário e conta as falhas é a borda.

**Por que `avaliarLogin` recebe o usuário pronto:** é o que torna a regra testável sem banco. A
borda faz a consulta; o núcleo decide. Sem essa separação, a única forma de testar a regra seria
contra a função publicada, e um erro de lógica só apareceria depois do deploy.

- [ ] **Passo 1: escrever o teste**

`backend/test-identidade/nucleo.test.js`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { criarHashComSal } from "../src/lib/senha.js";
import {
  LIMITE_FALHAS,
  VALIDADE_DIAS,
  avaliarLogin,
  montarClaims,
  normalizarCpf,
  verificarSenha,
} from "../../supabase/functions/identidade/nucleo.ts";

const usuarioBase = {
  id: 7,
  senha: "",
  ativo: true,
  aluno: true,
  professor: false,
  admin: false,
};

describe("núcleo da identidade", () => {
  it("normaliza o CPF como o backend faz", () => {
    assert.equal(normalizarCpf("111.111.111-11"), "11111111111");
    assert.equal(normalizarCpf(" 22222222222 "), "22222222222");
    assert.equal(normalizarCpf(null), "");
    assert.equal(normalizarCpf(12345678901), "12345678901");
  });

  // O teste que importa desta tarefa: a hash gerada pelo backend confere aqui.
  // Se o scrypt divergir, a conta criada no site não entra pelo app — e não dá
  // erro nenhum, só recusa a senha certa.
  it("confere a hash que o backend gerou", async () => {
    const hash = await criarHashComSal("senha123");
    assert.equal(await verificarSenha(hash, "senha123"), true);
    assert.equal(await verificarSenha(hash, "senha124"), false);
  });

  it("não quebra com hash malformada", async () => {
    assert.equal(await verificarSenha("sem-dois-pontos", "x"), false);
    assert.equal(await verificarSenha("", "x"), false);
    assert.equal(await verificarSenha("ab:cd", "x"), false);
  });

  it("aceita quem acertou a senha", async () => {
    const usuario = { ...usuarioBase, senha: await criarHashComSal("senha123") };
    const decisao = await avaliarLogin({ usuario, senha: "senha123", falhas: 0 });
    assert.equal(decisao.ok, true);
    assert.equal(decisao.id, 7);
    assert.equal(decisao.cargo, "aluno");
    assert.deepEqual(decisao.perfis, ["aluno"]);
  });

  it("recusa senha errada e CPF inexistente com o MESMO motivo", async () => {
    const usuario = { ...usuarioBase, senha: await criarHashComSal("senha123") };
    const comSenhaErrada = await avaliarLogin({ usuario, senha: "errada", falhas: 0 });
    const semUsuario = await avaliarLogin({ usuario: null, senha: "qualquer", falhas: 0 });

    assert.equal(comSenhaErrada.ok, false);
    assert.equal(semUsuario.ok, false);
    assert.equal(
      comSenhaErrada.motivo,
      semUsuario.motivo,
      "motivos diferentes vazam quais CPFs existem",
    );
    assert.equal(comSenhaErrada.motivo, "credencial");
  });

  it("recusa inativo mesmo com a senha certa, como authController:24", async () => {
    const usuario = { ...usuarioBase, ativo: false, senha: await criarHashComSal("senha123") };
    const decisao = await avaliarLogin({ usuario, senha: "senha123", falhas: 0 });
    assert.equal(decisao.ok, false);
    assert.equal(decisao.motivo, "inativo");
  });

  it("recusa por excesso ANTES de olhar a senha", async () => {
    const usuario = { ...usuarioBase, senha: await criarHashComSal("senha123") };
    const decisao = await avaliarLogin({ usuario, senha: "senha123", falhas: LIMITE_FALHAS });
    assert.equal(decisao.ok, false);
    assert.equal(decisao.motivo, "excesso", "com a trava batida nem a senha certa passa");
  });

  it("o cargo segue a precedência admin > professor > aluno", async () => {
    const senha = await criarHashComSal("senha123");
    const casos = [
      [{ aluno: true, professor: true, admin: true }, "admin", ["aluno", "professor", "admin"]],
      [{ aluno: true, professor: true, admin: false }, "professor", ["aluno", "professor"]],
      [{ aluno: true, professor: false, admin: false }, "aluno", ["aluno"]],
    ];
    for (const [perfis, cargo, lista] of casos) {
      const decisao = await avaliarLogin({
        usuario: { ...usuarioBase, ...perfis, senha },
        senha: "senha123",
        falhas: 0,
      });
      assert.equal(decisao.cargo, cargo);
      assert.deepEqual(decisao.perfis, lista);
    }
  });

  it("as claims são as que o RLS da leva 1 lê", () => {
    const agora = 1_760_000_000;
    const claims = montarClaims(7, agora);
    assert.equal(claims.sub, "7", "auth_id_valido() faz cast de sub para INTEGER");
    assert.equal(claims.role, "authenticated", "é a claim que o PostgREST usa no SET ROLE");
    assert.equal(claims.aud, "authenticated");
    assert.equal(claims.iat, agora, "auth_id_valido() compara iat com sessoes_invalidadas_em");
    assert.equal(claims.exp, agora + VALIDADE_DIAS * 24 * 60 * 60);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
cd backend && node --test "test-identidade/nucleo.test.js" --disable-warning=ExperimentalWarning
```

Esperado: FALHA, `Cannot find module .../nucleo.ts`.

- [ ] **Passo 3: escrever o núcleo**

`supabase/functions/identidade/nucleo.ts`:

```ts
/**
 * O que da para provar sem o runtime do Deno: o scrypt, a regra de recusa e as
 * claims. Sem I/O nenhum de proposito -- quem busca o usuario e conta as
 * falhas e a borda, e e isso que deixa a regra testavel em Node.
 *
 * Nao importa `jose` nem nada de fora: so `node:crypto`, que existe nos dois
 * runtimes. E o que permite ao teste importar este arquivo de fora do
 * backend/, sem resolver dependencia nenhuma.
 */
import { scrypt, timingSafeEqual } from "node:crypto";
// Buffer NAO e global no Edge runtime, ao contrario do Node. Foi o que fez a
// primeira versao do spike do scrypt falhar, em 07/09/2026.
import { Buffer } from "node:buffer";

const TAMANHO_HASH = 64;

/** 20 falhas em 15 minutos, o mesmo LIMITE_LOGIN_MAXIMO da API. */
export const LIMITE_FALHAS = 20;

/** 30 dias, contra os 7 do token da API. Decisao dele em 13/09/2026. */
export const VALIDADE_DIAS = 30;

export interface UsuarioDoBanco {
  id: number;
  senha: string;
  ativo: boolean;
  aluno: boolean;
  professor: boolean;
  admin: boolean;
}

export type Decisao =
  | { ok: true; id: number; cargo: string; perfis: string[] }
  | { ok: false; motivo: "credencial" | "inativo" | "excesso" };

export function normalizarCpf(valor: unknown): string {
  if (typeof valor === "number") return String(valor);
  if (typeof valor !== "string") return "";
  return valor.replace(/\D/g, "");
}

function scryptAsync(senha: string, sal: string): Promise<Buffer> {
  return new Promise((resolve, rejeitar) => {
    scrypt(senha, sal, TAMANHO_HASH, (erro, derivada) =>
      erro ? rejeitar(erro) : resolve(derivada as Buffer),
    );
  });
}

/**
 * Mesmo formato do backend: "<sal_hex>:<hash_hex>", com o sal entrando como o
 * TEXTO da string hex -- nao decodificado em bytes. Decodificar da uma hash
 * valida e diferente, e o unico sintoma seria a senha certa sendo recusada.
 */
export async function verificarSenha(
  hashArmazenada: string,
  senhaInformada: string,
): Promise<boolean> {
  if (typeof hashArmazenada !== "string" || typeof senhaInformada !== "string") return false;

  const [sal, hashEsperada] = hashArmazenada.split(":");
  if (!sal || !hashEsperada) return false;

  const calculada = await scryptAsync(senhaInformada, sal);
  const esperada = Buffer.from(hashEsperada, "hex");

  // timingSafeEqual lanca se os tamanhos diferem -- comparar antes evita
  // transformar hash malformada no banco em erro 500.
  if (calculada.length !== esperada.length) return false;
  return timingSafeEqual(calculada, esperada);
}

/** admin > professor > aluno, a mesma precedencia de src/lib/perfil.js. */
function cargoDe(usuario: UsuarioDoBanco): string {
  if (usuario.admin) return "admin";
  if (usuario.professor) return "professor";
  return "aluno";
}

function perfisDe(usuario: UsuarioDoBanco): string[] {
  const lista: string[] = [];
  if (usuario.aluno) lista.push("aluno");
  if (usuario.professor) lista.push("professor");
  if (usuario.admin) lista.push("admin");
  return lista;
}

export async function avaliarLogin({
  usuario,
  senha,
  falhas,
}: {
  usuario: UsuarioDoBanco | null;
  senha: string;
  falhas: number;
}): Promise<Decisao> {
  // A trava vem primeiro: com ela batida, nem a senha certa passa. Conferir a
  // senha antes seria gastar 29 ms de scrypt para recusar do mesmo jeito, e
  // daria ao atacante um oraculo de tempo.
  if (falhas >= LIMITE_FALHAS) return { ok: false, motivo: "excesso" };

  // Mesmo motivo para CPF inexistente e senha errada, como authController:21:
  // nao entrega quais CPFs estao cadastrados.
  if (!usuario || !(await verificarSenha(usuario.senha, senha))) {
    return { ok: false, motivo: "credencial" };
  }
  if (!usuario.ativo) return { ok: false, motivo: "inativo" };

  return { ok: true, id: usuario.id, cargo: cargoDe(usuario), perfis: perfisDe(usuario) };
}

/**
 * As claims que o RLS da leva 1 le. `sub` vai como STRING porque e o que o JWT
 * manda, e `auth_id_valido()` faz o cast para INTEGER do lado do banco.
 */
export function montarClaims(id: number, agoraEmSegundos: number) {
  return {
    sub: String(id),
    role: "authenticated",
    aud: "authenticated",
    iat: agoraEmSegundos,
    exp: agoraEmSegundos + VALIDADE_DIAS * 24 * 60 * 60,
  };
}
```

- [ ] **Passo 4: acrescentar o script e rodar**

Em `backend/package.json`, dentro de `"scripts"`:

```json
"test:identidade:offline": "node --test \"test-identidade/nucleo.test.js\" --disable-warning=ExperimentalWarning"
```

```bash
cd backend && npm run test:identidade:offline
```

Esperado: PASS, 8 testes.

- [ ] **Passo 5: provar que o teste cruzado pega a divergência**

Em `nucleo.ts`, troque `scryptAsync(senhaInformada, sal)` por
`scryptAsync(senhaInformada, Buffer.from(sal, "hex") as unknown as string)` — que é a versão "sal
decodificado em bytes", o erro que o `CLAUDE.md` documenta. O teste **"confere a hash que o backend
gerou" tem de ficar vermelho**. Desfaça.

Depois, troque `falhas >= LIMITE_FALHAS` por `falhas > LIMITE_FALHAS`. O teste "recusa por excesso"
**tem de ficar vermelho**. Desfaça.

- [ ] **Passo 6: conferir que nada regrediu**

```bash
cd backend && npm test
```

Esperado: 259, como antes — a pasta nova não entra no glob do `npm test`.

- [ ] **Passo 7: commit**

```bash
git add supabase/functions/identidade/nucleo.ts backend/test-identidade/nucleo.test.js \
        backend/package.json
git commit -m "nucleo da identidade: scrypt do backend e a regra de recusa"
```

---

### Tarefa 3: A borda — HTTP, banco e assinatura

**Arquivos:**
- Modificar: `supabase/functions/identidade/index.ts` (substitui o diagnóstico da Tarefa 1)

**Interfaces:**
- Consome: tudo o que a Tarefa 2 produz, e o resultado do spike da Tarefa 1.
- Produz: `POST /functions/v1/identidade` com corpo `{ cpf, senha }`, respondendo
  `200 { token, expira_em, usuario: { id, nome, cargo, perfis } }` ou
  `401 { erro: "CPF ou senha incorretos" }` / `403 { erro: "Usuário inativo. Procure a academia." }`
  / `429 { erro: "Muitas tentativas. Tente de novo em alguns minutos." }`.

**O formato espelha o `POST /login` da API de propósito:** na leva 3 o app vai ter os dois
caminhos, e quanto menos os contratos divergirem, menos código de tradução.

- [ ] **Passo 1: escrever a função**

`supabase/functions/identidade/index.ts` — substitui o conteúdo inteiro:

```ts
/**
 * Identidade do APK: CPF + senha -> JWT que as politicas da leva 1 aceitam.
 *
 * Fina de proposito. Tudo o que da para provar sem o runtime mora em
 * `nucleo.ts`, testado em Node; aqui fica so o que precisa do Deno: HTTP,
 * Postgres e a assinatura.
 *
 * `verify_jwt: false` no deploy: e ela que EMITE o token, entao exigir um para
 * entrar seria circular. A protecao e a apikey, a trava de tentativas e nunca
 * dizer se o erro foi o CPF ou a senha.
 */
import postgres from "npm:postgres@3.4.4";
import { SignJWT } from "npm:jose@5.9.6";
import { avaliarLogin, montarClaims, normalizarCpf } from "./nucleo.ts";

const RESPOSTAS = {
  credencial: { status: 401, erro: "CPF ou senha incorretos" },
  inativo: { status: 403, erro: "Usuário inativo. Procure a academia." },
  excesso: { status: 429, erro: "Muitas tentativas. Tente de novo em alguns minutos." },
} as const;

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * A chave que assina, em bytes.
 *
 * O segredo legado HS256 do projeto e o que o PostgREST usa para validar. De
 * onde ele vem foi decidido pelo spike da Tarefa 1 -- ver a caixa de resultado
 * naquele plano. As duas fontes ficam aqui porque a ordem importa: secret
 * cadastrado ganha do JWKS, para dar a ele como trocar a chave sem mexer em
 * codigo.
 */
function chaveQueAssina(): Uint8Array {
  const doSecret = Deno.env.get("JWT_SEGREDO");
  if (doSecret) return new TextEncoder().encode(doSecret);

  const bruto = Deno.env.get("SUPABASE_JWKS");
  if (bruto) {
    const chaves = JSON.parse(bruto)?.keys ?? [];
    const simetrica = chaves.find(
      (chave: Record<string, unknown>) => chave.kty === "oct" && typeof chave.k === "string",
    );
    if (simetrica) {
      // base64url -> bytes. O `k` de um JWK simetrico e o segredo em si.
      const base64 = simetrica.k.replace(/-/g, "+").replace(/_/g, "/");
      return Uint8Array.from(atob(base64), (caractere) => caractere.charCodeAt(0));
    }
  }

  throw new Error("sem chave para assinar: nem JWT_SEGREDO nem chave simetrica no JWKS");
}

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, {
  // prepare: false e obrigatorio quando a conexao passa pelo pooler em modo
  // transacao -- o statement preparado nao sobrevive a troca de conexao.
  prepare: false,
  max: 2,
});

Deno.serve(async (requisicao: Request) => {
  if (requisicao.method !== "POST") return json({ erro: "Método não permitido" }, 405);

  let corpo: { cpf?: unknown; senha?: unknown };
  try {
    corpo = await requisicao.json();
  } catch {
    return json({ erro: "Informe CPF e senha" }, 400);
  }

  const cpf = normalizarCpf(corpo?.cpf);
  const senha = corpo?.senha;
  if (!cpf || typeof senha !== "string" || senha.length === 0) {
    return json({ erro: "Informe CPF e senha" }, 400);
  }

  try {
    // Conta as falhas ANTES de olhar a senha: registrar_tentativa(cpf, FALSE)
    // grava e devolve quantas ha na janela. Registrar a falha primeiro e
    // apaga-la no sucesso e o que faz a trava valer mesmo quando a funcao morre
    // no meio -- o contrario deixaria tentativa sem registro.
    const [contagem] = await sql`SELECT registrar_tentativa(${cpf}, FALSE) AS falhas`;

    const [usuario] = await sql`
      SELECT id, nome, senha, ativo, aluno, professor, admin
        FROM usuario WHERE cpf = ${cpf}`;

    const decisao = await avaliarLogin({
      usuario: usuario ?? null,
      senha,
      // -1 porque a linha recem-gravada e esta tentativa, e nao uma anterior.
      falhas: contagem.falhas - 1,
    });

    if (!decisao.ok) {
      const resposta = RESPOSTAS[decisao.motivo];
      return json({ erro: resposta.erro }, resposta.status);
    }

    // Acertou: apaga as falhas da janela. Quem sabe a senha nao fica de castigo.
    await sql`SELECT registrar_tentativa(${cpf}, TRUE)`;

    const agora = Math.floor(Date.now() / 1000);
    const claims = montarClaims(decisao.id, agora);
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .sign(chaveQueAssina());

    // A hash NUNCA sai daqui. O usuario da resposta e montado campo a campo de
    // proposito: devolver a linha do banco vazaria `senha` no primeiro
    // descuido.
    return json({
      token,
      expira_em: claims.exp,
      usuario: {
        id: decisao.id,
        nome: usuario.nome,
        cargo: decisao.cargo,
        perfis: decisao.perfis,
      },
    });
  } catch (erro) {
    // Detalhe de banco nao vai para o cliente, mesma regra do errorHandler.
    console.error("[identidade]", erro);
    return json({ erro: "Erro ao autenticar" }, 500);
  }
});
```

- [ ] **Passo 2: publicar**

Pelo MCP, `deploy_edge_function`, `name: identidade`, `verify_jwt: false`, com **os dois arquivos**:
`index.ts` e `nucleo.ts`. Esquecer o `nucleo.ts` faz o deploy passar e a função quebrar na primeira
chamada com erro de módulo.

- [ ] **Passo 3: fumaça manual**

```bash
curl -s -X POST "<URL>/functions/v1/identidade" \
  -H "apikey: <chave publishable>" -H "content-type: application/json" \
  -d '{"cpf":"00000000000","senha":"errada"}'
```

Esperado: `401 {"erro":"CPF ou senha incorretos"}`. Depois, limpar a tentativa gravada:
`DELETE FROM tentativa_login WHERE cpf = '00000000000';`

- [ ] **Passo 4: commit**

```bash
git add supabase/functions/identidade/index.ts
git commit -m "funcao de identidade: CPF e senha viram token do PostgREST"
```

---

### Tarefa 4: A suíte contra a função publicada

**Arquivos:**
- Criar: `backend/test-identidade/ajuda.js`
- Criar: `backend/test-identidade/publicada.test.js`
- Modificar: `backend/package.json` (script `test:identidade`)

**Interfaces:**
- Consome: a função da Tarefa 3.
- Produz: `chamarIdentidade({ cpf, senha })` → `{ status, corpo }`, `limparTentativas(cpf)`,
  `comUsuarioDeTeste(dados, callback)` — cria um usuário, roda o teste e **apaga** no fim.
- Produz: `npm run test:identidade`.

**Esta suíte encosta no banco de produção, e é por isso que o usuário de teste é criado e apagado
dentro de cada teste.** Nada de deixar conta de teste para trás: em 07/09 duas contas de teste
precisaram ser desativadas à mão porque o classificador barrou o `DELETE`. Aqui a limpeza usa a
conexão do backend, que é do dono, e roda em `finally`.

- [ ] **Passo 1: escrever o helper**

`backend/test-identidade/ajuda.js`:

```js
/**
 * Infraestrutura da suíte da Edge Function.
 *
 * Ela fala com o projeto de verdade — não há como rodar a função localmente
 * sem o Deno, que esta máquina não tem. Por isso: exige rede, mora em script
 * próprio (`npm run test:identidade`) e nunca entra no `npm test`.
 *
 * Todo dado que ela cria é apagado no `finally` do próprio teste. A conexão é
 * a do backend, que é dona das tabelas e ignora RLS.
 */
import { randomUUID } from "node:crypto";
import { db } from "../src/config/db.js";
import { criarHashComSal } from "../src/lib/senha.js";

export const URL_FUNCAO = `${process.env.SUPABASE_URL}/functions/v1/identidade`;
export const CHAVE = process.env.SUPABASE_CHAVE_PUBLICA;

export function exigirAmbiente() {
  if (!process.env.SUPABASE_URL || !CHAVE) {
    throw new Error(
      "defina SUPABASE_URL e SUPABASE_CHAVE_PUBLICA no backend/.env — ver test-identidade/README.md",
    );
  }
}

export async function chamarIdentidade(corpo) {
  const resposta = await fetch(URL_FUNCAO, {
    method: "POST",
    headers: { apikey: CHAVE, "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return { status: resposta.status, corpo: await resposta.json() };
}

export const limparTentativas = (cpf) =>
  db.query("DELETE FROM tentativa_login WHERE cpf = $1", [cpf]);

/**
 * Cria um usuário de teste, roda o callback e apaga tudo depois.
 *
 * O CPF sai de um contador aleatório para duas execuções simultâneas não
 * brigarem pelo índice único, e por não ser CPF de gente nenhuma.
 */
export async function comUsuarioDeTeste(dados, callback) {
  const cpf = String(90_000_000_000 + Math.floor(Math.random() * 9_000_000_000));
  const senha = dados.senha ?? "teste123";
  const { rows } = await db.query(
    `INSERT INTO usuario (nome, senha, cpf, email, titulo, aluno, professor, admin, ativo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      dados.nome ?? `Teste ${randomUUID().slice(0, 8)}`,
      await criarHashComSal(senha),
      cpf,
      "teste@exemplo.invalido",
      cpf.slice(0, 12).padEnd(12, "0"),
      dados.aluno ?? true,
      dados.professor ?? false,
      dados.admin ?? false,
      dados.ativo ?? true,
    ],
  );

  try {
    return await callback({ id: rows[0].id, cpf, senha });
  } finally {
    await limparTentativas(cpf);
    await db.query("DELETE FROM usuario WHERE id = $1", [rows[0].id]);
  }
}

export const encerrar = () => db.end();
```

- [ ] **Passo 2: escrever o teste**

`backend/test-identidade/publicada.test.js`:

```js
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeJwt } from "jose";
import {
  chamarIdentidade,
  comUsuarioDeTeste,
  encerrar,
  exigirAmbiente,
  limparTentativas,
} from "./ajuda.js";

describe("a função de identidade publicada", () => {
  before(() => exigirAmbiente());
  after(() => encerrar());

  it("emite token para quem acertou a senha", async () => {
    await comUsuarioDeTeste({}, async ({ id, cpf, senha }) => {
      const { status, corpo } = await chamarIdentidade({ cpf, senha });
      assert.equal(status, 200, JSON.stringify(corpo));
      assert.equal(corpo.usuario.id, id);
      assert.equal(corpo.usuario.cargo, "aluno");

      const claims = decodeJwt(corpo.token);
      assert.equal(claims.sub, String(id));
      assert.equal(claims.role, "authenticated");
      assert.ok(claims.exp - claims.iat === 30 * 24 * 60 * 60, "o token vale 30 dias");
    });
  });

  it("aceita CPF com máscara, como o app pode mandar", async () => {
    await comUsuarioDeTeste({}, async ({ cpf, senha }) => {
      const mascarado = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
      const { status } = await chamarIdentidade({ cpf: mascarado, senha });
      assert.equal(status, 200);
    });
  });

  it("a resposta NUNCA traz a hash da senha", async () => {
    await comUsuarioDeTeste({}, async ({ cpf, senha }) => {
      const { corpo } = await chamarIdentidade({ cpf, senha });
      const texto = JSON.stringify(corpo);
      // O formato do banco: 64 hex de sal, dois-pontos, 128 hex de hash.
      // Procurar só por ":" não serviria — todo JSON tem.
      assert.ok(
        !/[0-9a-f]{64}:[0-9a-f]{128}/i.test(texto),
        "hash de senha na resposta da função",
      );
      assert.equal(corpo.usuario.senha, undefined);
    });
  });

  it("senha errada e CPF inexistente respondem a MESMA coisa", async () => {
    const inexistente = await chamarIdentidade({ cpf: "99999999999", senha: "qualquer" });
    await limparTentativas("99999999999");

    const comSenhaErrada = await comUsuarioDeTeste({}, ({ cpf }) =>
      chamarIdentidade({ cpf, senha: "errada" }),
    );

    assert.equal(inexistente.status, 401);
    assert.equal(comSenhaErrada.status, 401);
    assert.deepEqual(
      inexistente.corpo,
      comSenhaErrada.corpo,
      "respostas diferentes entregam quais CPFs existem",
    );
  });

  it("usuário inativo não recebe token, mesmo com a senha certa", async () => {
    await comUsuarioDeTeste({ ativo: false }, async ({ cpf, senha }) => {
      const { status, corpo } = await chamarIdentidade({ cpf, senha });
      assert.equal(status, 403);
      assert.equal(corpo.token, undefined);
    });
  });

  it("corpo sem CPF nem senha é recusado antes de qualquer consulta", async () => {
    const { status } = await chamarIdentidade({});
    assert.equal(status, 400);
  });

  it("o professor recebe o cargo certo", async () => {
    await comUsuarioDeTeste({ aluno: false, professor: true }, async ({ cpf, senha }) => {
      const { corpo } = await chamarIdentidade({ cpf, senha });
      assert.equal(corpo.usuario.cargo, "professor");
      assert.deepEqual(corpo.usuario.perfis, ["professor"]);
    });
  });
});
```

- [ ] **Passo 3: acrescentar o script**

Em `backend/package.json`:

```json
"test:identidade": "node --test --test-concurrency=1 \"test-identidade/*.test.js\" --disable-warning=ExperimentalWarning"
```

`--test-concurrency=1` pelo mesmo motivo da suíte de RLS, e mais um: a trava de tentativas é por
CPF, mas o banco é um só, e testes em paralelo tornam a leitura de `tentativa_login` instável.

- [ ] **Passo 4: rodar**

```bash
cd backend && npm run test:identidade
```

Esperado: PASS. Se der `defina SUPABASE_URL...`, é o `.env` — ver Passo 5.

- [ ] **Passo 5: documentar as duas variáveis**

Em `backend/.env.example`, ao final:

```bash
# Só para `npm run test:identidade`, a suíte da Edge Function. A URL sai do
# painel (Settings → API) e a chave é a publishable (sb_publishable_...), que é
# pública por natureza — ela só identifica o projeto.
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_CHAVE_PUBLICA=sb_publishable_...
```

E acrescentar os valores reais no `backend/.env`, que não é versionado.

- [ ] **Passo 6: provar que a suíte pega o vazamento**

Em `index.ts`, troque o objeto `usuario` da resposta por `usuario` (a linha inteira do banco) e
republique. O teste **"a resposta NUNCA traz a hash da senha" tem de ficar vermelho**. Desfaça e
republique.

- [ ] **Passo 7: commit**

```bash
git add backend/test-identidade/ backend/package.json backend/.env.example
git commit -m "suite da funcao de identidade, contra o projeto de verdade"
```

---

### Tarefa 5: A ponte — o token que a leva 1 aceita

**Arquivos:**
- Criar: `backend/test-identidade/ponte.test.js`

**Interfaces:**
- Consome: `chamarIdentidade` e `comUsuarioDeTeste` da Tarefa 4; `abrirBanco`, `conectarComo` e
  `cenario` de `backend/test-rls/`.

**É o teste que prova a leva inteira.** As Tarefas 2 a 4 provam que a função responde; esta prova
que o que ela responde **serve para alguma coisa** — que as claims do token real abrem exatamente
as portas que as políticas da leva 1 desenharam, e nenhuma outra. Sem ela, as duas levas poderiam
estar cada uma certa e incompatíveis entre si, e isso só apareceria na leva 3, dentro do APK.

**Por que contra o container, e não contra a Data API:** ela continua fechada até a leva 3. O
container roda as mesmas políticas, aplicadas do mesmo arquivo.

- [ ] **Passo 1: escrever o teste**

`backend/test-identidade/ponte.test.js`:

```js
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeJwt } from "jose";
import { abrirBanco, conectarComo } from "../test-rls/ajuda.js";
import { cenario } from "../test-rls/cenario.js";
import { chamarIdentidade, comUsuarioDeTeste, encerrar, exigirAmbiente } from "./ajuda.js";

/**
 * As claims do token REAL, emitido pela função publicada, postas no container
 * da leva 1. É o encontro das duas levas.
 *
 * O id do cenário local não é o mesmo do usuário criado no Supabase, e nem
 * precisa ser: o que se prova aqui é que as claims têm a FORMA que
 * `auth_id_valido()` entende. Por isso o `sub` é trocado pelo id do cenário.
 */
describe("o token da função abre as portas da leva 1", () => {
  let banco;

  before(async () => {
    exigirAmbiente();
    banco = await abrirBanco();
    await banco.aplicar("rls.sql");
    await cenario(banco.pool);
  });
  after(async () => {
    await banco.encerrar();
    await encerrar();
  });

  async function claimsReais() {
    return await comUsuarioDeTeste({}, async ({ cpf, senha }) => {
      const { status, corpo } = await chamarIdentidade({ cpf, senha });
      assert.equal(status, 200, JSON.stringify(corpo));
      return decodeJwt(corpo.token);
    });
  }

  it("as claims emitidas são reconhecidas como identidade", async () => {
    const claims = await claimsReais();
    const cliente = await conectarComo({ ...claims, sub: "1" });
    try {
      const { rows } = await cliente.query("SELECT auth_id_valido() AS id");
      assert.equal(rows[0].id, 1, "o formato das claims não bate com auth_id_valido()");
    } finally {
      await cliente.end();
    }
  });

  it("com o token real, o aluno lê o próprio treino e só ele", async () => {
    const claims = await claimsReais();
    const cliente = await conectarComo({ ...claims, sub: "1" });
    try {
      const { rows } = await cliente.query("SELECT id_treino FROM treino");
      assert.deepEqual(rows.map((l) => l.id_treino), [1]);
    } finally {
      await cliente.end();
    }
  });

  it("o corte de sessão vale para o token real", async () => {
    const claims = await claimsReais();
    // O corte é gravado DEPOIS do token ser emitido, e um segundo à frente
    // para não cair no mesmo segundo do `iat` — token do mesmo segundo vale de
    // propósito, e é o que identidade.test.js prova.
    await banco.pool.query(
      "UPDATE usuario SET sessoes_invalidadas_em = NOW() + INTERVAL '1 second' WHERE id = 1",
    );
    try {
      const cliente = await conectarComo({ ...claims, sub: "1" });
      try {
        const { rows } = await cliente.query("SELECT id FROM usuario");
        assert.equal(rows.length, 0, "token anterior à troca de credencial ainda lia");
      } finally {
        await cliente.end();
      }
    } finally {
      await banco.pool.query("UPDATE usuario SET sessoes_invalidadas_em = NULL WHERE id = 1");
    }
  });

  it("o token não dá acesso ao que não é do dono", async () => {
    const claims = await claimsReais();
    const cliente = await conectarComo({ ...claims, sub: "1" });
    try {
      const { rows } = await cliente.query("SELECT id_sessao, id_aluno FROM sessao_treino");
      assert.ok(
        rows.every((l) => l.id_aluno === 1),
        `vazou sessão de outro aluno: ${JSON.stringify(rows)}`,
      );
    } finally {
      await cliente.end();
    }
  });
});
```

- [ ] **Passo 2: rodar**

```bash
cd backend && npm run rls:up && npm run test:identidade
```

Esperado: PASS, a suíte inteira (publicada + ponte).

- [ ] **Passo 3: provar que a ponte pega a divergência**

Em `nucleo.ts`, troque `role: "authenticated"` por `role: "anon"` em `montarClaims` e republique a
função. Os testes da ponte que leem dados **têm de ficar vermelhos** — as políticas são
`TO authenticated`. Desfaça e republique.

Depois, troque `sub: String(id)` por `sub: id` (número em vez de texto). Rode: o comportamento de
`auth.jwt() ->> 'sub'` com número **não** quebra, e é por isso que o teste de formato existe — se
tudo continuar verde, anote no plano que o cast tolera os dois. Desfaça de qualquer forma: o JWT
manda `sub` como string, e divergir do padrão não traz nada.

- [ ] **Passo 4: commit**

```bash
git add backend/test-identidade/ponte.test.js
git commit -m "ponte: o token da funcao abre exatamente as portas da leva 1"
```

---

### Tarefa 6: A trava de tentativas ponta a ponta

**Arquivos:**
- Criar: `backend/test-identidade/tentativas.test.js`

**Interfaces:**
- Consome: `chamarIdentidade`, `comUsuarioDeTeste`, `limparTentativas` da Tarefa 4.

**Por que uma tarefa própria:** a trava é a única defesa da porta nova contra força bruta — a Edge
Function não tem o `express-rate-limit` da API. `tentativas.test.js` da leva 1 prova a função SQL;
este prova que a **função HTTP realmente a usa**, que é outra coisa. Uma borda que esquecesse de
chamar `registrar_tentativa` passaria em todos os testes das tarefas anteriores.

- [ ] **Passo 1: escrever o teste**

`backend/test-identidade/tentativas.test.js`:

```js
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/config/db.js";
import { chamarIdentidade, comUsuarioDeTeste, encerrar, exigirAmbiente } from "./ajuda.js";

const LIMITE = 20;

describe("trava de tentativas da função", () => {
  before(() => exigirAmbiente());
  after(() => encerrar());

  it("cada falha é registrada no banco", async () => {
    await comUsuarioDeTeste({}, async ({ cpf }) => {
      await chamarIdentidade({ cpf, senha: "errada" });
      await chamarIdentidade({ cpf, senha: "errada" });

      const { rows } = await db.query(
        "SELECT count(*)::int AS total FROM tentativa_login WHERE cpf = $1 AND NOT sucesso",
        [cpf],
      );
      assert.equal(rows[0].total, 2, "a borda não está chamando registrar_tentativa");
    });
  });

  it("o acerto zera a contagem", async () => {
    await comUsuarioDeTeste({}, async ({ cpf, senha }) => {
      await chamarIdentidade({ cpf, senha: "errada" });
      await chamarIdentidade({ cpf, senha });

      const { rows } = await db.query(
        "SELECT count(*)::int AS total FROM tentativa_login WHERE cpf = $1 AND NOT sucesso",
        [cpf],
      );
      assert.equal(rows[0].total, 0, "quem acertou a senha não pode ficar de castigo");
    });
  });

  it("depois do limite, nem a senha certa passa", async () => {
    await comUsuarioDeTeste({}, async ({ cpf, senha }) => {
      // Semeia as falhas direto no banco: 20 chamadas HTTP levariam ~30 s, e o
      // que se prova aqui é a decisão da borda, não a contagem — essa é do
      // tentativas.test.js da leva 1.
      await db.query(
        `INSERT INTO tentativa_login (cpf, sucesso)
         SELECT $1, FALSE FROM generate_series(1, $2)`,
        [cpf, LIMITE],
      );

      const { status, corpo } = await chamarIdentidade({ cpf, senha });
      assert.equal(status, 429, JSON.stringify(corpo));
      assert.equal(corpo.token, undefined, "emitiu token com a trava batida");
    });
  });

  it("a trava é por CPF, e não global", async () => {
    await comUsuarioDeTeste({}, async (travado) => {
      await db.query(
        `INSERT INTO tentativa_login (cpf, sucesso)
         SELECT $1, FALSE FROM generate_series(1, $2)`,
        [travado.cpf, LIMITE],
      );

      await comUsuarioDeTeste({}, async (outro) => {
        const { status } = await chamarIdentidade({ cpf: outro.cpf, senha: outro.senha });
        assert.equal(status, 200, "a trava de um CPF derrubou o login de outro");
      });
    });
  });
});
```

- [ ] **Passo 2: rodar**

```bash
cd backend && npm run test:identidade
```

- [ ] **Passo 3: provar que o teste pega a borda desatenta**

Em `index.ts`, comente a linha do `registrar_tentativa(cpf, FALSE)` e use `falhas: 0` fixo.
Republique. **Dois testes têm de ficar vermelhos**: "cada falha é registrada" e "depois do limite,
nem a senha certa passa". Desfaça e republique.

- [ ] **Passo 4: commit**

```bash
git add backend/test-identidade/tentativas.test.js
git commit -m "trava de tentativas: a borda usa mesmo a tabela da leva 1"
```

---

### Tarefa 7: Fechamento da leva

**Arquivos:**
- Criar: `backend/test-identidade/README.md`
- Modificar: `backend/README.md`, `CLAUDE.md`, `ROADMAP.md`

- [ ] **Passo 1: conferir que nada regrediu**

```bash
cd backend && npm test && npm run test:sqlite && npm run test:rls && npm run test:identidade
cd ../frontend && npm test && npm run lint && npm run build
```

Esperado: 259 no backend nos dois bancos, 53 no RLS, a suíte de identidade inteira verde, 264 no
front.

- [ ] **Passo 2: escrever o README da suíte**

`backend/test-identidade/README.md`, cobrindo: que ela fala com o **projeto de verdade** e por quê
(sem Deno local não há como rodar a função); que exige `SUPABASE_URL` e `SUPABASE_CHAVE_PUBLICA` no
`.env`; que todo dado criado é apagado no `finally`; que `test:identidade:offline` roda só o núcleo
e não precisa de rede; e que a ponte precisa do container de RLS de pé (`npm run rls:up`).

- [ ] **Passo 3: documentar no `backend/README.md`**

Seção "A função de identidade", com: o contrato (corpo, respostas e códigos), que `verify_jwt` é
`false` e por quê, de onde sai a chave que assina (conforme o spike), que o deploy é pelo MCP
porque não há CLI nesta máquina, e que a Data API **continua fechada**.

- [ ] **Passo 4: atualizar o `CLAUDE.md`**

Na seção do banco, registrar: que existe uma segunda porta de autenticação, a Edge Function, e que
ela **repete três regras** do `authController` — mesma mensagem para CPF inexistente e senha
errada, recusa de inativo, e o scrypt com o sal como texto da string hex; que o núcleo dela é
testado em Node por type stripping, e que o teste cruzado com `criarHashComSal` é o que impede as
duas implementações de divergirem em silêncio.

- [ ] **Passo 5: marcar a leva no `ROADMAP.md`**

- [ ] **Passo 6: commit**

```bash
git add backend/README.md backend/test-identidade/README.md ROADMAP.md
git commit -m "fecha a leva 2 da sincronizacao: documentacao da identidade"
```

---

## Como se sabe que a leva acabou

- `npm run test:identidade` passa inteira, com a função publicada respondendo.
- A ponte prova que o token real é aceito pelas políticas da leva 1, e que o corte de sessão vale.
- `npm test`, `npm run test:sqlite` (259), `npm run test:rls` (53) e o front (264) seguem iguais.
- Nenhum arquivo de `frontend/src/local/` mudou — o APK instalado continua o de hoje.
- A **Data API do Supabase continua fechada**. Reabri-la é a leva 3.

## O que esta leva deliberadamente não faz

| | Por quê |
|---|---|
| Instalar Deno ou o Supabase CLI | Não são necessários: Node 25 roda o núcleo em TypeScript e o deploy vai pelo MCP. Instalar depois não invalida nada |
| Qualquer mudança no app | Leva 3. O APK só vai chamar esta função lá |
| Reabrir a Data API | Leva 3, com o transporte de rede pronto |
| Refresh token | Fora de escopo na spec: o token vale 30 dias e a renovação é logar de novo, que exige rede de qualquer forma |
| Trocar o login da API para esta função | A API continua com o `POST /login` dela. São duas portas de propósito, e a suíte de cada uma cobre a sua |

## Riscos conhecidos

- **A função conecta ao banco como dono**, porque precisa ler a coluna `senha` para conferir o
  scrypt — nenhum papel do PostgREST alcança essa coluna, e é assim que tem de ser. O preço é que
  um bug nela vaza mais do que um bug numa política. Daí o teste que afirma que a hash nunca sai na
  resposta, e a resposta montada campo a campo em vez de devolver a linha.
- **`verify_jwt: false` deixa a função aberta a quem tiver a apikey**, que é pública. A trava de
  tentativas é a defesa, e é por isso que ela tem tarefa própria e teste de que a borda realmente a
  usa.
- **O deploy só é testável depois de publicado.** Erro de import ou de sintaxe no `index.ts` não
  aparece antes. Mitigação: a borda é fina, e tudo o que tem lógica está no núcleo, testado em
  Node.
