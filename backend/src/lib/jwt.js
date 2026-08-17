import { SignJWT, jwtVerify } from "jose";
import { carregarConfig } from "../config/env.js";

// jose substitui o jsonwebtoken: o jsonwebtoken depende (via jwa) do pacote
// buffer-equal-constant-time, que usa SlowBuffer — removido no Node 24+.
// Em Node 25 o require do jsonwebtoken derruba a aplicacao na inicializacao.

let segredoCache = null;

function segredo() {
  if (!segredoCache) {
    segredoCache = new TextEncoder().encode(carregarConfig().jwt.segredo);
  }
  return segredoCache;
}

export async function gerarToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(carregarConfig().jwt.expiracao)
    .sign(segredo());
}

export async function verificarToken(token) {
  const { payload } = await jwtVerify(token, segredo(), { algorithms: ["HS256"] });
  return payload;
}
