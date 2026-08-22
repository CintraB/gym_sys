/**
 * Borda de `backend/src/config/db.js`.
 *
 * O original já é injetável — foi feito assim para os testes —, mas o `import
 * pg` no topo arrasta `net` e `events` para o bundle mesmo quando o pool nunca
 * é criado. Aqui não existe driver embutido: quem manda é quem chama
 * `configurarPool`, que no APK é o SQLite do aparelho e nos testes o
 * `node:sqlite`.
 *
 * Os nomes são os mesmos do original de propósito: é o que permite o plugin do
 * Vite trocar um pelo outro sem que nenhum controller perceba.
 */
let driver = null

export function configurarPool(novo) {
  driver = novo
}

function exigirDriver() {
  if (!driver) {
    throw new Error('Banco não configurado: chame configurarPool antes de usar o app.')
  }
  return driver
}

export const db = {
  query: (texto, valores) => exigirDriver().query(texto, valores),
  connect: () => exigirDriver().connect(),
  // Fechar sem nunca ter aberto não é erro: acontece ao encerrar o app antes de
  // qualquer consulta.
  end: () => (driver ? driver.end() : Promise.resolve()),
}
