import { db } from "../config/db.js";
import { criarHashComSal } from "../lib/senha.js";
import {
  asyncHandler,
  erroConflito,
  erroNaoEncontrado,
  erroProibido,
  erroRequisicao,
} from "../lib/erros.js";
import { normalizarDigitos } from "../lib/validacao.js";
import { tokenAposTrocaDeLogin } from "../lib/sessao.js";

// A senha jamais entra aqui. É a mesma lista do professorController, com admin.
const CAMPOS_PUBLICOS = "id, nome, cpf, email, titulo, aluno, professor, admin, ativo";

const PERFIS = ["aluno", "professor", "admin"];

const TAMANHO_MINIMO_SENHA = 6;

/**
 * Lista todos os usuários, com filtro por perfil e status.
 *
 * É a única visão do sistema inteiro: o professor só enxerga alunos.
 */
export const listarUsuarios = asyncHandler(async (req, res) => {
  const perfil = (req.query.perfil ?? "").toString().trim();
  const status = (req.query.status ?? "").toString().trim();
  const busca = (req.query.busca ?? "").toString().trim();

  const condicoes = [];
  const valores = [];

  // Lista fechada porque o nome do perfil vira nome de coluna dentro da SQL.
  // Interpolar o que o cliente mandou seria injeção pelo nome do campo — o
  // único lugar do projeto onde um valor de query chega perto disso.
  if (perfil) {
    if (!PERFIS.includes(perfil)) {
      throw erroRequisicao("Perfil inválido");
    }
    condicoes.push(`${perfil} = TRUE`);
  }

  if (status === "ativos") condicoes.push("ativo = TRUE");
  if (status === "inativos") condicoes.push("ativo = FALSE");

  if (busca) {
    valores.push(`%${busca}%`, `%${normalizarDigitos(busca) || busca}%`);
    condicoes.push(`(nome ILIKE $${valores.length - 1} OR cpf LIKE $${valores.length})`);
  }

  const onde = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
  const { rows } = await db.query(
    `SELECT ${CAMPOS_PUBLICOS} FROM usuario ${onde} ORDER BY nome`,
    valores
  );

  res.json(rows);
});

/**
 * Redefine a senha de outro usuário, sem pedir a senha atual — é o caso de
 * quem esqueceu.
 *
 * Não serve para o próprio admin: para si mesmo ele usa PUT /me/senha, com a
 * senha atual. Sem esta trava, a exigência da senha atual viraria decorativa
 * justamente para a conta que mais importa.
 *
 * Gravar `sessoes_invalidadas_em` derruba as sessões abertas daquele usuário. É
 * intencional: se a redefinição foi por conta comprometida, deixar a sessão do
 * invasor de pé anularia o propósito.
 */
export const redefinirSenha = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const senhaNova = typeof req.body?.senha_nova === "string" ? req.body.senha_nova : "";

  if (senhaNova.length < TAMANHO_MINIMO_SENHA) {
    throw erroRequisicao(`A senha nova deve ter ao menos ${TAMANHO_MINIMO_SENHA} caracteres`);
  }
  if (id === req.usuario.id) {
    throw erroProibido("Use a troca de senha comum para a sua própria conta");
  }

  const hash = await criarHashComSal(senhaNova);
  const { rows } = await db.query(
    `UPDATE usuario SET senha = $1, sessoes_invalidadas_em = NOW(), atualizado_por = $2
      WHERE id = $3
      RETURNING ${CAMPOS_PUBLICOS}`,
    [hash, req.usuario.id, id]
  );

  if (rows.length === 0) {
    throw erroNaoEncontrado("Usuário não encontrado");
  }

  res.json({ message: "Senha redefinida. A pessoa precisará entrar de novo.", usuario: rows[0] });
});

/**
 * Altera os dados de qualquer usuário.
 *
 * A rota do professor (`PUT /professores/aluno/:id`) só alcança aluno; esta
 * alcança qualquer conta, inclusive a do próprio admin.
 *
 * A lista de campos é fechada: perfis, `ativo` e `senha` não entram por aqui,
 * mesmo que venham no corpo. Perfil tem rota própria, com as travas; senha tem
 * duas; e `ativo` continua sendo desativar/reativar, que propagam para treino e
 * exercícios.
 */
