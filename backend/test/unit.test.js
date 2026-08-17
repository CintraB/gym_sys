import test from "node:test";
import assert from "node:assert/strict";
import { criarHashComSal, verificarSenha } from "../src/lib/senha.js";
import { validarCadastroUsuario, validarExerciciosTreino } from "../src/lib/validacao.js";

test("hash de senha usa sal aleatório e confere a senha correta", async () => {
  const primeira = await criarHashComSal("senha123");
  const segunda = await criarHashComSal("senha123");

  assert.notEqual(primeira, segunda, "o mesmo texto gera hashes diferentes");
  assert.equal(await verificarSenha(primeira, "senha123"), true);
  assert.equal(await verificarSenha(primeira, "senha124"), false);
});

test("verificação de senha não quebra com hash malformada", async () => {
  // timingSafeEqual lança quando os buffers têm tamanhos diferentes;
  // antes isso virava 500 no login.
  assert.equal(await verificarSenha("sem-dois-pontos", "senha123"), false);
  assert.equal(await verificarSenha("sal:abcd", "senha123"), false);
  assert.equal(await verificarSenha(null, "senha123"), false);
  assert.equal(await verificarSenha("sal:hash", null), false);
});

test("cadastro normaliza CPF e título com máscara", () => {
  const dados = validarCadastroUsuario({
    cpf: "123.456.789-01",
    nome: "  Maria  ",
    senha: "senha123",
    email: "maria@exemplo.com",
    titulo: "1234 5678 9012",
  });

  assert.equal(dados.cpf, "12345678901");
  assert.equal(dados.titulo, "123456789012");
  assert.equal(dados.nome, "Maria");
});

test("título é obrigatório e precisa ter 12 dígitos", () => {
  // usuario.titulo é NOT NULL no schema — sem isso o INSERT estouraria em 500.
  const semTitulo = () =>
    validarCadastroUsuario({
      cpf: "12345678901",
      nome: "Maria",
      senha: "senha123",
      email: "maria@exemplo.com",
    });
  const tituloCurto = () =>
    validarCadastroUsuario({
      cpf: "12345678901",
      nome: "Maria",
      senha: "senha123",
      email: "maria@exemplo.com",
      titulo: "123",
    });

  assert.throws(semTitulo, /Título/);
  assert.throws(tituloCurto, /Título/);
});

test("campos respeitam os limites das colunas", () => {
  const base = {
    cpf: "12345678901",
    senha: "senha123",
    email: "maria@exemplo.com",
    titulo: "123456789012",
  };

  assert.throws(() => validarCadastroUsuario({ ...base, nome: "M".repeat(61) }), /60 caracteres/);

  assert.throws(
    () =>
      validarExerciciosTreino([
        { id_exercicio: 1, numero_serie: 3, repeticoes: "10", observacao_ex_usuario: "x".repeat(61) },
      ]),
    /observação/i
  );
});

test("cadastro rejeita e-mail inválido", () => {
  assert.throws(
    () =>
      validarCadastroUsuario({
        cpf: "12345678901",
        nome: "Maria",
        senha: "senha123",
        email: "maria@exemplo",
      }),
    /mail/
  );
});

test("exercícios aceitam repetições em faixa e carga em branco", () => {
  const [exercicio] = validarExerciciosTreino([
    { id_exercicio: "3", numero_serie: "4", repeticoes: "10 a 15", carga: "", observacao_ex_usuario: "  " },
  ]);

  assert.equal(exercicio.id_exercicio, 3);
  assert.equal(exercicio.numero_serie, 4);
  assert.equal(exercicio.repeticoes, "10 a 15");
  assert.equal(exercicio.carga, 0, "carga é INTEGER NOT NULL: branco vira 0, não NaN");
  assert.equal(exercicio.observacao_ex_usuario, null);
});

test("cardio passa sem séries, repetições nem carga", () => {
  const [esteira] = validarExerciciosTreino([
    { id_exercicio: 36, numero_serie: 0, repeticoes: "", observacao_ex_usuario: "20 min" },
  ]);

  assert.equal(esteira.numero_serie, 0);
  assert.equal(esteira.repeticoes, "");
  assert.equal(esteira.carga, 0);
});

test("exercícios apontam qual linha está inválida", () => {
  assert.throws(
    () =>
      validarExerciciosTreino([
        { id_exercicio: 1, numero_serie: 3, repeticoes: "10" },
        { id_exercicio: 2, numero_serie: -1, repeticoes: "10" },
      ]),
    /Exercício 2/
  );
});
