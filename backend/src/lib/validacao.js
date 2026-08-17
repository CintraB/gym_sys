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
      id_exercicio: idExercicio,
      numero_serie: numeroSerie,
      // carga e INTEGER no banco
      carga: Math.round(carga),
      repeticoes,
      observacao_ex_usuario: observacao || null,
    };
  });
}
