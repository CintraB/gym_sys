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
 * O formato do banco: 64 hex de sal, dois-pontos, 128 hex de hash.
 *
 * Mora aqui, e não embutido na asserção, porque um teste offline o exercita
 * contra uma hash de verdade — sem isso, "a resposta não bate no padrão" seria
 * verdade também se o padrão nunca batesse em nada.
 *
 * A prova de que a asserção detecta **tem** de ser assim: publicar de
 * propósito uma versão que devolve a hash, como um passo do plano pedia,
 * exporia senha num endpoint público, e o classificador de permissão barrou
 * isso — corretamente.
 */
export const PADRAO_HASH = /[0-9a-f]{64}:[0-9a-f]{128}/i;

/**
 * Cria um usuário de teste, roda o callback e apaga tudo depois.
 *
 * O CPF sai de um sorteio na faixa dos 900... para duas execuções simultâneas
 * não brigarem pelo índice único, e por não ser CPF de gente nenhuma.
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
