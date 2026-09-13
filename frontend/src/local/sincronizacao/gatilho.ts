/**
 * O gatilho que as telas chamam: "aconteceu algo que vale subir".
 *
 * Existe para as telas não precisarem saber se o app está no modo standalone
 * nem importar o motor — no build web a condição é resolvida em tempo de
 * compilação e o import dinâmico some do bundle inteiro.
 *
 * Nunca lança e nunca é esperado: uma tela não pode ficar presa na rede, e
 * falha de sincronização não é falha da ação que a pessoa acabou de fazer.
 */
export function sincronizarSeHouver() {
  if (import.meta.env.VITE_MODO_APP !== 'standalone') return

  void import('./doApp.js')
    .then(({ sincronizacaoDoApp }) => sincronizacaoDoApp().sincronizar())
    .catch((erro) => console.error('[sincronizacao] gatilho:', erro))
}

/**
 * Ids das sessões que ainda não subiram, para o histórico marcá-las.
 *
 * Vem daqui, e não do `GET /alunos/historico`: o que já subiu é informação
 * **local**, guardada numa tabela que o servidor não tem — e o controller do
 * histórico é compartilhado com a versão web, que não deve saber que isto
 * existe.
 *
 * Fora do modo standalone devolve vazio: na web não há nada a sincronizar.
 */
export async function sessoesNaoEnviadas(): Promise<Set<number>> {
  if (import.meta.env.VITE_MODO_APP !== 'standalone') return new Set()

  try {
    const { sincronizacaoDoApp } = await import('./doApp.js')
    const motor = sincronizacaoDoApp()
    // Sem sincronização ativa, "não enviado" não quer dizer nada: seria selo em
    // toda sessão, para sempre, sem ação possível.
    if (!motor.estado().ligada) return new Set()

    const linhas = await motor.pendentes()
    return new Set(linhas.map((linha) => linha.id_sessao))
  } catch (erro) {
    console.error('[sincronizacao] pendentes do histórico:', erro)
    return new Set()
  }
}
