import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { normalizarDigitos } from "../lib/validacao.js";

/**
 * Limitadores de requisição.
 *
 * São criados por instância de app (não no escopo do módulo) para que cada
 * app tenha seu próprio contador — é o que mantém os testes independentes.
 *
 * O armazenamento é em memória: serve para um processo só, que é o caso do
 * PC servidor de casa. Rodando em cluster, cada worker teria a própria conta.
 */

const RESPOSTA_EXCEDIDA = { message: "Muitas tentativas. Tente de novo em alguns minutos." };

/**
 * Login: o alvo é força bruta de senha.
 *
 * A chave combina IP e CPF. Só por IP, um atacante atrás de CGNAT derrubaria
 * usuários legítimos da mesma rede; só por CPF, ele varreria vários CPFs sem
 * ser barrado. Tentativas bem-sucedidas não contam, para quem acerta a senha
 * várias vezes no dia não ser punido.
 *
 * O IP passa por ipKeyGenerator: em IPv6 um mesmo cliente costuma dispor de um
 * /64 inteiro, então usar o endereço cru deixaria trocar de IP a cada tentativa
 * e furar o limite. O helper agrupa a faixa.
 */
export function limitadorLogin({ janelaMs, maximo }) {
  return rateLimit({
    windowMs: janelaMs,
    limit: maximo,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) =>
      `${ipKeyGenerator(req.ip)}:${normalizarDigitos(req.body?.cpf) || "sem-cpf"}`,
    handler: (_req, res) => res.status(429).json(RESPOSTA_EXCEDIDA),
  });
}

/** Teto geral, para uma única origem não monopolizar a API. */
export function limitadorGeral({ janelaMs, maximo }) {
  return rateLimit({
    windowMs: janelaMs,
    limit: maximo,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json(RESPOSTA_EXCEDIDA),
  });
}
