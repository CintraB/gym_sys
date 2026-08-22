# Roadmap

O que falta para o Gym Sys sair de "funciona na minha máquina" para "roda na academia".

Ordenado por dependência, não por vontade: cada bloco destrava o seguinte.

---

## 1. Colocar no ar em casa

O aplicativo está pronto o suficiente para uso real. O que falta é infraestrutura.

### 1.1 Subir no PC servidor

- [ ] Instalar Node 20+, Docker e Caddy na máquina que vai ficar ligada
- [ ] Rodar o passo a passo de [`deploy/README.md`](deploy/README.md)
- [ ] `HOST_BIND=127.0.0.1` e `PROXIES_CONFIAVEIS=1` no `.env` — sem os dois, o
      HTTPS vira decoração e o limite de login trava todos os usuários juntos
- [ ] Senha do banco e `TOKEN_SEG` novos, diferentes dos de desenvolvimento
- [ ] IP fixo para o servidor no roteador

### 1.2 HTTPS

Sem TLS o token de login viaja em texto claro pela rede. O `Caddyfile` já está
pronto com duas opções:

- [ ] **CA interna** — funciona offline, mas exige instalar o certificado em
      cada aparelho
- [ ] **DuckDNS + Let's Encrypt** — certificado público, nada a instalar

### 1.3 Acesso de fora da rede — só suas máquinas

Requisito: você acessar de fora, sem expor o sistema para a internet.

- [ ] **Tailscale** no PC servidor e no seu celular

Por que Tailscale e não abrir porta no roteador:

| | Tailscale | Porta aberta |
|---|---|---|
| Exposto à internet | nada | a API inteira |
| Funciona com CGNAT | sim | não |
| Configuração no roteador | nenhuma | port forward + IP fixo |
| Quem alcança | só seus aparelhos | qualquer varredura |

Como as operadoras brasileiras usam CGNAT na maioria dos planos residenciais,
port forward provavelmente nem seria possível sem contratar IP fixo.

**Quando os alunos entrarem**, isso deixa de servir — não dá para pedir que cada
aluno instale VPN. Aí o caminho é Cloudflare Tunnel, e os itens de segurança da
seção 3 passam a ser pré-requisito, não melhoria.

### 1.4 Backup

- [ ] `pg_dump` diário para fora do container
- [ ] Testar a restauração pelo menos uma vez — backup não testado não é backup

---

## 2. Painel de administração

Hoje não existe nível acima de professor: qualquer professor cadastra outro
professor, e não há como gerenciar contas de verdade.

A tabela `admin_user` já está no schema, sem uso — foi prevista na modelagem
original justamente para isso.

### 2.1 Autenticação e papel

- [x] **Flag `admin` no `usuario`**, e não a tabela `admin_user` — que segue sem
      uso, de propósito: um terceiro caminho de autenticação seria superfície
      de ataque a mais por pouco ganho
- [x] `exigirPerfil('admin')` — o middleware já era parametrizado, aceitou direto
- [x] Área `/admin` no front, no mesmo padrão de professor e aluno

### 2.2 Gestão de usuários

- [x] Listar todos, com filtro por perfil e status
- [x] **Trocar e redefinir senha** — `PUT /me/senha` com a senha atual, e o
      admin redefinindo a de quem esqueceu. Trocar a senha derruba as sessões
      abertas, comparando o `iat` do token com `sessoes_invalidadas_em`
- [x] Editar dados de qualquer usuário — `PUT /admin/usuarios/:id`
- [x] **Trocar o login** — o CPF é o login, então alterá-lo derruba as sessões
      abertas da pessoa, pelo mesmo corte da senha. Quem troca o próprio recebe
      um token novo; a conta de outro não devolve token nenhum
- [x] Promover e rebaixar perfis (aluno ↔ professor ↔ admin), com quatro travas
      contra o sistema ficar sem administrador
- [ ] Excluir de verdade, além do desativar

### 2.3 Gestão do sistema

- [x] **Cadastrar exercícios** — `POST /professores/exercicios`, com o atalho
      "+ Novo" dentro do Montar Treino. O grupo muscular continua fechado nos
      que já existem; criar grupo novo segue sendo caso de banco
- [ ] Editar e desativar exercícios do catálogo
- [ ] Auditoria: a coluna `atualizado_por` é preenchida mas nunca lida
- [ ] Tela de saúde: contagem de registros, última sessão, espaço do banco

---

## 3. Segurança antes de abrir para os alunos

