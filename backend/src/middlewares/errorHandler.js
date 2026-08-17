import { ErroApi } from "../lib/erros.js";

export function rotaNaoEncontrada(_req, res) {
  res.status(404).json({ message: "Rota não encontrada" });
}

/**
 * Handler central de erros.
 *
 * Antes cada controller fazia `res.status(500).json(error)`, o que devolvia o
 * erro cru do Postgres (query, tabela, constraint) para o cliente. Aqui só o
 * que é ErroApi vira mensagem; o resto vira 500 genérico e vai para o log.
 */
// eslint-disable-next-line no-unused-vars -- o Express identifica o handler pela aridade 4
export function errorHandler(erro, _req, res, _next) {
  if (erro instanceof ErroApi) {
    return res.status(erro.status).json({ message: erro.message });
  }

  // Erros do express.json. Sem esse tratamento, um corpo malformado ou grande
  // demais virava 500 — o cliente não conseguia distinguir erro dele de bug nosso.
  if (erro?.type === "entity.parse.failed") {
    return res.status(400).json({ message: "JSON inválido no corpo da requisição" });
  }
  if (erro?.type === "entity.too.large") {
    return res.status(413).json({ message: "Corpo da requisição grande demais" });
  }

  // 23505 = unique_violation
  if (erro?.code === "23505") {
    return res.status(409).json({ message: "Registro já existe" });
  }

  console.error("[erro nao tratado]", erro);
  res.status(500).json({ message: "Erro interno do servidor" });
}
