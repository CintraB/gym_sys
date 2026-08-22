// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { semear, CONTA_PADRAO } from './semear.js'
import { verificarSenha } from './senha.js'

/** Banco vazio, com o mesmo contrato que o driver do aparelho oferece. */
async function bancoVazio() {
  const { criarBancoSqlite } = await import('../../../backend/src/config/sqlite.js')
  return criarBancoSqlite({ arquivo: ':memory:' })
}

const linhas = async (bd, sql) => (await bd.query(sql)).rows

describe('seed da primeira abertura', () => {
  it('cria o schema, o catalogo e a conta padrao', async () => {
    const bd = await bancoVazio()

    await semear(bd)

    const exercicios = await linhas(bd, 'SELECT COUNT(*)::int AS n FROM exercicio')
    expect(exercicios[0].n).toBe(77)

    const contas = await linhas(bd, 'SELECT cpf, aluno, professor, admin FROM usuario WHERE admin = TRUE')
    expect(contas).toHaveLength(1)
    expect(contas[0].cpf).toBe(CONTA_PADRAO.cpf)
    // Os tres perfis: quem administra, da aula e treina na propria academia.
    expect(contas[0]).toMatchObject({ aluno: true, professor: true, admin: true })
  })

  it('a senha padrao entra como hash utilizavel, e nao em texto', async () => {
    const bd = await bancoVazio()
    await semear(bd)

    const [conta] = await linhas(bd, `SELECT senha FROM usuario WHERE cpf = '${CONTA_PADRAO.cpf}'`)
    expect(conta.senha).not.toBe(CONTA_PADRAO.senha)
    expect(conta.senha).toMatch(/^[0-9a-f]{64}:[0-9a-f]{128}$/)
    expect(await verificarSenha(conta.senha, CONTA_PADRAO.senha)).toBe(true)
  })

  // Reabrir o app nao pode duplicar nada nem apagar o que foi feito. E o teste
  // mais importante daqui: o seed roda em TODA abertura.
  it('rodar de novo nao duplica e nao apaga', async () => {
    const bd = await bancoVazio()
    await semear(bd)

    await bd.query(
      `INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
       VALUES ('55555555555', 'Aluno Novo', 'sal:hash', 'a@b.com', '555555555555', TRUE, FALSE, FALSE, TRUE)`,
    )

    await semear(bd)

    const contas = await linhas(bd, 'SELECT cpf FROM usuario ORDER BY cpf')
    expect(contas.map((c) => c.cpf)).toContain('55555555555')
    expect(contas.filter((c) => c.cpf === CONTA_PADRAO.cpf)).toHaveLength(1)

    const exercicios = await linhas(bd, 'SELECT COUNT(*)::int AS n FROM exercicio')
    expect(exercicios[0].n).toBe(77)
  })

  it('nasce com alunos de exemplo e um treino de dois blocos', async () => {
    const bd = await bancoVazio()
    await semear(bd)

    const alunos = await linhas(bd, 'SELECT nome FROM usuario WHERE aluno = TRUE AND admin = FALSE')
    expect(alunos.length).toBeGreaterThan(0)

    const blocos = await linhas(bd, 'SELECT letra FROM treino_bloco ORDER BY letra')
    expect(blocos.map((b) => b.letra)).toEqual(['A', 'B'])

    const exercicios = await linhas(bd, 'SELECT COUNT(*)::int AS n FROM ex_usuario')
    expect(exercicios[0].n).toBeGreaterThan(0)
  })

  // O treino de exemplo aponta para exercicios do catalogo por nome. Se o
  // seed.sql mudar, isso precisa estourar, e nao gerar treino vazio.
  it('o treino de exemplo aponta para exercicios que existem', async () => {
    const bd = await bancoVazio()
    await semear(bd)

    const orfaos = await linhas(
      bd,
      `SELECT COUNT(*)::int AS n FROM ex_usuario e
        LEFT JOIN exercicio c ON c.id_exercicio = e.id_exercicio
       WHERE c.id_exercicio IS NULL`,
    )
    expect(orfaos[0].n).toBe(0)
  })

  // O treino precisa estar ligado ao aluno e ao professor certos, senao a tela
  // do professor abre vazia e o "Meu treino" do aluno nao acha nada.
  //
  // As colunas booleanas NAO sao renomeadas com AS de proposito: a conversao de
  // 0/1 para boolean e por nome de coluna, e um alias escapa dela — limite
  // conhecido, registrado na spec. A primeira versao deste teste caiu nele.
  it('o treino pertence a aluna de exemplo e ao dono como professor', async () => {
    const bd = await bancoVazio()
    await semear(bd)

    const [treino] = await linhas(
      bd,
      `SELECT a.cpf, p.admin, p.professor
         FROM treino t
         JOIN usuario a ON a.id = t.id_aluno
         JOIN usuario p ON p.id = t.id_professor
        WHERE t.ativo = TRUE`,
    )

    expect(treino.cpf).not.toBe(CONTA_PADRAO.cpf)
    expect(treino.admin).toBe(true)
    expect(treino.professor).toBe(true)
  })
})
