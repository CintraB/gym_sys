/**
 * Borda de `backend/src/config/env.js`, que não atravessa para o browser porque
 * o `dotenv` puxa `path` e `fs`.
 *
 * Devolve só o que o app usa: quem lê isto é o `jwt.js`, para assinar e
 * verificar token. O `db` do original não entra — quem escolhe o banco aqui é
 * `banco.js`, com o driver do aparelho.
 */

const CHAVE_SEGREDO = 'gymsys.local.segredo'

/**
 * Segredo do JWT, sorteado na primeira execução e guardado no aparelho.
 *
 * Não é uma constante no código de propósito: um segredo fixo no bundle é
 * público — qualquer um que abra o APK o encontra e passa a forjar token para
 * qualquer instalação. Com um por aparelho, o APK extraído não diz nada sobre o
 * telefone de ninguém.
 *
 * O que isto *não* resolve, e vale saber: quem já está com o aparelho
 * destravado também tem o banco, então forjar token não dá acesso a nada novo.
 * A troca é barata e fecha o caso do APK circulando por aí.
 */
function segredoDaInstalacao() {
  const guardado = localStorage.getItem(CHAVE_SEGREDO)
  if (guardado) return guardado

  const sorteado = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
  localStorage.setItem(CHAVE_SEGREDO, sorteado)
  return sorteado
}

export function carregarConfig() {
  return {
    jwt: {
      segredo: segredoDaInstalacao(),
      // Um ano: no app offline não há sessão para roubar pela rede, e expirar o
      // token faria a pessoa se ver deslogada sem ter a quem pedir outro.
      expiracao: '365d',
    },
  }
}
