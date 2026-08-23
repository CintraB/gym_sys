import schemaSql from '../../../backend/db/schema.sql?raw'
import catalogoSql from '../../../backend/db/seed.sql?raw'
import { criarHashComSal } from './senha.js'

/**
 * A semente pública: com o que o aplicativo nasce para quem clona o repositório.
 *
 * A conta **é pública** — está aqui e dentro do APK. Foi decisão consciente, e o
 * README diz que trocar a senha é o primeiro passo depois de instalar; a tela
 * existe em Perfil → Trocar minha senha.
 *
 * Nasce com os três perfis porque é o caso real de quem usa isto: administra o
 * sistema, dá aula e treina na própria academia. Sem a flag `aluno` a pessoa não
 * apareceria na própria lista de alunos, e não poderia ter treino.
 */
export const SEMENTE_PUBLICA = {
  conta: {
    cpf: '00000000000',
    nome: 'Administrador',
    senha: 'gymsys123',
    email: 'admin@gymsys.local',
    titulo: '000000000000',
  },
  alunos: [
    { cpf: '11111111111', nome: 'Ana Souza', titulo: '111111111111' },
    { cpf: '22222222222', nome: 'Bruno Lima', titulo: '222222222222' },
  ],
  blocos: [
    { letra: 'A', nome: 'Peito e Tríceps', exercicios: ['SUPINO SENTADO', 'CROSS OVER (CRUCIFIXO)'] },
    { letra: 'B', nome: 'Costas e Bíceps', exercicios: ['PUXADOR FRENTE', 'ROSCA DIRETA W'] },
  ],
}

/**
 * Semente local, opcional: a conta e o treino de quem de fato usa o aplicativo.
 *
 * `sementeLocal.js` fica **fora do versionamento** (`.git/info/exclude`), então
 * quem clona o repositório não o tem e o app nasce com a semente pública acima —
 * nenhum dado pessoal atravessa para o GitHub. Na máquina que tem o arquivo, o
 * APK sai com os dados de verdade, sem precisar refazer o cadastro a cada build.
 *
 * `import.meta.glob` resolve o caminho no build e devolve `{}` quando não casa
 * nada. Um `import` direto de arquivo que pode não existir quebraria o build no
 * repositório limpo, e um `try/catch` em volta de import dinâmico deixaria o
 * módulo no bundle mesmo sem uso.
 */
const modulosLocais = import.meta.glob('./sementeLocal.js', { eager: true })

/** A semente que o app usa de fato: a local quando existe, a pública quando não. */
export const SEMENTE = Object.values(modulosLocais)[0]?.SEMENTE ?? SEMENTE_PUBLICA

/** Senha das contas de exemplo — nunca é a da conta principal. */
const SENHA_DOS_EXEMPLOS = 'treino123'

/**
 * Prepara o banco na abertura do app.
 *
 * Roda em **toda** abertura, e não só na primeira: o `CREATE TABLE IF NOT EXISTS`
 * do schema é idempotente, e os dados só entram quando ainda não há usuário
 * nenhum. Assim não é preciso guardar em outro lugar a informação de "já
 * semeei" — que seria mais um estado para sair de sincronia com o banco.
 *
 * A semente é parâmetro para os testes não dependerem de qual arquivo existe na
 * máquina: eles passam a pública, sempre.
 */
export async function semear(bd, semente = SEMENTE) {
  bd.aplicarSql(schemaSql)

  const { rows } = await bd.query('SELECT COUNT(*)::int AS n FROM usuario')
  if (rows[0].n > 0) return

  bd.aplicarSql(catalogoSql)

  const conta = semente.conta
  const hashDono = await criarHashComSal(conta.senha)
  await bd.query(
    `INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
     VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, TRUE, TRUE)`,
    [conta.cpf, conta.nome, hashDono, conta.email, conta.titulo],
  )

  const alunos = semente.alunos ?? []
  const hashExemplo = alunos.length > 0 ? await criarHashComSal(SENHA_DOS_EXEMPLOS) : null
  for (const aluno of alunos) {
    await bd.query(
      `INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
       VALUES ($1, $2, $3, $4, $5, TRUE, FALSE, FALSE, TRUE)`,
      [aluno.cpf, aluno.nome, hashExemplo, `${aluno.cpf}@exemplo.local`, aluno.titulo],
    )
  }

  // O dono primeiro: é a conta com que o app abre, e sem treino nela o
  // "Meu treino" apareceria vazio para quem instalou.
  await montarTreino(bd, { cpfDoAluno: conta.cpf, semente })
  // E um para a primeira conta de exemplo, quando há alguma, para a área do
  // professor ter o que mostrar.
  if (alunos.length > 0) {
    await montarTreino(bd, { cpfDoAluno: alunos[0].cpf, semente })
  }
}

