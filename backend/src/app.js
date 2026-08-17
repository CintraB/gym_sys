import express from "express";
import cors from "cors";
import rotas from "./routes/index.js";
import { errorHandler, rotaNaoEncontrada } from "./middlewares/errorHandler.js";
import { limitadorGeral, limitadorLogin } from "./middlewares/rateLimit.js";

const LIMITES_PADRAO = {
  loginJanelaMs: 15 * 60 * 1000,
  loginMaximo: 20,
  geralJanelaMs: 60 * 1000,
  geralMaximo: 300,
};

export function criarApp({ origensCors = [], proxiesConfiaveis = 0, limites = {} } = {}) {
  const app = express();
  const config = { ...LIMITES_PADRAO, ...limites };

  // Precisa vir antes dos limitadores: define de onde o Express lê o IP real.
  app.set("trust proxy", proxiesConfiaveis);

  app.use(
    cors({
      // Sem origens configuradas o CORS fica fechado; requisicoes sem Origin
      // (curl, apps nativos) continuam passando.
      // "*" reflete a origem recebida — so faz sentido no modo demo.
      origin: origensCors === "*" ? true : origensCors.length > 0 ? origensCors : false,
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.use(
    limitadorGeral({ janelaMs: config.geralJanelaMs, maximo: config.geralMaximo })
  );

  // Só no login, e depois do express.json porque a chave usa o CPF do corpo.
  app.post(
    "/login",
    limitadorLogin({ janelaMs: config.loginJanelaMs, maximo: config.loginMaximo })
  );

  app.use(rotas);
  app.use(rotaNaoEncontrada);
  app.use(errorHandler);

  return app;
}

export default criarApp;
