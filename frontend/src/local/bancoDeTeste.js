/**
 * Banco vazio para os testes, com o mesmo contrato que o driver do aparelho
 * oferece — inclusive `BEGIN`/`COMMIT` por `query`.
 *
 * Estava copiado em quatro arquivos de teste do `src/local/`; saiu para cá
 * quando a sincronização passou a precisar dele em mais três.
 *
 * O import é dinâmico porque `sqlite.js` puxa `node:sqlite`: no ambiente jsdom
 * de alguns testes de tela, um import estático quebraria a coleta do Vitest
 * mesmo sem ninguém chamar a função.
 */
export async function abrirBancoDeTeste() {
  const { criarBancoSqlite } = await import('../../../backend/src/config/sqlite.js')
  return criarBancoSqlite({ arquivo: ':memory:' })
}
