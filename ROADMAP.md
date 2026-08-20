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
      abertas, comparando o `iat` do token com `senha_alterada_em`
- [x] Editar dados de qualquer usuário — `PUT /admin/usuarios/:id`
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

- [x] **Testes de frontend** — Vitest + Testing Library: 59 testes cobrindo
      `formato.ts`, os hooks, a autorização de rota e o render das nove telas.
      Com o backend, 233 no total. Foi a tela preta que motivou — o build
      passava porque nada renderizava componente
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

## 6. Rodar no celular sem depender do PC

Pedido de 20/08/2026: **compilar o app para o telefone e testar tudo offline.**

"Offline" aqui tem três significados, com custos muito diferentes. Antes de escolher, vale separar
o que se quer de verdade: **testar no celular** ou **usar sem servidor**.

### 6.0 O atalho, se o objetivo for só testar

- [ ] **Tailscale + PC ligado** (já é o item 1.3) — o celular alcança o app **de verdade**, com o
      backend real, de qualquer lugar. Zero código, zero build.

Se o objetivo é testar, isto é melhor que qualquer simulação: exercita o sistema inteiro, não uma
imitação dele. Só não serve com o PC desligado.

### 6.1 PWA com leitura offline — quase pronto

- [ ] **HTTPS**, e o resto já existe. O `vite-plugin-pwa` está configurado, com `NetworkFirst`
      para `/alunos/meutreino`, `/alunos/sessoes` e `/me`. O service worker só registra em
      contexto seguro, então hoje, acessando pelo IP em HTTP, ele fica inerte — depende do 1.2

Entrega: instala como app, abre sem rede e mostra o **último treino visto**. Marcar exercício,
finalizar sessão e qualquer escrita continuam exigindo servidor. É cache de leitura, não app
offline.

### 6.2 Modo demo embutido — testar tudo sem servidor nenhum

- [ ] Um build alternativo (`npm run build:demo`) que troca `src/lib/api.ts` por uma
      implementação em memória, com os dados em IndexedDB para sobreviver ao fechar o app
- [ ] Empacotar com **Capacitor** num APK, ou instalar como PWA

São ~25 endpoints a implementar no cliente. É mais barato do que parece por causa de uma decisão que
já está tomada: **toda chamada passa por `src/lib/api.ts`**, e a suíte de testes do front já prova
que substituir esse módulo basta para as nove telas funcionarem.

**O custo honesto:** as regras de negócio passam a existir em dois lugares. Um treino salvo aqui não
é o mesmo caminho de código que o backend executa, então isto testa a **interface e o fluxo**, não o
sistema. Serve para mexer no app no ônibus; não serve para validar que o backend está certo.

### 6.3 Offline de verdade, com sincronização

- [ ] Dados no aparelho, fila de escrita e sincronização quando a rede volta

Isto é outra arquitetura, não um build diferente: exige ids locais versus ids do servidor, resolução
de conflito e um modelo de dados que aguente divergir. Só faz sentido se a academia tiver ponto sem
sinal e o aluno precisar treinar ali. **Não fazer antes de essa necessidade aparecer de verdade.**

### Sugestão

Fazer **6.0** primeiro, que já estava no plano e não custa código. Se depois de usar por um tempo
ainda incomodar depender do PC ligado, aí sim **6.2** — que é o que atende "testar tudo no
telefone". O **6.3** só com um caso real na mão.

---

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

O **6.0** sai junto do item 1: Tailscale já está lá, e é o que põe o app no celular sem
escrever código. O resto da seção 6 só depois de usar assim por um tempo.
