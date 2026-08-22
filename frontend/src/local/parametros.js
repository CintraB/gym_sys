/**
 * Converte `?1`, `?2` (numerados) em `?` posicionais, reordenando os valores
 * para a ordem em que aparecem no SQL e duplicando os que se repetem.
 *
 * O tradutor de dialeto gera numerados de propósito: é o que preserva o mesmo
 * parâmetro usado duas vezes na mesma consulta, como na busca por CPF ou título.
 * O `node:sqlite` entende essa forma; o plugin nativo do aparelho passa os
 * valores como array para a camada Java, e não há garantia de que a numeração
 * sobreviva até lá. Converter aqui deixa de ser uma aposta.
 */
export function paraPosicionais(sql, valores = []) {
  const usados = []

  const convertido = sql.replace(/\?(\d+)/g, (_todo, numero) => {
    const indice = Number(numero) - 1
    // `??`, e não `||`: `0`, `''` e `false` são valores legítimos no schema —
    // carga zero e repetições vazias são como o cardio é gravado, e as flags de
    // perfil são booleanas. Só ausência de valor virá nulo, que é o que o
    // SQLite aceita no lugar de `undefined`.
    usados.push(valores[indice] ?? null)
    return '?'
  })

  return { sql: convertido, valores: usados }
}