Já resolvido: limite de tentativas de login, autorização por perfil conferida
no banco, senha em scrypt, erro do banco que não vaza para o cliente, e uma
suíte de 35 testes de segurança.

Falta:

- [x] **Troca de senha** (também em 2.2) — feita, com invalidação das sessões
      anteriores: sem ela o JWT de sete dias sobreviveria à troca
- [ ] **Token em cookie `httpOnly`** no lugar do `localStorage`. Depende da
      seção 1.2: com front e API na mesma origem sob HTTPS, vira mudança
      pequena e sem CSRF
- [ ] Expiração de token menor que os 7 dias atuais, com renovação silenciosa
- [ ] Registro de tentativas de login para enxergar ataque em curso

---

## 4. Buracos funcionais

Coisas que a operação do dia a dia vai cobrar.

### 4.1 Treino

- [x] **Editar treino existente** — `PUT /professores/treino/:id`, pelo botão
      "Editar" no painel do treino atual. Edita no lugar: o treino continua o
      mesmo, e o que sai é desativado, não apagado
- [ ] Duplicar treino de um aluno para outro, ou de um bloco para outro
- [ ] Modelos de treino reaproveitáveis
- [ ] Reordenar exercícios dentro do bloco (hoje a ordem é a de cadastro)
- [ ] Validade do treino — a ficha de papel tem "27/07/26 a 27/10/26" e o
      sistema ignora isso

### 4.2 Execução

- [ ] Anotar a carga que foi realmente usada, que costuma diferir da prescrita
- [ ] Evolução de carga por exercício ao longo do tempo — o dado já está sendo
      gravado, falta a tela
- [ ] Descanso entre séries com aviso

### 4.3 Acompanhamento

- [ ] Peso e medidas do aluno com histórico
- [ ] Aviso de treino vencido ou aluno sumido para o professor
- [ ] Exportar ficha em PDF, para quem prefere papel

---

## 5. Qualidade técnica

- [x] **Testes de frontend** — Vitest + Testing Library: 64 testes cobrindo
      `formato.ts`, os hooks, a autorização de rota e o render das nove telas.
      Com o backend, **267 no total** (203 + 64), e os 203 rodam em dois bancos.
      Foi a tela preta que motivou — o build passava porque nada renderizava
      componente
- [ ] **Testar os interceptors de `api.ts`** — o token no cabeçalho e o 401
      derrubando a sessão. A suíte do front mocka `src/lib/api.ts` inteiro, e
      é justamente esse módulo que os contém, então ficam de fora. Exige MSW,
      ou testar o módulo sem o mock
- [ ] **Interações de formulário no front** — montar treino ponta a ponta,
      login com erro, o modal de novo exercício. Hoje a suíte garante que as
      telas montam, não que os fluxos funcionam
- [ ] **Error boundary** no React — hoje um erro de renderização apaga a tela
      inteira sem dizer nada ao usuário
- [ ] Paginação em alunos e professores (do TO DO original)
- [ ] Remover os aliases em `GET` de `/treino/inativar/:id` e
      `/treino/reativar/:id`, que continuam por compatibilidade
- [ ] Índice em `sessao_exercicio (id_sessao)` quando o volume crescer

---

## 6. App Android standalone, com o banco dentro

Objetivo, dito em 20/08/2026: **um APK para usar no telefone, offline, com o banco embutido e o
usuário já cadastrado — para ver como o sistema se comporta em campo.**

Não é o PWA com cache de leitura, nem acesso remoto ao PC. É o app rodando sozinho.

O desenho completo está em
[`docs/superpowers/specs/2026-08-22-app-android-standalone-design.md`](docs/superpowers/specs/2026-08-22-app-android-standalone-design.md).

### 6.1 O que o spike de 20/08 provou, e o que as sondas de 22/08 mudaram

Rodei um **controller real do backend** dentro de um bundle de browser, com o `schema.sql` e o
`seed.sql` de verdade. Listou os 77 exercícios e aplicou a normalização de nome
(`prancha lateral` → `PRANCHA LATERAL / ABDOMEN`). Sem reimplementar regra nenhuma.

Isso decide o que mais importa, e não se reabre: o APK leva **as regras verdadeiras**, cobertas pelos
testes de backend que já existem — e não uma imitação delas no cliente.

