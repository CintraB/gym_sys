import { erroRequisicao } from "./erros.js";

const REGEX_CPF = /^\d{11}$/;
const REGEX_TITULO = /^\d{12}$/;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Limites das colunas em db/schema.sql — validar aqui devolve 400 com
// mensagem em vez de deixar o Postgres estourar um 500.
const TAMANHO_NOME = 60;
const TAMANHO_EMAIL = 255;
const TAMANHO_REPETICOES = 30;
const TAMANHO_OBSERVACAO = 60;
const MAXIMO_EXERCICIOS = 60;
const TAMANHO_NOME_EXERCICIO = 90;
const TAMANHO_TIPO_EXERCICIO = 60;
const TAMANHO_OBSERVACAO_CATALOGO = 255;
const MAXIMO_BLOCOS = 8;
const TAMANHO_NOME_BLOCO = 60;
const LETRAS = "ABCDEFGH";

export function normalizarDigitos(valor) {
  return typeof valor === "string" ? valor.replace(/\D/g, "") : "";
}

/**
 * Valida o payload de cadastro de usuário e devolve os campos normalizados.
 * CPF e título chegam do front com máscara — são normalizados aqui, não no cliente.
 */
export function validarCadastroUsuario(corpo) {
  const cpf = normalizarDigitos(corpo?.cpf);
  const titulo = normalizarDigitos(corpo?.titulo);
  const nome = typeof corpo?.nome === "string" ? corpo.nome.trim() : "";
  const email = typeof corpo?.email === "string" ? corpo.email.trim() : "";
  const senha = typeof corpo?.senha === "string" ? corpo.senha : "";

  if (!REGEX_CPF.test(cpf)) {
    throw erroRequisicao("CPF deve conter 11 dígitos");
  }
  if (nome.length < 2) {
    throw erroRequisicao("Nome é obrigatório");
  }
  if (nome.length > TAMANHO_NOME) {
    throw erroRequisicao(`Nome passa de ${TAMANHO_NOME} caracteres`);
  }
  if (senha.length < 6) {
    throw erroRequisicao("Senha deve ter ao menos 6 caracteres");
  }
  if (email.length > TAMANHO_EMAIL) {
    throw erroRequisicao("E-mail muito longo");
  }
  if (!REGEX_EMAIL.test(email)) {
    throw erroRequisicao("E-mail inválido");
  }
  // usuario.titulo e NOT NULL no banco — nao da para tratar como opcional.
  if (!REGEX_TITULO.test(titulo)) {
    throw erroRequisicao("Título deve conter 12 dígitos");
  }

  return { cpf, nome, senha, email, titulo };
}

/**
 * Normaliza o treino em blocos (o A/B/C/D das fichas).
 *
 * Aceita dois formatos: `{ blocos: [...] }` e o antigo `{ exercicios: [...] }`,
 * que vira um bloco "A" único. Todo treino tem pelo menos um bloco, então o
 * resto do código nunca precisa lidar com exercício solto.
 *
 * As letras são atribuídas pela posição (A, B, C...), não pelo que o cliente
 * mandar: assim não dá para criar dois blocos "A" nem pular letra.
 */
export function validarBlocosTreino(corpo) {
  const bruto = Array.isArray(corpo?.blocos)
    ? corpo.blocos
    : [{ nome: null, exercicios: corpo?.exercicios }];

  if (bruto.length === 0) {
    throw erroRequisicao("Informe ao menos um bloco");
  }
  if (bruto.length > MAXIMO_BLOCOS) {
    throw erroRequisicao(`Um treino aceita no máximo ${MAXIMO_BLOCOS} blocos`);
  }

  return bruto.map((bloco, indice) => {
    const letra = LETRAS[indice];
    const nome = (bloco?.nome ?? "").toString().trim();

    if (nome.length > TAMANHO_NOME_BLOCO) {
      throw erroRequisicao(`Bloco ${letra}: nome passa de ${TAMANHO_NOME_BLOCO} caracteres`);
    }

    let exercicios;
    try {
      exercicios = validarExerciciosTreino(bloco?.exercicios);
    } catch (erro) {
      // Sem o prefixo, "Exercício 2: carga inválida" não diz de qual bloco.
      throw erroRequisicao(`Bloco ${letra}: ${erro.message}`);
    }

    return {
      id_bloco: idDaLinha(bloco?.id_bloco, `Bloco ${letra}`),
      letra,
      nome: nome || null,
      ordem: indice + 1,
      exercicios,
    };
  });
}

/**
 * Id opcional de uma linha que já existe, usado só na edição.
 *
 * Ausente devolve null (linha nova). Presente precisa ser inteiro positivo —
 * a quem ele pertence é pergunta para o controller, que tem o treino em mãos.
 */
function idDaLinha(valor, rotulo) {
  if (valor === undefined || valor === null || valor === "") return null;

  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw erroRequisicao(`${rotulo}: identificador inválido`);
  }
  return id;
}