export const alterarUsuario = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  const campos = {
    nome: typeof req.body?.nome === "string" ? req.body.nome.trim() : undefined,
    cpf: req.body?.cpf !== undefined ? normalizarDigitos(req.body.cpf) : undefined,
    email: typeof req.body?.email === "string" ? req.body.email.trim() : undefined,
    titulo: req.body?.titulo !== undefined ? normalizarDigitos(req.body.titulo) : undefined,
  };

  const atualizacoes = [];
  const valores = [];
  let posicaoCpf = null;
  for (const [coluna, valor] of Object.entries(campos)) {
    if (valor) {
      valores.push(valor);
      atualizacoes.push(`${coluna} = $${valores.length}`);
      if (coluna === "cpf") posicaoCpf = valores.length;
    }
  }

  if (atualizacoes.length === 0) {
    throw erroRequisicao("Nenhum dado para atualizar");
  }

  // Trocar o CPF é trocar o login, então as sessões abertas precisam cair —
  // senão o token anterior seguiria valendo sete dias para um login que já não
  // existe, inclusive na mão de quem o roubou.
  //
  // O CASE é o que evita expulsar à toa: no lado direito do SET, `cpf` ainda é
  // o valor antigo da linha, então o corte só é gravado quando o CPF muda de
  // fato. Sem ele, corrigir um acento no nome derrubaria a pessoa — e o
  // formulário do front manda o CPF junto mesmo quando ele não mudou.
  //
  // `titulo` não entra: identifica o aluno na academia, mas não autentica.
  if (posicaoCpf !== null) {
    atualizacoes.push(
      `sessoes_invalidadas_em = CASE WHEN cpf <> $${posicaoCpf}
          THEN NOW() ELSE sessoes_invalidadas_em END`
    );
  }

  // cpf e titulo são UNIQUE: conferir antes devolve 409 com mensagem em vez de
  // deixar o erro do Postgres subir como "Registro já existe" genérico.
  if (campos.cpf || campos.titulo) {
    const { rows: conflitos } = await db.query(
      `SELECT id FROM usuario
        WHERE id <> $1 AND (($2::text IS NOT NULL AND cpf = $2) OR ($3::text IS NOT NULL AND titulo = $3))`,
      [id, campos.cpf ?? null, campos.titulo ?? null]
    );
    if (conflitos.length > 0) {
      throw erroConflito("Já existe um usuário com esse CPF ou título");
    }
  }

  valores.push(req.usuario.id);
  atualizacoes.push(`atualizado_por = $${valores.length}`);
  valores.push(id);

  const { rows } = await db.query(
    `UPDATE usuario SET ${atualizacoes.join(", ")}
      WHERE id = $${valores.length}
      RETURNING ${CAMPOS_PUBLICOS}`,
    valores
  );

  if (rows.length === 0) {
    throw erroNaoEncontrado("Usuário não encontrado");
  }

  const usuario = rows[0];
  const token = await tokenAposTrocaDeLogin(req, usuario);

  res.json({ message: "Dados alterados com sucesso", usuario, ...(token ? { token } : {}) });
});

/**
 * Promove e rebaixa perfis.
 *
 * Quatro travas, e cada uma fecha um caminho concreto de deixar o sistema
 * inutilizável:
 *
 * 1. O admin não retira o próprio `admin` — um clique distraído deixaria o
 *    sistema sem quem o administre, e o caminho de volta é SQL na mão.
 * 2. O último admin ativo não perde o `admin`, mesmo sendo outra pessoa: é a
 *    regra 1 pela porta dos fundos.
 * 3. Ninguém fica sem perfil nenhum. Sem `aluno`, `professor` nem `admin` a
 *    pessoa entra e não alcança tela alguma — o RotaProtegida a manda para uma
 *    área que ela não pode ver, e ela fica presa num redirecionamento.
 * 4. Só estes três campos são lidos, e cada um só vira TRUE se vier
 *    exatamente `true`. É a mesma regra do cadastro de aluno.
 */
export const alterarPerfis = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const perfis = {
    aluno: req.body?.aluno === true,
    professor: req.body?.professor === true,
    admin: req.body?.admin === true,
  };

  if (!perfis.aluno && !perfis.professor && !perfis.admin) {
    throw erroRequisicao("O usuário precisa ter ao menos um perfil");
  }
  if (id === req.usuario.id && !perfis.admin) {
    throw erroProibido("Você não pode retirar o seu próprio perfil de admin");
  }

  const cliente = await db.connect();
  try {
    await cliente.query("BEGIN");

    const { rows: alvos } = await cliente.query(
      "SELECT admin, ativo FROM usuario WHERE id = $1",
      [id]
    );
    if (alvos.length === 0) {
      throw erroNaoEncontrado("Usuário não encontrado");
    }

    // Rede de segurança para a corrida: dois admins que se rebaixam ao mesmo
    // tempo leriam "2" cada um e passariam os dois, zerando os admins. Por isso
    // a contagem roda dentro da transação.
    //
    // Fora da corrida ela é inalcançável, e de propósito: o último admin ativo
    // só poderia ser rebaixado por si mesmo, e a trava do próprio perfil já
    // barra isso antes daqui.
    //
    // `alvos[0].ativo` não é detalhe: sem ele, rebaixar um admin **inativo**
    // seria recusado — a contagem de ativos não inclui o alvo, dá 1, e a trava
    // dispara sem que ninguém fosse perdido.
    if (alvos[0].admin && alvos[0].ativo && !perfis.admin) {
      const { rows } = await cliente.query(
        "SELECT COUNT(*)::int AS total FROM usuario WHERE admin = TRUE AND ativo = TRUE"
      );
      if (rows[0].total <= 1) {
        throw erroConflito("Este é o único admin ativo do sistema");
      }
    }

    const { rows } = await cliente.query(
      `UPDATE usuario SET aluno = $1, professor = $2, admin = $3, atualizado_por = $4
        WHERE id = $5
        RETURNING ${CAMPOS_PUBLICOS}`,
      [perfis.aluno, perfis.professor, perfis.admin, req.usuario.id, id]
    );

    await cliente.query("COMMIT");
    res.json({ message: "Perfis alterados com sucesso", usuario: rows[0] });
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }
});
