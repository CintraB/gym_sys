import schemaSql from '../../../backend/db/schema.sql?raw'
import catalogoSql from '../../../backend/db/seed.sql?raw'
import { criarHashComSal } from './senha.js'

/**
 * A conta com que o aplicativo nasce.
 *
 * **É pública**: está no repositório e dentro do APK. Foi decisão consciente, e o
 * README diz que trocar a senha é o primeiro passo depois de instalar — a tela
 * existe em Perfil → Trocar minha senha.
 *
 * Nasce com os três perfis porque é o caso real de quem usa isto: administra o
 * sistema, dá aula e treina na própria academia. Sem a flag `aluno` a pessoa não
 * apareceria na própria lista de alunos, e não poderia ter treino.
 */
export const CONTA_PADRAO = {
  cpf: '00000000000',
  nome: 'Administrador',
  senha: 'gymsys123',
  email: 'admin@gymsys.local',
  titulo: '000000000000',
}

const ALUNOS_DE_EXEMPLO = [
  { cpf: '11111111111', nome: 'Ana Souza', titulo: '111111111111' },
  { cpf: '22222222222', nome: 'Bruno Lima', titulo: '222222222222' },
]

const BLOCOS_DE_EXEMPLO = [
  { letra: 'A', nome: 'Peito e Tríceps', exercicios: ['SUPINO SENTADO', 'CROSS OVER (CRUCIFIXO)'] },
  { letra: 'B', nome: 'Costas e Bíceps', exercicios: ['PUXADOR FRENTE', 'ROSCA DIRETA W'] },
]

/**
 * Prepara o banco na abertura do app.
 *
 * Roda em **toda** abertura, e não só na primeira: o `CREATE TABLE IF NOT EXISTS`
 * do schema é idempotente, e os dados só entram quando ainda não há usuário
 * nenhum. Assim não é preciso guardar em outro lugar a informação de "já
 * semeei" — que seria mais um estado para sair de sincronia com o banco.
 */
export async function semear(bd) {
  bd.aplicarSql(schemaSql)

  const { rows } = await bd.query('SELECT COUNT(*)::int AS n FROM usuario')
  if (rows[0].n > 0) return

  bd.aplicarSql(catalogoSql)

  const hashDono = await criarHashComSal(CONTA_PADRAO.senha)
  await bd.query(
    `INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
     VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, TRUE, TRUE)`,
    [CONTA_PADRAO.cpf, CONTA_PADRAO.nome, hashDono, CONTA_PADRAO.email, CONTA_PADRAO.titulo],
  )

  const hashExemplo = await criarHashComSal('treino123')
  for (const aluno of ALUNOS_DE_EXEMPLO) {
    await bd.query(
      `INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
       VALUES ($1, $2, $3, $4, $5, TRUE, FALSE, FALSE, TRUE)`,
      [aluno.cpf, aluno.nome, hashExemplo, `${aluno.cpf}@exemplo.local`, aluno.titulo],
    )
  }

  await semearTreinoDeExemplo(bd)
}

/**
 * Um treino montado para a primeira aluna, com dois blocos.
 *
 * Existe para o app não abrir com todas as telas vazias: sem isto, "Meu treino"
 * e o histórico não mostrariam nada, e não se saberia se está vazio ou quebrado.
 */
async function semearTreinoDeExemplo(bd) {
  const { rows: donos } = await bd.query('SELECT id FROM usuario WHERE cpf = $1', [
    CONTA_PADRAO.cpf,
  ])
  const { rows: alunas } = await bd.query('SELECT id FROM usuario WHERE cpf = $1', [
    ALUNOS_DE_EXEMPLO[0].cpf,
  ])

  const { rows: treinos } = await bd.query(
    `INSERT INTO treino (id_aluno, id_professor, ativo) VALUES ($1, $2, TRUE)
     RETURNING id_treino`,
    [alunas[0].id, donos[0].id],
  )
  const idTreino = treinos[0].id_treino

  let ordem = 1
  for (const bloco of BLOCOS_DE_EXEMPLO) {
    const { rows: criados } = await bd.query(
      `INSERT INTO treino_bloco (id_treino, letra, nome, ordem, ativo)
       VALUES ($1, $2, $3, $4, TRUE) RETURNING id_bloco`,
      [idTreino, bloco.letra, bloco.nome, ordem],
    )

    for (const nome of bloco.exercicios) {
      const { rows: achados } = await bd.query(
        'SELECT id_exercicio FROM exercicio WHERE nome_exercicio = $1 LIMIT 1',
        [nome],
      )
      // Estourar, e não pular: um nome que saiu do catálogo deixaria o treino de
      // exemplo incompleto sem ninguém perceber.
      if (achados.length === 0) {
        throw new Error(`Exercício do seed não existe no catálogo: ${nome}`)
      }

      await bd.query(
        `INSERT INTO ex_usuario (id_treino, id_bloco, id_user, id_exercicio,
                                 numero_serie, carga, repeticoes, ativo)
         VALUES ($1, $2, $3, $4, 3, 20, '12', TRUE)`,
        [idTreino, criados[0].id_bloco, alunas[0].id, achados[0].id_exercicio],
      )
    }
    ordem += 1
  }
}