/** Valida os exercícios enviados no cadastro de um treino. */
export function validarExerciciosTreino(exercicios) {
  if (!Array.isArray(exercicios) || exercicios.length === 0) {
    throw erroRequisicao("Informe ao menos um exercício");
  }
  // Sem teto, um array grande vira um INSERT com dezenas de milhares de
  // parâmetros e segura a conexão. Nenhum treino real chega perto disso.
  if (exercicios.length > MAXIMO_EXERCICIOS) {
    throw erroRequisicao(`Um treino aceita no máximo ${MAXIMO_EXERCICIOS} exercícios`);
  }

  return exercicios.map((exercicio, indice) => {
    const idExercicio = Number(exercicio?.id_exercicio);
    const numeroSerie = Number(exercicio?.numero_serie);
    const repeticoes =
      typeof exercicio?.repeticoes === "number"
        ? String(exercicio.repeticoes)
        : (exercicio?.repeticoes ?? "").toString().trim();

    if (!Number.isInteger(idExercicio) || idExercicio <= 0) {
      throw erroRequisicao(`Exercício ${indice + 1}: exercício inválido`);
    }

    // Series, repeticoes e carga aceitam zero/vazio porque cardio (esteira,
    // bicicleta) e registrado so com a observacao de tempo e intensidade.
    if (!Number.isInteger(numeroSerie) || numeroSerie < 0) {
      throw erroRequisicao(`Exercício ${indice + 1}: número de séries inválido`);
    }
    if (repeticoes.length > TAMANHO_REPETICOES) {
      throw erroRequisicao(`Exercício ${indice + 1}: repetições muito longas`);
    }

    const cargaBruta = exercicio?.carga;
    const carga =
      cargaBruta === "" || cargaBruta === null || cargaBruta === undefined
        ? 0
        : Number(cargaBruta);
    if (!Number.isFinite(carga) || carga < 0) {
      throw erroRequisicao(`Exercício ${indice + 1}: carga inválida`);
    }

    const observacao = (exercicio?.observacao_ex_usuario ?? "").toString().trim();
    if (observacao.length > TAMANHO_OBSERVACAO) {
      throw erroRequisicao(
        `Exercício ${indice + 1}: observação passa de ${TAMANHO_OBSERVACAO} caracteres`
      );
    }

    return {
      // Identidade da linha na edição: presente = atualiza a que já existe,
      // ausente = linha nova. O controller ainda confere se o id pertence ao
      // treino — aceitá-lo aqui de olhos fechados seria IDOR de escrita.
      id: idDaLinha(exercicio?.id, `Exercício ${indice + 1}`),
      id_exercicio: idExercicio,
      numero_serie: numeroSerie,
      // carga e INTEGER no banco
      carga: Math.round(carga),
      repeticoes,
      observacao_ex_usuario: observacao || null,
    };
  });
}

/**
 * Valida um exercício novo do catálogo e devolve os campos normalizados.
 *
 * Nome e grupo sobem para maiúsculas porque o catálogo inteiro é maiúsculo: sem
 * isso "supino sentado" vira uma segunda entrada, visualmente idêntica à do
 * seed, e o select do front passa a mostrar as duas.
 *
 * O grupo não é validado aqui — quais existem é pergunta para o banco, feita no
 * controller.
 */
export function validarExercicioCatalogo(corpo) {
  const nomeExercicio = normalizarTextoDoCatalogo(corpo?.nome_exercicio);
  const tipo = normalizarTextoDoCatalogo(corpo?.tipo);
  const observacao =
    typeof corpo?.observacao === "string" ? corpo.observacao.trim() : "";

  if (nomeExercicio.length < 2) {
    throw erroRequisicao("Nome do exercício é obrigatório");
  }
  if (nomeExercicio.length > TAMANHO_NOME_EXERCICIO) {
    throw erroRequisicao(`Nome do exercício passa de ${TAMANHO_NOME_EXERCICIO} caracteres`);
  }
  if (tipo.length === 0) {
    throw erroRequisicao("Grupo muscular é obrigatório");
  }
  if (tipo.length > TAMANHO_TIPO_EXERCICIO) {
    throw erroRequisicao(`Grupo muscular passa de ${TAMANHO_TIPO_EXERCICIO} caracteres`);
  }
  if (observacao.length > TAMANHO_OBSERVACAO_CATALOGO) {
    throw erroRequisicao(`Observação passa de ${TAMANHO_OBSERVACAO_CATALOGO} caracteres`);
  }

  return { nomeExercicio, tipo, observacao: observacao || null };
}

/** Apara, colapsa espaços repetidos e sobe para maiúsculas. */
function normalizarTextoDoCatalogo(valor) {
  return typeof valor === "string" ? valor.trim().replace(/\s+/g, " ").toUpperCase() : "";
}
