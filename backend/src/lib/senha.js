import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const TAMANHO_HASH = 64;
const TAMANHO_SAL = 32;

/** Formato armazenado no banco: "<sal_hex>:<hash_hex>". */
export async function criarHashComSal(senha) {
  const sal = randomBytes(TAMANHO_SAL).toString("hex");
  const hash = await scryptAsync(senha, sal, TAMANHO_HASH);
  return `${sal}:${hash.toString("hex")}`;
}

export async function verificarSenha(hashArmazenada, senhaInformada) {
  if (typeof hashArmazenada !== "string" || typeof senhaInformada !== "string") {
    return false;
  }

  const [sal, hashEsperada] = hashArmazenada.split(":");
  if (!sal || !hashEsperada) {
    return false;
  }

  const calculada = await scryptAsync(senhaInformada, sal, TAMANHO_HASH);
  const esperada = Buffer.from(hashEsperada, "hex");

  // timingSafeEqual lanca se os tamanhos diferem — comparar antes evita
  // transformar uma hash malformada no banco em erro 500.
  if (calculada.length !== esperada.length) {
    return false;
  }

  return timingSafeEqual(calculada, esperada);
}
