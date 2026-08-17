/** Erro com status HTTP, seguro para ser exposto ao cliente. */
export class ErroApi extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.name = "ErroApi";
    this.status = status;
  }
}

export const erroRequisicao = (mensagem) => new ErroApi(400, mensagem);
export const erroNaoAutorizado = (mensagem) => new ErroApi(401, mensagem);
export const erroProibido = (mensagem) => new ErroApi(403, mensagem);
export const erroNaoEncontrado = (mensagem) => new ErroApi(404, mensagem);
export const erroConflito = (mensagem) => new ErroApi(409, mensagem);

/**
 * Encaminha rejeicoes de handlers async para o error handler do Express.
 * Sem isso, um await que falha vira "unhandled rejection" e a requisicao pendura.
 */
export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
