// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { semear, SEMENTE_PUBLICA } from './semear.js'
import { verificarSenha } from './senha.js'

/**
 * Os testes semeiam com a semente PÚBLICA, sempre explícita.
 *
 * `semear(bd)` sozinho usaria a semente efetiva — que numa máquina com
 * `sementeLocal.js` é outra, com outra conta e outro treino. A suíte precisa
 * dar o mesmo resultado aqui e no repositório limpo.
 */
const CONTA_PADRAO = SEMENTE_PUBLICA.conta

/** Banco vazio, com o mesmo contrato que o driver do aparelho oferece. */
async function bancoVazio() {
  const { criarBancoSqlite } = await import('../../../backend/src/config/sqlite.js')
  return criarBancoSqlite({ arquivo: ':memory:' })
}

const linhas = async (bd, sql) => (await bd.query(sql)).rows

describe('seed da primeira abertura', () => {
  it('cria o schema, o catalogo e a conta padrao', async () => {
    const bd = await bancoVazio()

    await semear(bd, SEMENTE_PUBLICA)

    const exercicios = await linhas(bd, 'SELECT COUNT(*)::int AS n FROM exercicio')
    expect(exercicios[0].n).toBe(79)

    const contas = await linhas(bd, 'SELECT cpf, aluno, professor, admin FROM usuario WHERE admin = TRUE')
    expect(contas).toHaveLength(1)
    expect(contas[0].cpf).toBe(CONTA_PADRAO.cpf)
    // Os tres perfis: quem administra, da aula e treina na propria academia.
    expect(contas[0]).toMatchObject({ aluno: true, professor: true, admin: true })
  })

  it('a senha padrao entra como hash utilizavel, e nao em texto', async () => {
    const bd = await bancoVazio()
    await semear(bd, SEMENTE_PUBLICA)

    const [conta] = await linhas(bd, `SELECT senha FROM usuario WHERE cpf = '${CONTA_PADRAO.cpf}'`)
    expect(conta.senha).not.toBe(CONTA_PADRAO.senha)
    expect(conta.senha).toMatch(/^[0-9a-f]{64}:[0-9a-f]{128}$/)
    expect(await verificarSenha(conta.senha, CONTA_PADRAO.senha)).toBe(true)
  })

  // Reabrir o app nao pode duplicar nada nem apagar o que foi feito. E o teste
  // mais importante daqui: o seed roda em TODA abertura.
  it('rodar de novo nao duplica e nao apaga', async () => {
    const bd = await bancoVazio()
    await semear(bd, SEMENTE_PUBLICA)

    await bd.query(
      `INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
       VALUES ('55555555555', 'Aluno Novo', 'sal:hash', 'a@b.com', '555555555555', TRUE, FALSE, FALSE, TRUE)`,
    )

    await semear(bd, SEMENTE_PUBLICA)

    const contas = await linhas(bd, 'SELECT cpf FROM usuario ORDER BY cpf')
    expect(contas.map((c) => c.cpf)).toContain('55555555555')
    expect(contas.filter((c) => c.cpf === CONTA_PADRAO.cpf)).toHaveLength(1)

    const exercicios = await linhas(bd, 'SELECT COUNT(*)::int AS n FROM exercicio')
    expect(exercicios[0].n).toBe(79)
  })

  it('nasce com alunos de exemplo e treino de dois blocos', async () => {
    const bd = await bancoVazio()
    await semear(bd, SEMENTE_PUBLICA)

    const alunos = await linhas(bd, 'SELECT nome FROM usuario WHERE aluno = TRUE AND admin = FALSE')
    expect(alunos.length).toBeGreaterThan(0)

    const blocos = await linhas(bd, 'SELECT DISTINCT letra FROM treino_bloco ORDER BY letra')
    expect(blocos.map((b) => b.letra)).toEqual(['A', 'B'])

    const exercicios = await linhas(bd, 'SELECT COUNT(*)::int AS n FROM ex_usuario')
    expect(exercicios[0].n).toBeGreaterThan(0)
  })

  // A conta com que o app abre precisa ter treino: sem isso, quem instala entra
  // e ve "Meu treino" vazio, sem saber se e assim mesmo ou se quebrou.
  it('a conta padrao tem treino proprio, com os dois blocos', async () => {
    const bd = await bancoVazio()
    await semear(bd, SEMENTE_PUBLICA)

    const [treino] = await linhas(
      bd,
      `SELECT t.id_treino FROM treino t
         JOIN usuario u ON u.id = t.id_aluno
        WHERE u.cpf = '${CONTA_PADRAO.cpf}' AND t.ativo = TRUE`,
    )
    expect(treino).toBeTruthy()

    const blocos = await linhas(
      bd,
      `SELECT letra FROM treino_bloco WHERE id_treino = ${treino.id_treino} ORDER BY letra`,
    )
    expect(blocos.map((b) => b.letra)).toEqual(['A', 'B'])

    const exercicios = await linhas(
      bd,
      `SELECT COUNT(*)::int AS n FROM ex_usuario WHERE id_treino = ${treino.id_treino}`,
    )
    expect(exercicios[0].n).toBe(4)
  })

  it('a aluna de exemplo tambem tem treino, para a area do professor', async () => {
    const bd = await bancoVazio()
    await semear(bd, SEMENTE_PUBLICA)

    const treinos = await linhas(
      bd,
      `SELECT u.cpf FROM treino t JOIN usuario u ON u.id = t.id_aluno WHERE t.ativo = TRUE`,
    )
    const cpfs = treinos.map((t) => t.cpf)

    expect(cpfs).toContain(CONTA_PADRAO.cpf)
    expect(cpfs).toContain('11111111111')
  })

  // O treino de exemplo aponta para exercicios do catalogo por nome. Se o
  // seed.sql mudar, isso precisa estourar, e nao gerar treino vazio.
  it('o treino de exemplo aponta para exercicios que existem', async () => {
    const bd = await bancoVazio()
    await semear(bd, SEMENTE_PUBLICA)

    const orfaos = await linhas(
      bd,
      `SELECT COUNT(*)::int AS n FROM ex_usuario e
        LEFT JOIN exercicio c ON c.id_exercicio = e.id_exercicio
       WHERE c.id_exercicio IS NULL`,
    )
    expect(orfaos[0].n).toBe(0)
  })

  // Todo treino precisa ter o dono como professor: e ele quem da aula na
  // propria academia, inclusive no treino dele mesmo.
  //
  // As colunas booleanas NAO sao renomeadas com AS de proposito: a conversao de
  // 0/1 para boolean e por nome de coluna, e um alias escapa dela — limite
  // conhecido, registrado na spec. A primeira versao deste teste caiu nele.
  it('todo treino tem o dono da conta como professor', async () => {
    const bd = await bancoVazio()
    await semear(bd, SEMENTE_PUBLICA)

    const treinos = await linhas(
      bd,
      `SELECT p.cpf, p.admin, p.professor
         FROM treino t
         JOIN usuario p ON p.id = t.id_professor
        WHERE t.ativo = TRUE`,
    )

    expect(treinos.length).toBeGreaterThan(1)
    for (const treino of treinos) {
      expect(treino.cpf).toBe(CONTA_PADRAO.cpf)
      expect(treino.admin).toBe(true)
      expect(treino.professor).toBe(true)
    }
  })
})

