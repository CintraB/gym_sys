# Suíte da Edge Function de identidade

Prova a função `identidade`, que troca CPF + senha por um JWT que as políticas de RLS aceitam —
a porta pela qual o APK vai autenticar a partir da leva 3.

## Ela fala com o projeto de verdade

Não há como rodar a função localmente: isso exigiria o Deno, que esta máquina não tem (e a leva 2
decidiu não instalar). Então a suíte chama a **função publicada**, no projeto real.

Consequências:

- **Exige rede**, e mora em script próprio — nunca entra no `npm test`.
- **Todo dado que ela cria é apagado no `finally`** do próprio teste: `comUsuarioDeTeste` insere a
  conta, roda o callback e remove a conta e as tentativas aconteça o que acontecer. Nada de deixar
  conta de teste para trás, como aconteceu em 07/09/2026.
- O CPF dessas contas sai de um sorteio na faixa dos `9...`, que não é CPF de ninguém.
- A conexão é a do backend (`src/config/db.js`), que é dona das tabelas e ignora RLS.

## Como rodar

```bash
npm run test:identidade          # tudo: núcleo, função publicada, ponte e trava
npm run test:identidade:offline  # só o núcleo — sem rede, sem banco, sem container
```

`test:identidade` precisa de:

- **`SUPABASE_URL` e `SUPABASE_CHAVE_PUBLICA` no `backend/.env`** (modelo no `.env.example`). A
  chave é a *publishable* — pública por natureza, ela só identifica o projeto.
- **O container da suíte de RLS de pé** (`npm run rls:up`), por causa da ponte.
- **O secret `JWT_SEGREDO` cadastrado no painel**, em *Edge Functions → Secrets*, com o valor do
  *legacy JWT secret*. Sem ele a função responde 500 em todo login: o spike de 13/09/2026 mostrou
  que o `SUPABASE_JWKS` injetado traz só a chave pública `EC/ES256`, que não serve para assinar.

## Os arquivos

| Arquivo | O que prova | Precisa de rede |
|---|---|---|
| `nucleo.test.js` | O scrypt bate com o do backend, a regra de recusa, a precedência de cargo, as claims, e que o `PADRAO_HASH` detecta hash de verdade | não |
| `publicada.test.js` | A função responde: token emitido, CPF com máscara, inativo recusado, corpo vazio, cargo, e a mesma resposta para senha errada e CPF inexistente | sim |
| `ponte.test.js` | O token real abre exatamente as portas que as políticas da leva 1 desenharam, e o corte de sessão vale | sim + container |
| `tentativas.test.js` | A borda realmente chama `registrar_tentativa`, e a trava é por CPF | sim |

## Duas coisas que custaram para descobrir

**`conectarComoPostgREST` existe porque o `conectarComo` da suíte de RLS força `SET ROLE
authenticated`.** Lá isso é certo — as claims são forjadas e o papel é o que se quer testar. Aqui
não: o PostgREST decide o papel pela claim `role` do token, e com o helper da outra suíte a ponte
passava mesmo com a função emitindo `role: "anon"` — conferido publicando a função quebrada de
propósito. O helper daqui usa a claim, com lista branca de papéis; o que não está nela cai para
`anon`, nunca sobe.

**A prova de que a asserção da hash detecta é offline, e tem de continuar assim.** Publicar de
propósito uma versão que devolve a hash — como um passo do plano chegou a pedir — vazaria senha num
endpoint público enquanto estivesse no ar. Em vez disso, `PADRAO_HASH` mora no `ajuda.js` e
`nucleo.test.js` o exercita contra uma hash gerada por `criarHashComSal`.
