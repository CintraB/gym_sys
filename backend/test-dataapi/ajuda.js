/**
 * Fala com a Data API do projeto, como o APK vai falar.
 *
 * Suíte à parte porque exige duas coisas que as outras não exigem: rede e a
 * Data API aberta. Enquanto o schema `public` não estiver exposto, ela falha
 * inteira — e é esse o sinal de que algo mudou na configuração do projeto.
 */
import { chamarIdentidade, comUsuarioDeTeste } from "../test-identidade/ajuda.js";

export { comUsuarioDeTeste, chamarIdentidade };
export { encerrar, exigirAmbiente } from "../test-identidade/ajuda.js";

const BASE = () => `${process.env.SUPABASE_URL}/rest/v1`;
const CHAVE = () => process.env.SUPABASE_CHAVE_PUBLICA;

/**
 * Uma requisição ao PostgREST. Sem token, vai como `anon`.
 *
 * O header de perfil não é enfeite: o schema `public` é exposto, mas **não** é
 * o padrão deste projeto — a lista de Exposed schemas começa em
 * `graphql_public`. Sem nomear, tudo volta 404 "Could not find the table
 * 'graphql_public.usuario'", que parece tabela inexistente e não schema errado.
 *
 * O corpo volta como texto quando não é JSON: um 502 do proxy vem em HTML, e
 * `resposta.json()` estouraria escondendo o status — que é o que interessa.
 */
export async function rest(caminho, { token, metodo = "GET", corpo } = {}) {
  const cabecalhos = { apikey: CHAVE(), "content-type": "application/json" };
  if (token) cabecalhos.Authorization = `Bearer ${token}`;
  if (metodo === "GET") cabecalhos["Accept-Profile"] = "public";
  else cabecalhos["Content-Profile"] = "public";

  const resposta = await fetch(`${BASE()}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

  const texto = await resposta.text();
  let dados;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = texto;
  }
  return { status: resposta.status, corpo: dados };
}

/** O token que a Edge Function emite para uma conta de teste. */
export async function tokenDe({ cpf, senha }) {
  const { corpo } = await chamarIdentidade({ cpf, senha });
  return corpo.token;
}