/**
 * A semente local é o mecanismo que deixa o APK nascer com a conta e o treino
 * de quem vai usar, sem que esses dados entrem no repositório: o arquivo mora
 * fora do versionamento e o build o encontra quando existe.
 *
 * Aqui ela é injetada, nunca lida do disco — senão o teste passaria a depender
 * de um arquivo que o GitHub não tem.
 */
describe('semente local', () => {
  const SEMENTE_DE_TESTE = {
    conta: {
      cpf: '12345678901',
      nome: 'Dono Local',
      senha: 'local123',
      email: 'dono@local.test',
      titulo: '123456789012',
    },
    blocos: [
      {
        letra: 'A',
        nome: 'Peito e Tríceps',
        exercicios: [
          { nome: 'SUPINO SENTADO', series: 4, repeticoes: '8 a 10' },
          { nome: 'CROSS OVER', tipo: 'TRÍCEPS', series: 4, repeticoes: '8 a 10', observacao: 'uni cross' },
        ],
      },
      {
        letra: 'B',
        nome: 'Costas',
        exercicios: [{ nome: 'PULL DOWN', series: 4, repeticoes: '8 a 10' }],
      },
    ],
  }

  it('semeia a conta da semente informada, e não a pública', async () => {
    const bd = await bancoVazio()

    await semear(bd, SEMENTE_DE_TESTE)

    const contas = await linhas(bd, 'SELECT cpf, nome, aluno, professor, admin FROM usuario')
    expect(contas).toHaveLength(1)
    expect(contas[0]).toMatchObject({
      cpf: SEMENTE_DE_TESTE.conta.cpf,
      nome: 'Dono Local',
      aluno: true,
      professor: true,
      admin: true,
    })
    expect(await verificarSenha((await linhas(bd, 'SELECT senha FROM usuario'))[0].senha, 'local123')).toBe(true)
  })

  it('grava série, repetição e observação de cada exercício', async () => {
    const bd = await bancoVazio()
    await semear(bd, SEMENTE_DE_TESTE)

    const exercicios = await linhas(
      bd,
      `SELECT c.nome_exercicio, e.numero_serie, e.repeticoes, e.observacao_ex_usuario, b.letra
         FROM ex_usuario e
         JOIN exercicio c ON c.id_exercicio = e.id_exercicio
         JOIN treino_bloco b ON b.id_bloco = e.id_bloco
        ORDER BY b.letra, e.id`,
    )

    expect(exercicios).toHaveLength(3)
    expect(exercicios[0]).toMatchObject({
      nome_exercicio: 'SUPINO SENTADO',
      numero_serie: 4,
      repeticoes: '8 a 10',
      letra: 'A',
    })
    expect(exercicios[1].observacao_ex_usuario).toBe('uni cross')
  })

  // `CROSS OVER` existe em BÍCEPS e em TRÍCEPS: sem o tipo, o seed pegaria o
  // primeiro do catálogo e o treino mostraria o exercício do grupo errado.
  it('desambigua pelo tipo o exercício que se repete no catálogo', async () => {
    const bd = await bancoVazio()
    await semear(bd, SEMENTE_DE_TESTE)

    const [cross] = await linhas(
      bd,
      `SELECT c.tipo FROM ex_usuario e
         JOIN exercicio c ON c.id_exercicio = e.id_exercicio
        WHERE c.nome_exercicio = 'CROSS OVER'`,
    )

    expect(cross.tipo).toBe('TRÍCEPS')
  })

  it('não inventa aluno de exemplo quando a semente não traz nenhum', async () => {
    const bd = await bancoVazio()
    await semear(bd, SEMENTE_DE_TESTE)

    const treinos = await linhas(bd, 'SELECT COUNT(*)::int AS n FROM treino')
    expect(treinos[0].n).toBe(1)
  })

  it('estoura quando o exercício não existe no catálogo', async () => {
    const bd = await bancoVazio()
    const quebrada = {
      ...SEMENTE_DE_TESTE,
      blocos: [{ letra: 'A', nome: 'X', exercicios: [{ nome: 'AGACHAMENTO MARCIANO' }] }],
    }

    await expect(semear(bd, quebrada)).rejects.toThrow(/AGACHAMENTO MARCIANO/)
  })
})
