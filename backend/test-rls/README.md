# Suíte de RLS

Prova, num PostgreSQL de verdade, a autorização que mora no banco: os `GRANT`s, as políticas de
Row Level Security, as funções de identidade e a `sincronizar_sessao`.

**Vermelho aqui é vulnerabilidade, não teste desatualizado** — a mesma regra do
`test/seguranca.test.js`. Investigue antes de mexer na asserção.

## Por que precisa de Docker

O `pg-mem` da suíte principal não executa plpgsql nem RLS. Ele cobre as consultas dos controllers,
mas ignora política e `SECURITY DEFINER` — um teste de autorização ali passaria sem provar nada.

Por isso `npm run test:rls` sobe um container próprio: Postgres 16, porta 5433, **sem volume**
(`tmpfs`), separado do `docker-compose.yml` de desenvolvimento. O banco nasce vazio a cada execução
e a suíte aplica o SQL ela mesma, o que também prova que os arquivos rodam do zero — que é como vão
rodar no Supabase. Os dados de desenvolvimento nunca são tocados.

## Como rodar

```bash
npm run test:rls    # sobe o container (se preciso) e roda a suíte
npm run rls:up      # só sobe o container
npm run rls:down    # derruba
```

A suíte roda com `--test-concurrency=1`: é tudo o mesmo banco, e dois arquivos em paralelo derrubam
o schema um do outro no meio da execução.

## `teste-supabase-falso.sql` nunca vai para o Supabase

`db/teste-supabase-falso.sql` recria o que a plataforma dá pronto — o schema `auth`, a função
`auth.jwt()` e os papéis `anon`/`authenticated`. Ele existe só para que um Postgres puro se pareça
com o Supabase. **Aplicá-lo no projeto real sobrescreveria objetos da plataforma.**

No Supabase aplicam-se apenas, nesta ordem: `schema.sql` (ou `migracao-v8-uuid.sql`, num banco que
já existe), `rls.sql` e `sincronizacao.sql`.

**Mas ele precisa imitar a plataforma de verdade, e não um Postgres puro.** O Supabase concede
`ALL` a `anon` e `authenticated` em toda tabela do schema, por default privilege. Enquanto o falso
não reproduzia isso, o container nascia mais fechado que a produção e a suíte dava verde num estado
que não existe: o `REVOKE` do `rls.sql` citava só `anon`, e `authenticated` ficava com `TRUNCATE` e
`TRIGGER` em todas as tabelas. **`TRUNCATE` ignora RLS.** Só apareceu ao aplicar no projeto real,
em 13/09/2026 — e hoje três testes pegam.

## Os arquivos

| Arquivo | O que prova |
|---|---|
| `fundacao.test.js` | O schema aplica inteiro, o seed entra, e as claims do token chegam ao banco como o PostgREST as entrega |
| `uuid.test.js` | A coluna `uuid` existe nas quatro tabelas, aceita nulo e o índice único recusa repetição — a idempotência da sincronização |
| `tentativas.test.js` | `registrar_tentativa` conta só a janela de 15 min, zera no acerto, e a tabela não é legível por ninguém |
| `identidade.test.js` | `auth_id_valido` aplica o corte de sessão igual ao backend, e os perfis vêm do banco, não do JWT |
| `grants.test.js` | `anon` não lê nada, a coluna `senha` não sai nem para o dono, ninguém tem `TRUNCATE`/`TRIGGER`, o RLS está ligado em toda tabela alcançável e o `rls.sql` pode ser reaplicado |
| `leitura.test.js` | O aluno lê o próprio e nada do vizinho; o professor lê os alunos |
| `escrita.test.js` | O aluno só cria sessão e pedido para si, não escreve ficha e não se promove |
| `sincronizar.test.js` | A subida é atômica, idempotente e não escapa do RLS |

`ajuda.js` tem a infraestrutura (`abrirBanco`, `conectarComo`, `conectarAnon`, `recusa`) e
`cenario.js`, o cenário compartilhado pelas três últimas: dois alunos, um professor, um admin e um
inativo, com ficha e sessão para cada aluno.