O que **mudou** foi o banco. O spike usava `pg-mem`, um Postgres em memória, e as sondas de 22/08
mostraram que a persistência sairia caro: dá para salvar e recarregar as tabelas, mas o contador de
`id` volta a 1 e colide com as linhas restauradas no primeiro cadastro novo. `setval`,
`ALTER SEQUENCE`, trocar o `DEFAULT` da coluna e inserir pela API do emulador — nenhum funciona.
Sobrariam duas gambiarras: queimar o contador com inserções que falham de propósito, ou renumerar
tudo traduzindo as chaves estrangeiras à mão.

Por isso o APK usa **SQLite nativo**: um arquivo, com a persistência a cargo do próprio motor, e
nada de contador para reacertar. O custo é traduzir o dialeto — medido em 43 consultas, com o `$1` do
PostgreSQL correspondendo ao `?1` do SQLite. De quebra, o APK **ganha** a trava de uma sessão aberta
por aluno, que o `pg-mem` perde por bug de índice parcial.

**Falta portar três arquivos de borda, e só eles.** Nenhum controller muda:

| Peça | Por quê | Substituto |
|---|---|---|
| `src/lib/senha.js` | `node:crypto` (scrypt) e `node:util` | `scrypt-js`, mantendo o formato `sal:hash` |
| `src/config/env.js` | `dotenv` puxa `path`/`fs` | configuração fixa embutida |
| `src/config/db.js` | `import pg` estático arrasta `net`/`events`, mesmo com o pool injetado | o driver SQLite do aparelho |

O `criarApp` do Express também não vai junto: entra um roteador mínimo no lugar, mapeando
método + caminho para o controller (~40 linhas). A fachada `db` já é injetável — foi feita assim
para os testes, e é o que torna isto barato. Nas telas, nada muda: a interceptação é no adapter do
axios, que preserva os interceptors de token e de 401.

### 6.2 A incerteza que resta

- [ ] **`scrypt-js` no celular.** É JS puro, e scrypt é lento de propósito. Medido no PC: **133 ms
      por operação, contra 27 ms do nativo** — cinco vezes mais lento. Num celular três vezes mais
      lento que o PC, o login fica em torno de meio segundo, o que resolve a dúvida na prática.
      Confirmar no aparelho na leva 3; se doer, baixar o custo resolve, mas faz o hash divergir do
      backend

A persistência saiu desta lista: com SQLite ela é do motor.

### 6.3 Plano, em três levas

Cada uma entrega algo verificável sozinha:

- [x] **Leva 1 — o banco do APK, provado sem Android.** Tradutor de dialeto, driver SQLite com a
      interface do pool do `pg`, e os 203 testes rodando nos dois bancos (`npm test` e
      `npm run test:sqlite`). Nenhuma divergência, e nenhum controller alterado
- [x] **Leva 2 — núcleo portável.** Os três arquivos de borda, o roteador no lugar do Express e o
      adapter do axios, cobertos por teste: o login roda ponta a ponta com controller de verdade,
      senha em scrypt e SQLite, sem Express e sem Node. `npm run build:standalone` empacota, e um
      script confere que o núcleo entrou no bundle e que `dotenv`, `pg` e `node:crypto` ficaram fora
- [ ] **Leva 3 — Capacitor e APK.** Empacota, nasce com a conta dele cadastrada (admin + professor
      + aluno), alunos de exemplo e um treino montado, e instala no telefone

### 6.4 O que fica de fora

- **Sincronizar com o servidor.** O app standalone e a instância de casa seriam dois bancos
  separados, sem conversa. Juntar os dois é outra arquitetura — ids locais versus ids do servidor,
  fila de escrita, resolução de conflito. Só encarar se, depois de usar em campo, isso virar
  necessidade real.
- **PWA com cache de leitura** e **Tailscale**: resolvem outro problema (o app real, com o PC
  ligado). O Tailscale continua valendo pelo item 1.3, mas não atende a este objetivo.


## 7. Se um dia virar produto

Fora do escopo de uso doméstico, anotado para não se perder:

- [ ] Múltiplas academias no mesmo sistema
- [ ] Controle de mensalidade e vencimento
- [ ] Aplicativo nativo publicado nas lojas — diferente da seção 6, que é para uso próprio
- [ ] Notificação push de treino novo e de pedido atendido

---

## Ordem sugerida

1. **Seção 1** — tirar do notebook e colocar no servidor, com Tailscale
2. **Segurança** (3) — obrigatória antes de qualquer acesso externo de terceiros

A **seção 6** (app Android standalone) é independente das outras: não depende do servidor de casa
estar de pé, e o spike de 20/08 já derrubou a dúvida principal. Dá para encarar a qualquer momento.
