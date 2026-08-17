import { carregarConfig } from "./src/config/env.js";
import { criarApp } from "./src/app.js";

const config = carregarConfig();
const app = criarApp({
  origensCors: config.origensCors,
  proxiesConfiaveis: config.proxiesConfiaveis,
  limites: config.limites,
});

app.listen(config.porta, config.hostBind, () => {
  console.log(`API ouvindo em http://${config.hostBind}:${config.porta}`);
  console.log(
    config.origensCors.length > 0
      ? `CORS liberado para: ${config.origensCors.join(", ")}`
      : "CORS fechado (ENABLE_CORS vazio)"
  );
});
