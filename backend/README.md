# Gym Sys - Backend

API RESTful em Node.js (Express + PostgreSQL) para gestão de treinos, alunos e professores.

Faz parte do monorepo [gym_sys](https://github.com/CintraB/gym_sys) — veja o
[README principal](../README.md) para a visão geral.

Requer **Node.js 20 ou superior**.

## Instalação

```plaintext
git clone https://github.com/CintraB/gym_sys
cd gym_sys/backend
npm install
```

## Modo demo (sem PostgreSQL)

Para experimentar a aplicação sem instalar banco nenhum:

```plaintext
npm run demo
```

Sobe a API com um PostgreSQL em memória, já populado com professor, alunos, um treino montado e um
pedido em aberto. Nada é salvo em disco.

| Perfil | CPF | Senha |
|---|---|---|
| Admin, professor e aluno | `111.111.111-11` | `demo123` |
| Aluno | `222.222.222-22` | `demo123` |

## Configuração

```plaintext
cp .env.example .env
```

```plaintext
PORTA=8080
HOST_BIND=0.0.0.0
DB_USER=
DB_HOST=localhost
DB_NAME=
DB_PASSWORD=
DB_PORT=5432
TOKEN_SEG=
JWT_EXPIRACAO=7d
ENABLE_CORS=http://localhost:5173
PROXIES_CONFIAVEIS=0
LIMITE_LOGIN_JANELA_MS=900000
LIMITE_LOGIN_MAXIMO=20
LIMITE_GERAL_JANELA_MS=60000
LIMITE_GERAL_MAXIMO=300
```

As variáveis do banco usam o prefixo `DB_` de propósito: nomes como `USER` e `HOST` já existem no
ambiente em Linux/macOS, e o `dotenv` não sobrescreve o que já está definido — o `.env` seria
ignorado em silêncio. A aplicação falha na inicialização, com mensagem clara, se faltar alguma.

`TOKEN_SEG` é o segredo de assinatura do JWT. Gere o seu:

```plaintext
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

`ENABLE_CORS` é uma lista de origens separadas por `;`. Vazio significa nenhuma origem liberada.

## Banco de dados

### Com Docker (recomendado para desenvolver)

```plaintext
npm run db:up
```

Sobe um PostgreSQL 16 em container e, **na primeira vez**, aplica schema, triggers e seed
automaticamente. O comando só retorna quando o banco está aceitando conexões.

| Comando | O que faz |
|---|---|
| `npm run db:up` | Sobe o banco |
| `npm run db:down` | Para o banco, **preservando** os dados |
| `npm run db:reset` | **Apaga** os dados e recria do zero |
| `npm run db:logs` | Acompanha o log do Postgres |
| `npm run db:psql` | Abre um `psql` dentro do container |

Os dados ficam no volume `gymsys-dados` e sobrevivem a `db:down` e a reinícios da máquina. Usuário,
senha, banco e porta saem do mesmo `.env` que a API usa — os defaults (`gymsys`/`gymsys`/`gymsys`)
funcionam sem configurar nada.

Como os scripts de init só rodam quando o volume é criado, mudar `db/schema.sql` depois disso não
tem efeito sozinho: use `npm run db:reset` (perde os dados) ou aplique a alteração via `db:psql`.

### Sem Docker

Banco novo, nesta ordem:

```plaintext
psql -U <usuario> -d <banco> -f db/schema.sql
psql -U <usuario> -d <banco> -f db/triggers.sql
psql -U <usuario> -d <banco> -f db/seed.sql
```

Migrações, para bancos que já têm dados — aplicar na ordem, e só as que faltam:

| Arquivo | O que faz |
|---|---|
| `db/migracao-v2.sql` | PK em `ex_usuario` e vínculo com `treino` |
| `db/migracao-v3-sessoes.sql` | Tabelas de execução de treino |
| `db/migracao-v4-blocos.sql` | Divisão em blocos A/B/C/D |
| `db/migracao-v5-edicao-treino.sql` | `ativo` em `treino_bloco`, para o `PUT` de treino |
| `db/migracao-v6-admin.sql` | perfil de `admin` e `senha_alterada_em` |

O `seed.sql` popula o catálogo com 77 exercícios e roda **uma vez só** — a ordem das linhas define
os `id_exercicio`. Os triggers ficam separados porque preenchem `atualizado_em` via plpgsql, que o
banco emulado dos testes não executa.

Se você **já tem um banco** da versão anterior, use a migração em vez do schema (faça backup antes):

```plaintext
pg_dump -U <usuario> <banco> > backup.sql
psql -U <usuario> -d <banco> -f db/migracao-v2.sql
```

Ela dá chave primária a `ex_usuario`, cria a coluna `id_treino` e liga cada exercício ao treino do
respectivo aluno. Como esse vínculo não existia, o backfill é o melhor palpite possível; o próprio
arquivo indica o que conferir antes de fechar as constraints.

### Detalhes do modelo

- Timestamps são `criado_em` / `atualizado_em`.
- O grupo muscular do exercício é a coluna `tipo` (`PEITO`, `COSTAS`, `CÁRDIO`, …).
- `nome_exercicio` não é único: `CROSS OVER` aparece em BÍCEPS e em TRÍCEPS.
- `usuario.titulo` é obrigatório, 12 dígitos.
- Exercícios de cardio são gravados sem séries, repetições nem carga — só com a observação de tempo
  e intensidade.
- `treino` é a **prescrição** do professor, `treino_bloco` é cada dia dela
  (A/B/C/D), e `sessao_treino` é **cada vez que um bloco foi executado**. Um
  índice único parcial garante no máximo uma sessão em andamento por aluno.
- Todo treino tem pelo menos um bloco: sem divisão, vira um "A" sozinho. Assim
  nenhuma consulta precisa tratar exercício fora de bloco.
- `aluno`, `professor` e `admin` são flags independentes — a mesma pessoa pode
  ter as três. O cargo principal, que decide para onde o app abre, é
  admin > professor > aluno.
- A duração de uma sessão é sempre calculada no servidor a partir de `iniciado_em`. O corpo da
  requisição de finalizar é ignorado: não há como o cliente inflar o tempo.

As rotas de cadastro exigem um token do perfil que se quer criar, então em banco novo o primeiro
usuário sai por script:

```plaintext
npm run criar-admin -- --cpf 12345678901 --nome "Seu Nome" --senha "suaSenha" --email voce@exemplo.com --titulo 123456789012
npm run criar-professor -- --cpf 98765432100 --nome "Outro Nome" --senha "outraSenha" --email outro@exemplo.com --titulo 987654321000
```

O `criar-admin` nasce com os três perfis: quem administra este sistema também dá aula e treina na
academia. `--sem-aluno` cria só admin e professor.

### Dados de exemplo

Para ter com o que testar sem cadastrar tudo à mão:

```plaintext
npm run dados-exemplo
```

Cria dois professores e cinco alunos em situações diferentes — com treino, com pedido em aberto,
com histórico, sem nada e inativo. Pode rodar mais de uma vez: quem já existe é pulado, e o script
nunca sobrescreve nem apaga.

| Perfil | CPF | Situação |
|---|---|---|
| professor | `111.111.111-11` | Cristhian Cintra |
| professor | `999.999.999-11` | Marina Alves |
| aluno | `222.222.222-22` | Ana Souza — treino de superiores |
| aluno | `333.333.333-33` | Bruno Lima — pedido em aberto, sem treino |
| aluno | `444.444.444-44` | Carla Dias — treino atual + histórico |
| aluno | `555.555.555-55` | Diego Rocha — sem treino e sem pedido |
| aluno | `666.666.666-66` | Elaine Costa — inativa, login recusado |

Senha `senha123` para os usuários que o script criar. Não use em banco com dados reais: as contas
nascem com senha conhecida.

## Execução

```plaintext
npm run dev     # desenvolvimento, com reload
npm start       # produção
npm test        # suíte de testes (151)
```

Os testes rodam sobre um PostgreSQL em memória — não precisam de banco nem de `.env`.
`test/seguranca.test.js` verifica falsificação de token, escalada de privilégio, acesso a dados de
terceiros, injeção de SQL, limites de payload, CORS e vazamento de informação em mensagens de erro.

Por padrão o servidor escuta em `0.0.0.0`, então responde também pelo IP da máquina na rede local —
é assim que o celular alcança a API. Atrás de um proxy reverso, mude para `HOST_BIND=127.0.0.1`.

## Limite de tentativas

`POST /login` aceita 20 tentativas malsucedidas por janela de 15 minutos, contadas por IP **e** CPF.
Logins corretos não consomem o limite, e travar um CPF não impede outra pessoa da mesma rede de
entrar. Há também um teto geral de 300 requisições por minuto por IP. Tudo ajustável pelo `.env`.

Atrás de proxy reverso, defina `PROXIES_CONFIAVEIS=1` — senão o Express lê o IP do proxy, o limite
vira global e um único atacante tranca todos os usuários.

Os contadores ficam em memória: valem para um processo só, que é o caso deste deploy.

## HTTPS

O token trafega no cabeçalho `Authorization`; sem TLS ele vai em texto claro pela rede. A pasta
[`deploy/`](../deploy/README.md) tem um `Caddyfile` pronto que resolve isso e ainda coloca front e
API na mesma origem.

## Autenticação

`POST /login` devolve um JWT. As demais rotas exigem `Authorization: Bearer <token>`.

O token carrega apenas `id` e `cargo`; o perfil é reconferido no banco a cada requisição, de modo que
desativar um usuário invalida a sessão dele imediatamente. Validade padrão de 7 dias
(`JWT_EXPIRACAO`).

## Endpoints

### Públicos

| Verbo | Rota | Descrição |
|---|---|---|
| GET | `/` | Status do serviço |
| GET | `/health` | Health check |
| POST | `/login` | Autentica e devolve token |

```json
{ "cpf": "99999999999", "senha": "senha123" }
```

Resposta: `{ "token": "...", "usuario": { "id": 1, "nome": "...", "cpf": "...", "cargo": "professor", "ativo": true } }`

### Autenticado (qualquer perfil)

| Verbo | Rota | Descrição |
|---|---|---|
| GET | `/me` | Perfil do usuário do token |

A resposta traz `cargo` (o perfil principal, que decide onde o app abre) e
`perfis`, com as duas capacidades. A mesma pessoa pode ser professor **e**
aluno — o caso de quem dá aula e também treina — e nesse caso alcança as duas
áreas.

### Aluno (`/alunos`)

| Verbo | Rota | Descrição |
|---|---|---|
| GET | `/alunos/meutreino` | Treino ativo com os exercícios |
| GET | `/alunos/historico` | Treinos prescritos anteriores |
| GET | `/alunos/pedidotreino` | Pedido em aberto, se houver |
| POST | `/alunos/pedidotreino` | Solicita novo treino |
| GET | `/alunos/treino/sessao` | Sessão em andamento, ou `null` |
| POST | `/alunos/treino/sessao` | Inicia o treino |
| DELETE | `/alunos/treino/sessao` | Descarta a sessão em andamento |
| POST | `/alunos/treino/sessao/finalizar` | Finaliza e grava a duração |
| PUT | `/alunos/treino/sessao/exercicio/:id` | Marca/desmarca um exercício |
| GET | `/alunos/sessoes` | Histórico de treinos executados |
| GET | `/alunos/sessoes/:id` | Detalhe de uma sessão |

O aluno vem do token — nenhuma dessas rotas recebe id.

```json
{ "observacao": "machucado na patela (joelho esquerdo)" }
```

Só é permitido um pedido em aberto por aluno (`409` no segundo).

### Professor (`/professores`)

| Verbo | Rota | Descrição |
|---|---|---|
| GET | `/professores/resumo` | Contadores do painel |
| GET | `/professores/alunos` | Lista alunos — aceita `?busca=` e `?incluirInativos=true` |
| POST | `/professores/alunos` | Cadastra aluno |
| GET | `/professores/aluno/:id` | Aluno por ID |
| PUT | `/professores/aluno/:id` | Altera cadastro do aluno |
| GET | `/professores/aluno/:id/treino` | Treino ativo do aluno |
| GET | `/professores/aluno/:id/sessoes` | Frequência e treinos executados |
| PUT | `/professores/alunos/desativar` | Desativa usuário por CPF |
| PUT | `/professores/alunos/reativar` | Reativa usuário por CPF |
| POST | `/professores/usuario/cpfoutitulo` | Busca usuário por CPF ou título |
| GET | `/professores/professores` | Lista professores |
| POST | `/professores/professores` | Cadastra professor |
| GET | `/professores/professor/:id` | Professor por ID |
| PUT | `/me/senha` | Troca a senha do próprio usuário |
| GET | `/admin/usuarios` | Lista todos, com filtro por perfil e status |
| PUT | `/admin/usuarios/:id/senha` | Admin redefine a senha de alguém |
| GET | `/professores/exercicios` | Catálogo de exercícios |
| POST | `/professores/exercicios` | Acrescenta um exercício ao catálogo |
| POST | `/professores/treino` | Cadastra treino |
| PUT | `/professores/treino/:id` | Edita o treino no lugar |
| GET | `/professores/treino/pedidos` | Pedidos em aberto |
| POST | `/professores/treino/pedido/finalizado` | Finaliza um pedido |
| PUT | `/professores/treino/inativar/:id` | Inativa os treinos do aluno |
| PUT | `/professores/treino/reativar/:id` | Reativa os treinos do aluno |

Cadastro de aluno ou professor:

```json
{
  "cpf": "99999999999",
  "nome": "joao",
  "senha": "senha123",
  "email": "email@email.com",
  "titulo": "555555555555"
}
```

CPF e título são normalizados no servidor — podem chegar com máscara. Título é obrigatório (12
dígitos, coluna `NOT NULL`); senha exige no mínimo 6 caracteres.

Novo exercício no catálogo:

```json
{ "nome_exercicio": "prancha lateral", "tipo": "ABDOMEN", "observacao": "Cotovelo sob o ombro" }
```

Nome e grupo são gravados em maiúsculas, com os espaços aparados — o catálogo
inteiro é maiúsculo, e sem isso a mesma coisa apareceria duas vezes na listagem.
O grupo precisa ser um dos que já existem (400 se não for): grupo novo é caso de
banco, não de API. O nome é único **por grupo**, não no catálogo todo — 409 se
repetir; `CROSS OVER` existe em BÍCEPS e em TRÍCEPS. Devolve 201 com
`{ id_exercicio, nome_exercicio, tipo }`.

Cadastro de treino, dividido em blocos (o A/B/C/D das fichas):

```json
{
  "id_aluno": 6,
  "blocos": [
    {
      "nome": "Peito e Tríceps",
      "exercicios": [
        { "id_exercicio": 3, "numero_serie": 4, "repeticoes": "10 a 15", "carga": 20, "observacao_ex_usuario": "c/ isometria" },
        { "id_exercicio": 8, "numero_serie": 4, "repeticoes": "10 a 15", "carga": 15 }
      ]
    },
    { "nome": null, "exercicios": [ { "id_exercicio": 58, "numero_serie": 4, "repeticoes": "8 a 10", "carga": 60 } ] }
  ]
}
```

A letra de cada bloco vem da posição no array (A, B, C…), nunca do que o cliente
mandar — assim não dá para criar dois blocos "A" nem pular letra. O nome é
opcional; em branco, a tela mostra só "Treino A". Máximo de 8 blocos.

O formato antigo, com `exercicios` na raiz, continua aceito e vira um bloco "A"
único.

O professor é obtido do token — `id_professor` no corpo é ignorado. Salvar um treino desativa o
treino anterior do aluno e encerra o pedido em aberto dele, na mesma transação.

Edição do treino (`PUT /professores/treino/:id`) usa o mesmo corpo, sem `id_aluno` e com a
identidade de cada linha:

```json
{
  "blocos": [
    {
      "id_bloco": 7,
      "nome": "Peito e Tríceps",
      "exercicios": [
        { "id": 31, "id_exercicio": 3, "numero_serie": 4, "repeticoes": "10 a 15", "carga": 45 },
        { "id_exercicio": 8, "numero_serie": 3, "repeticoes": "12", "carga": 15 }
      ]
    }
  ]
}
```

Com `id`/`id_bloco`, atualiza a linha que já existe; **sem**, é acréscimo. O que não voltar no corpo
é desativado — nunca apagado, porque `sessao_exercicio` referencia `ex_usuario` com
`ON DELETE CASCADE` e apagar levaria junto o registro do que o aluno já executou. Um id que não seja
daquele treino é recusado com 400, antes de qualquer escrita.

Diferente do `POST`, o treino é o mesmo: não desativa nada nem encerra o pedido em aberto. As letras
continuam vindo da posição no array, então remover o B de um A/B/C faz o C virar B. Treino inativo
responde 409. Sessão em andamento não é bloqueada — ela já materializou as próprias linhas na
abertura, e a mudança vale da próxima.

Exercícios de cardio entram só com a observação: `numero_serie` 0, `repeticoes` e `carga` vazios.

```json
{ "id_exercicio": 36, "numero_serie": 0, "repeticoes": "", "carga": "", "observacao_ex_usuario": "20 min / moderado" }
```

Desativar/reativar usuário e finalizar pedido:

```json
{ "cpf": "88888888888" }
{ "id_pedido": 3 }
```

## Senhas e perfis

Há três perfis, e são flags independentes no `usuario`: `aluno`, `professor` e `admin`. A mesma
pessoa pode ter os três — quem administra o sistema, dá aula e treina na academia. O cargo principal,
que decide para onde o app abre, é **admin > professor > aluno**.

A tabela `admin_user` do schema **continua sem uso**, de propósito: usá-la significaria um segundo
caminho de autenticação, com login, token e middleware lidando com duas origens de identidade.

O primeiro admin nasce por `npm run criar-admin`, com os três perfis (ou só admin e professor, com
`--sem-aluno`).

Troca de senha:

```json
PUT /me/senha        { "senha_atual": "...", "senha_nova": "..." }
PUT /admin/usuarios/7/senha  { "senha_nova": "..." }
```

`/me/senha` **exige a senha atual**: sem isso, quem pega o aparelho destravado troca a senha e toma
a conta sem nunca ter sabido a original. Senha atual errada responde 401 com a mesma mensagem de
"não autenticado", para não confirmar que ela estava certa e outra coisa falhou.

A rota de admin **não** pede a senha atual — é o caso de quem esqueceu — e por isso mesmo **recusa a
própria conta do admin** com 403: para si ele usa `/me/senha`. Sem essa trava, a exigência da senha
atual viraria decorativa justamente para a conta que mais importa.

**Trocar a senha derruba as sessões abertas.** O `autenticar` compara o `iat` do token com
`usuario.senha_alterada_em`: token emitido antes vira 401. O JWT é stateless e vale sete dias, então
sem isso um token roubado sobreviveria à troca — o cenário exato em que a senha é trocada. A
comparação é estritamente menor porque `iat` tem resolução de segundos, e `/me/senha` devolve um
token novo para quem trocou não se desconectar. Coluna nula quer dizer "nunca trocou" e não invalida
nada, que é como toda linha nasce na migração.

## Erros

Toda resposta de erro tem o formato `{ "message": "..." }`. Detalhes internos (query, tabela,
constraint) nunca são devolvidos — vão para o log do servidor.

| Status | Quando |
|---|---|
| 400 | Dados inválidos |
| 401 | Token ausente, inválido, ou credenciais erradas |
| 403 | Perfil sem permissão para a rota |
| 404 | Recurso ou rota inexistente |
| 409 | Conflito (CPF duplicado, pedido já em aberto) |
| 500 | Erro interno |

## Tecnologias

Node.js · Express · PostgreSQL (`pg`) · `jose` (JWT) · `node:crypto` scrypt (senhas) · dotenv · cors
· `pg-mem` (testes e modo demo)
