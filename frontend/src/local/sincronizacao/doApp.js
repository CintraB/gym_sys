import { db } from '../banco.js'
import { criarCliente } from './cliente.js'
import { criarSincronizacao } from './index.js'

/**
 * O motor que o aplicativo usa, criado uma vez só.
 *
 * Fica separado do `criarSincronizacao` porque aquele recebe tudo por
 * parâmetro — é o que o deixa testável sem rede e sem banco. Este aqui é a
 * ligação com o mundo: a fachada `db`, que no APK é o SQLite do aparelho, e o
 * endereço do projeto, que vem do `vite.config.ts`.
 */
let motor = null

export function sincronizacaoDoApp() {
  if (!motor) {
    motor = criarSincronizacao({
      bd: db,
      cliente: criarCliente({
        url: import.meta.env.VITE_SUPABASE_URL,
        chave: import.meta.env.VITE_SUPABASE_CHAVE,
      }),
    })
  }
  return motor
}

/** Só para os testes: derruba a instância entre um caso e outro. */
export function esquecerSincronizacaoDoApp() {
  motor = null
}
