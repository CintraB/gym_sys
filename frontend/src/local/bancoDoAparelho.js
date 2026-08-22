/**
 * O driver de banco do aparelho. Chega na leva 3, junto com o Capacitor.
 *
 * Existe agora para o build standalone fechar e para a pendência ficar
 * explícita — e não como um `catch` silencioso, que faria o app abrir com banco
 * vazio e parecer que perdeu os treinos.
 *
 * Quem entra aqui é o plugin nativo de SQLite: um arquivo em disco, com a
 * persistência a cargo do próprio motor. O contrato é o de `DriverDeBanco` em
 * `index.d.ts` — `query`, `connect` e `end` —, o mesmo que o `node:sqlite`
 * cumpre nos testes.
 */
export async function abrirBancoDoAparelho() {
  throw new Error(
    'Banco do aparelho ainda não implementado: leva 3 da seção 6 do roadmap.',
  )
}
