# Painel de administração — design

**Data:** 20 de agosto de 2026
**Item do roadmap:** seção 2, "Painel de administração", e o item de troca de senha da seção 3

## Problema

Não existe nível acima de professor. Qualquer professor cadastra outro professor, e ninguém
gerencia contas de verdade.

E não existe troca de senha — nem pelo próprio usuário, nem por alguém no lugar dele. Senha
esquecida ou vazada só se resolve recriando o usuário ou mexendo direto no banco. É o buraco mais
visível do sistema.

## Decisões de arquitetura

### O perfil de admin é uma flag, não uma tabela

`usuario` ganha `admin BOOLEAN NOT NULL DEFAULT FALSE`, ao lado de `aluno` e `professor`.

A tabela `admin_user` está no schema desde a modelagem original e **continua sem uso** — é decisão,
não esquecimento. Usá-la significaria um segundo caminho de autenticação, com login, token e
middleware tendo de lidar com duas origens de identidade. É superfície de ataque a mais por pouco
ganho: o isolamento que ela daria não compensa o caminho paralelo que ela abre.

Com a flag, quase nada muda:

- `exigirPerfil()` já é parametrizado e aceita `'admin'` sem alteração
- `autenticar` passa a trazer a coluna na consulta que já faz
- `perfisDe()` no `authController` inclui `admin`
- `perfilDe()`, que decide para onde o app abre, passa a ser **admin > professor > aluno**

O primeiro admin nasce por `npm run criar-admin`, no molde do `criar-professor` que já existe pelo
mesmo motivo: a rota de criar admin exige token de admin.

### Trocar a senha derruba as sessões abertas

`usuario` ganha `senha_alterada_em TIMESTAMPTZ`.

O `autenticar` compara o `iat` do token com essa coluna: token emitido **antes** da última troca de
senha vira 401.

Isto não é refinamento. O JWT é stateless e vale sete dias, então sem essa checagem um token
roubado continua funcionando por até uma semana **depois** de a senha ser trocada — que é
exatamente o cenário em que se troca uma senha. Sem isso, "troquei a senha" daria uma sensação de
segurança que o sistema não entrega.

Detalhe de implementação que importa: `iat` tem resolução de segundos. A comparação é
`iat < floor(senha_alterada_em)`, estritamente menor, e a rota de troca devolve um token novo. Assim
um token emitido no mesmo segundo da troca sobrevive, e quem trocou a senha não se desconecta.

Dois pontos que a implementação precisa acertar, e que não são óbvios:

- **`senha_alterada_em` nasce `NULL`** para todos os usuários que já existem. `NULL` significa
  "nunca trocou": nenhum token é invalidado, e todo mundo continua logado depois da migração. A
  comparação precisa tratar isso, não virar uma comparação com `NULL` que derruba a sessão de todos.
- **A redefinição pelo admin também atualiza a coluna**, e portanto **também derruba as sessões
  daquele usuário**. É o comportamento desejado: se o motivo da redefinição foi conta comprometida,
  deixar a sessão do invasor de pé anularia o propósito. A tela avisa que a pessoa vai precisar
  entrar de novo.

### Quem pede a senha atual, e quem não pede

| Rota | Exige a senha atual? | Por quê |
|---|---|---|
| `PUT /me/senha` | **sim** | Sem isso, quem pega o celular destravado toma a conta |
| `PUT /admin/usuarios/:id/senha` | não | É justamente o caso de quem esqueceu a senha |

**O admin não redefine a própria senha pela rota de admin.** Ele usa `/me/senha`, como todo mundo,
com a senha atual. Sem essa trava, a exigência acima vira decorativa justamente para a conta que
mais importa.

Na redefinição, o admin digita a senha temporária e a repassa pessoalmente. Não há e-mail
configurado, e num servidor doméstico em rede local não vai haver tão cedo — um fluxo por link de
e-mail seria infraestrutura que não existe.

### Travas na gestão de perfis

Três, cada uma com teste de segurança próprio:

1. **O admin não retira o próprio `admin`.** Senão o sistema fica sem ninguém que o administre.
2. **Não é possível tirar o `admin` do último admin ativo**, mesmo sendo outra pessoa. Mesma razão,
   pela porta dos fundos.
3. **Os perfis vêm de uma lista fechada** (`aluno`, `professor`, `admin`). Nada mais no corpo da
   requisição toca a tabela — é a mesma regra que já vale no cadastro de aluno, onde mandar
   `professor: true` no corpo é ignorado.

Desativar um usuário também não pode deixar o sistema sem admin ativo: a regra 2 vale para
`desativarUsuario` do mesmo jeito.

## Divisão em duas levas

O escopo é grande demais para uma leva só. Cada uma entrega software funcionando por conta própria.

### Leva 1 — fundação e senhas

- Coluna `admin`, coluna `senha_alterada_em`, migração
- `perfilDe`/`perfisDe`/`autenticar` cientes do admin
- Invalidação de token por troca de senha
- `PUT /me/senha` (com senha atual)
- `PUT /admin/usuarios/:id/senha` (admin redefine)
- `GET /admin/usuarios` com filtro por perfil e status
- `npm run criar-admin`
- Front: área `/admin` com a tela de Usuários (listagem + redefinir senha), `TrocarArea` com a
  terceira área, e "Trocar minha senha" no Perfil de aluno e professor

Ao fim da leva 1 o sistema já resolve o buraco mais urgente: ninguém depende mais de SQL na mão
para uma senha esquecida.

### Leva 2 — gestão de usuários

- `PUT /admin/usuarios/:id` — editar dados de qualquer usuário, não só aluno
- `PUT /admin/usuarios/:id/perfis` — promover e rebaixar, com as três travas
- Front: edição e troca de perfil na tela de Usuários

## Fora das duas levas

- **Excluir usuário de verdade** — hoje tudo é desativação, e o histórico depende disso. Excluir de
  fato exige decidir o que fazer com treinos e sessões da pessoa, e isso é assunto próprio.
- **Auditoria** — `atualizado_por` é preenchido e nunca lido. Falta a tela.
- **Tela de saúde** do sistema.
- **Expiração de token menor com renovação silenciosa** — continua nos sete dias. A invalidação por
  troca de senha resolve o caso agudo; encurtar a validade é outra discussão.

## Critério de pronto (leva 1)

- `npm test` no backend e no frontend passam, com saída limpa
- Um teste de segurança para cada trava e para a invalidação de token
- `npm run lint` e `npm run build` no frontend continuam passando
- `npm run demo` sobe com um admin de exemplo
- Migração escrita para bancos que já existem
- `backend/README.md`, `frontend/README.md` e `ROADMAP.md` atualizados
