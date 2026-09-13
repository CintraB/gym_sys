/**
 * O que da para provar sem o runtime do Deno: o scrypt, a regra de recusa e as
 * claims. Sem I/O nenhum de proposito -- quem busca o usuario e conta as
 * falhas e a borda, e e isso que deixa a regra testavel em Node.
 *
 * Nao importa `jose` nem nada de fora: so `node:crypto`, que existe nos dois
 * runtimes. E o que permite ao teste importar este arquivo de fora do
 * backend/, sem resolver dependencia nenhuma.
 */
import { scrypt, timingSafeEqual } from "node:crypto";
// Buffer NAO e global no Edge runtime, ao contrario do Node. Foi o que fez a
// primeira versao do spike do scrypt falhar, em 07/09/2026.
import { Buffer } from "node:buffer";

const TAMANHO_HASH = 64;

/** 20 falhas em 15 minutos, o mesmo LIMITE_LOGIN_MAXIMO da API. */
export const LIMITE_FALHAS = 20;

/** 30 dias, contra os 7 do token da API. Decisao dele em 13/09/2026. */
export const VALIDADE_DIAS = 30;

export interface UsuarioDoBanco {
  id: number;
  senha: string;
  ativo: boolean;
  aluno: boolean;
  professor: boolean;
  admin: boolean;
}

export type Decisao =
  | { ok: true; id: number; cargo: string; perfis: string[] }
  | { ok: false; motivo: "credencial" | "inativo" | "excesso" };

export function normalizarCpf(valor: unknown): string {
  if (typeof valor === "number") return String(valor);
  if (typeof valor !== "string") return "";
  return valor.replace(/\D/g, "");
}

function scryptAsync(senha: string, sal: string): Promise<Buffer> {
  return new Promise((resolve, rejeitar) => {
    scrypt(senha, sal, TAMANHO_HASH, (erro, derivada) =>
      erro ? rejeitar(erro) : resolve(derivada as Buffer),
    );
  });
}

/**
 * Mesmo formato do backend: "<sal_hex>:<hash_hex>", com o sal entrando como o
 * TEXTO da string hex -- nao decodificado em bytes. Decodificar da uma hash
 * valida e diferente, e o unico sintoma seria a senha certa sendo recusada.
 */
export async function verificarSenha(
  hashArmazenada: string,
  senhaInformada: string,
): Promise<boolean> {
  if (typeof hashArmazenada !== "string" || typeof senhaInformada !== "string") return false;

  const [sal, hashEsperada] = hashArmazenada.split(":");
  if (!sal || !hashEsperada) return false;

  const calculada = await scryptAsync(senhaInformada, sal);
  const esperada = Buffer.from(hashEsperada, "hex");

  // timingSafeEqual lanca se os tamanhos diferem -- comparar antes evita
  // transformar hash malformada no banco em erro 500.
  if (calculada.length !== esperada.length) return false;
  return timingSafeEqual(calculada, esperada);
}

/** admin > professor > aluno, a mesma precedencia de src/lib/perfil.js. */
function cargoDe(usuario: UsuarioDoBanco): string {
  if (usuario.admin) return "admin";
  if (usuario.professor) return "professor";
  return "aluno";
}

function perfisDe(usuario: UsuarioDoBanco): string[] {
  const lista: string[] = [];
  if (usuario.aluno) lista.push("aluno");
  if (usuario.professor) lista.push("professor");
  if (usuario.admin) lista.push("admin");
  return lista;
}

export async function avaliarLogin({
  usuario,
  senha,
  falhas,
}: {
  usuario: UsuarioDoBanco | null;
  senha: string;
  falhas: number;
}): Promise<Decisao> {
  // A trava vem primeiro: com ela batida, nem a senha certa passa. Conferir a
  // senha antes seria gastar 29 ms de scrypt para recusar do mesmo jeito, e
  // daria ao atacante um oraculo de tempo.
  if (falhas >= LIMITE_FALHAS) return { ok: false, motivo: "excesso" };

  // Mesmo motivo para CPF inexistente e senha errada, como authController:21:
  // nao entrega quais CPFs estao cadastrados.
  if (!usuario || !(await verificarSenha(usuario.senha, senha))) {
    return { ok: false, motivo: "credencial" };
  }
  if (!usuario.ativo) return { ok: false, motivo: "inativo" };

  return { ok: true, id: usuario.id, cargo: cargoDe(usuario), perfis: perfisDe(usuario) };
}

/**
 * As claims que o RLS da leva 1 le. `sub` vai como STRING porque e o que o JWT
 * manda, e `auth_id_valido()` faz o cast para INTEGER do lado do banco.
 */
export function montarClaims(id: number, agoraEmSegundos: number) {
  return {
    sub: String(id),
    role: "authenticated",
    aud: "authenticated",
    iat: agoraEmSegundos,
    exp: agoraEmSegundos + VALIDADE_DIAS * 24 * 60 * 60,
  };
}