/**
 * Normaliza a linha de exercício da semente.
 *
 * A forma curta é o nome sozinho, que basta para o treino de exemplo. A forma
 * completa traz série, repetição e observação — é o que uma ficha de verdade
 * tem, e o que a semente local usa.
 */
function normalizarExercicio(item) {
  const linha = typeof item === 'string' ? { nome: item } : item

  return {
    nome: linha.nome,
    // O tipo desempata nome repetido no catálogo: `CROSS OVER` existe em BÍCEPS
    // e em TRÍCEPS, e sem isto o seed pegaria o primeiro dos dois.
    tipo: linha.tipo ?? null,
    series: linha.series ?? 3,
    // Carga zerada é o padrão certo: as fichas da academia vêm com a coluna em
    // branco, para o aluno anotar o que usa.
    carga: linha.carga ?? 0,
    repeticoes: linha.repeticoes ?? '12',
    observacao: linha.observacao ?? null,
  }
}

/**
 * Monta o treino do aluno indicado, com o dono da conta como professor.
 *
 * Existe para o app não abrir com todas as telas vazias: sem isto, "Meu treino"
 * e o histórico não mostrariam nada, e não se saberia se está vazio ou quebrado.
 */
async function montarTreino(bd, { cpfDoAluno, semente }) {
  const { rows: donos } = await bd.query('SELECT id FROM usuario WHERE cpf = $1', [
    semente.conta.cpf,
  ])
  const { rows: alunos } = await bd.query('SELECT id FROM usuario WHERE cpf = $1', [cpfDoAluno])

  const { rows: treinos } = await bd.query(
    `INSERT INTO treino (id_aluno, id_professor, ativo) VALUES ($1, $2, TRUE)
     RETURNING id_treino`,
    [alunos[0].id, donos[0].id],
  )
  const idTreino = treinos[0].id_treino

  let ordem = 1
  for (const bloco of semente.blocos) {
    const { rows: criados } = await bd.query(
      `INSERT INTO treino_bloco (id_treino, letra, nome, ordem, ativo)
       VALUES ($1, $2, $3, $4, TRUE) RETURNING id_bloco`,
      [idTreino, bloco.letra, bloco.nome, ordem],
    )

    for (const item of bloco.exercicios) {
      const exercicio = normalizarExercicio(item)
      const achados = await acharNoCatalogo(bd, exercicio)

      // Estourar, e não pular: um nome que saiu do catálogo deixaria o treino
      // incompleto sem ninguém perceber.
      if (achados.length === 0) {
        throw new Error(`Exercício do seed não existe no catálogo: ${exercicio.nome}`)
      }

      await bd.query(
        `INSERT INTO ex_usuario (id_treino, id_bloco, id_user, id_exercicio,
                                 numero_serie, carga, repeticoes, observacao_ex_usuario, ativo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)`,
        [
          idTreino,
          criados[0].id_bloco,
          alunos[0].id,
          achados[0].id_exercicio,
          exercicio.series,
          exercicio.carga,
          exercicio.repeticoes,
          exercicio.observacao,
        ],
      )
    }
    ordem += 1
  }
}

/** Acha o exercício no catálogo, pelo tipo quando a semente o informa. */
async function acharNoCatalogo(bd, { nome, tipo }) {
  if (tipo) {
    const { rows } = await bd.query(
      'SELECT id_exercicio FROM exercicio WHERE nome_exercicio = $1 AND tipo = $2 LIMIT 1',
      [nome, tipo],
    )
    return rows
  }

  const { rows } = await bd.query(
    'SELECT id_exercicio FROM exercicio WHERE nome_exercicio = $1 LIMIT 1',
    [nome],
  )
  return rows
}
