import "dotenv/config";

// Os nomes usam prefixo DB_ de proposito: variaveis como USER e HOST ja existem
// no ambiente em Linux/macOS, e o dotenv nao sobrescreve o que ja esta definido —
// o .env seria ignorado em silencio e a conexao usaria o usuario do sistema.
const OBRIGATORIAS = ["DB_USER", "DB_HOST", "DB_NAME", "DB_PASSWORD", "DB_PORT", "TOKEN_SEG"];

export function carregarConfig() {
  const faltando = OBRIGATORIAS.filter((nome) => !process.env[nome]);
  if (faltando.length > 0) {
    throw new Error(
      `Variáveis de ambiente ausentes: ${faltando.join(", ")}. ` +
        `Configure o backend/.env (veja backend/.env.example).`
    );
  }

  return {
    porta: Number(process.env.PORTA ?? 8080),

    // 0.0.0.0 responde em toda a rede — é o que permite abrir pelo celular
    // durante o desenvolvimento. Atrás de um proxy reverso, use 127.0.0.1:
    // senão a API continua acessível na porta 8080 sem passar pelo HTTPS.
    hostBind: process.env.HOST_BIND ?? "0.0.0.0",
    db: {
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: Number(process.env.DB_PORT),

      // O Supabase exige TLS; o Postgres em container local nao tem
      // certificado. Por isso e opcional, e desligado por padrao.
      //
      // rejectUnauthorized fica TRUE de proposito: aceitar certificado nao
      // verificado devolve a conexao ao estado em que um intermediario pode se
      // passar pelo banco — que e o ataque que o TLS existe para impedir.
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : false,

      // Teto explicito porque o plano Free do Supabase da 60 conexoes, e 13 ja
      // ficam com os servicos dele. Duas instancias da API a 10 cada ainda
      // cabem; sem teto declarado, ninguem percebe quando deixar de caber.
      max: Number(process.env.DB_POOL_MAX ?? 10),
    },
    jwt: {
      segredo: process.env.TOKEN_SEG,
      expiracao: process.env.JWT_EXPIRACAO ?? "7d",
    },
    // Lista separada por ";". Vazio = nenhuma origem liberada.
    origensCors: (process.env.ENABLE_CORS ?? "")
      .split(";")
      .map((origem) => origem.trim())
      .filter(Boolean),

    // Atrás de um proxy reverso (Caddy, nginx) todo request chega de 127.0.0.1.
    // Sem isso o limitador por IP trataria a rede inteira como um cliente só.
    // Valor: número de proxies à frente da aplicação. 0 = exposta direto.
    proxiesConfiaveis: Number(process.env.PROXIES_CONFIAVEIS ?? 0),

    limites: {
      loginJanelaMs: Number(process.env.LIMITE_LOGIN_JANELA_MS ?? 15 * 60 * 1000),
      loginMaximo: Number(process.env.LIMITE_LOGIN_MAXIMO ?? 20),
      geralJanelaMs: Number(process.env.LIMITE_GERAL_JANELA_MS ?? 60 * 1000),
      geralMaximo: Number(process.env.LIMITE_GERAL_MAXIMO ?? 300),
    },
  };
}
