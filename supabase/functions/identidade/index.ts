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
