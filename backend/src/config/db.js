import pg from "pg";
import { carregarConfig } from "./env.js";

let poolAtual = null;

/**
 * Injeta um pool alternativo (usado pelos testes com pg-mem).
 * Passar `null` volta a criar o pool real a partir do .env.
 */
export function configurarPool(pool) {
  poolAtual = pool;
}

function obterPool() {
  if (!poolAtual) {
    // ssl e max vem no mesmo objeto de config e o pg os entende direto — por
    // isso ligar TLS no Supabase nao exigiu tocar aqui.
    //
    // O env.js sempre define `ssl`, mesmo como false, de proposito: quando o
    // campo vem undefined, o pg cai em readSSLConfigFromEnvironment() e passa a
    // obedecer PGSSLMODE do ambiente — a conexao mudaria sem ninguem declarar.
    poolAtual = new pg.Pool(carregarConfig().db);

    // Sem este listener o processo MORRE quando uma conexão ociosa cai —
    // reinício do Postgres, container reiniciado, queda de rede. O pool se
    // recupera sozinho descartando o cliente ruim; só o evento 'error' sem
    // tratamento é que derruba o Node.
    poolAtual.on("error", (erro) => {
      console.error("[pg] conexão ociosa caiu, o pool vai reconectar:", erro.message);
    });
  }
  return poolAtual;
}

// Fachada fina sobre o pool para que os call sites nao dependam de quando
// o pool foi criado (importante para os testes e para o fail-fast do env).
export const db = {
  query: (texto, valores) => obterPool().query(texto, valores),
  connect: () => obterPool().connect(),
  end: () => (poolAtual ? poolAtual.end() : Promise.resolve()),
};
