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

/**
 * CORS.
 *
 * O APK roda numa pagina `https://localhost` (o esquema do Capacitor), entao
 * toda chamada daqui e cross-origin. Sem estes cabecalhos o WebView recusa a
 * resposta ANTES de o JavaScript ve-la, e o erro que chega e um
 * `TypeError: Failed to fetch` sem status nenhum -- indistinguivel de "sem
 * internet".
 *
 * Nao foi pego por teste nenhum porque o Node nao aplica CORS: a suite inteira
 * passava com a funcao publicada e inalcancavel pelo aparelho. Descoberto no
 * emulador, em 13/09/2026.
 *
 * `*` porque a funcao nao guarda cookie nem sessao: a credencial vai no corpo,
 * e a resposta so tem valor para quem ja sabe CPF e senha.
 */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

/**
 * A chave que assina, em bytes.
 *
 * O segredo legado HS256 do projeto e o que o PostgREST usa para validar. O
 * spike de 13/09/2026 mostrou que ele NAO chega sozinho a funcao: o
 * SUPABASE_JWKS injetado traz so a chave publica EC/ES256, que serve para
 * verificar e nunca para assinar. Por isso `JWT_SEGREDO` e um secret
 * cadastrado no painel.
 *
 * A leitura do JWKS continua aqui como segunda fonte: se um dia a plataforma
 * passar a injetar a simetrica, a funcao para de depender do secret sozinha.
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

  // UMA conexao por instancia, e ociosa por pouco tempo.
  //
  // Isto nao e economia: Edge Function escala em muitas instancias, cada uma
  // com o proprio pool, e o Postgres tem um teto de conexoes que nao escala
  // junto. Com `max: 2` e sem `idle_timeout`, rodar a suite tres vezes seguidas
  // deixou **42 conexoes ociosas** no banco, e os testes passaram a falhar de
  // formas que nao se repetiam -- medido em 13/09/2026.
  //
  // O sintoma em producao seria pior que teste vermelho: o app do celular
  // falhando de vez em quando, sem explicacao, quando o banco recusa conexao
  // nova porque as antigas nao voltaram.
  max: 1,
  idle_timeout: 10,
  // Falhar rapido e melhor que segurar a requisicao: quem chama tem
  // retentativa, e uma conexao pendurada consome a vaga de outra pessoa.
  connect_timeout: 10,
});

Deno.serve(async (requisicao: Request) => {
  // O preflight vem antes de qualquer POST com content-type: se ele nao for
  // respondido, a requisicao de verdade nem chega a sair.
  if (requisicao.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

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
