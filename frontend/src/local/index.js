import { configurarPool } from './banco.js'
import { adaptadorLocal } from './adaptadorAxios.js'

/**
 * Liga o app ao próprio núcleo: o banco recebe o driver do ambiente e o axios
 * ganha o adapter que fala com o roteador local.
 *
 * Quem chama é o `main.tsx`, só no modo standalone, antes do primeiro render —
 * para nenhuma tela chegar a tentar uma rede que não existe.
 */
export function ligarAppLocal({ driver }) {
  configurarPool(driver)
  return adaptadorLocal
}
