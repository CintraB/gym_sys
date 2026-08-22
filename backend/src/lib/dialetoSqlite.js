/**
 * Traduz o SQL do projeto, escrito para PostgreSQL, para o dialeto do SQLite —
 * o banco que vai embutido no APK.
 *
 * É uma função só, aplicada a tudo: as regras de DDL não aparecem em consulta e
 * as de consulta não aparecem em DDL, então não há por que ter dois caminhos e
 * arriscar chamar o errado.
 *
 * O que NÃO precisa de tradução, e por isso não está aqui: RETURNING (o SQLite
 * tem desde a 3.35), índice parcial, ON DELETE CASCADE, ON CONFLICT e INTERVAL
 * (que o código de produção não usa).
 *
 * Limite conhecido: a troca de `$1` é textual, então um `$` seguido de dígito
 * dentro de um literal de texto seria trocado por engano. Hoje não existe caso
 * — o hash de senha é `hex:hex` — mas é aqui que doeria.
 */

/**
 * Data e hora de agora, em ISO UTC.
 *
 * Não usar o CURRENT_TIMESTAMP do SQLite: ele grava "2026-08-22 19:48:04", sem
 * T e sem Z, e `new Date()` disso interpreta como hora local — três horas de
 * erro no Brasil. Isso quebraria a comparação do `iat` do token com
 * `sessoes_invalidadas_em`, que é o que expulsa a sessão de quem trocou a senha
 * ou o CPF: a expulsão passaria a valer na hora errada.
 */
export const AGORA = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export function traduzir(sql) {
  return (
    sql
      // $1 vira ?1, e não "?": o SQLite numera igual, e o projeto reusa o mesmo
      // parâmetro na mesma consulta (a busca por CPF ou título). Com "?" solto,
      // a segunda aparição consumiria o valor seguinte.
      .replace(/\$(\d+)/g, "?$1")
      .replace(/\bILIKE\b/gi, "LIKE")
      .replace(/\bNOW\(\)/gi, AGORA)
      // Os casts existem para o PostgreSQL decidir tipo de parâmetro; o SQLite
      // não precisa deles, e o sentido das consultas não muda sem eles.
      .replace(/::(?:int(?:eger)?|text)\b/g, "")
      .replace(/\bSERIAL PRIMARY KEY\b/g, "INTEGER PRIMARY KEY AUTOINCREMENT")
      // Duas proteções redundantes contra "TIMESTAMPTZ" virar "TEXTTZ": a ordem
      // (o TZ é consumido primeiro) e o `\b` no fim de TIMESTAMP. Cada uma basta
      // sozinha — medido quebrando as duas, uma por vez, e o teste só fica
      // vermelho quando as duas caem juntas. Manter ambas.
      .replace(/\bTIMESTAMPTZ\b/g, "TEXT")
      .replace(/\bTIMESTAMP\b/g, "TEXT")
      .replace(/\bVARCHAR\(\d+\)/g, "TEXT")
      .replace(/\bSMALLINT\b/g, "INTEGER")
      .replace(/DEFAULT CURRENT_TIMESTAMP/g, `DEFAULT (${AGORA})`)
  );
}
