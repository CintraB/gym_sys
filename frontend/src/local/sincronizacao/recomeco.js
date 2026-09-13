import { criarHashComSal } from '../senha.js'

/**
 * O `sub` do token, sem verificar assinatura.
 *
 * Verificar aqui não faria sentido: quem valida é o servidor, a cada chamada.
 * Isto é só para saber qual das linhas devolvidas é a de quem está entrando.
 */
function idDoToken(token) {
  try {
    const claims = JSON.parse(atob(token.split('.')[1]))
    return Number(claims.sub)
  } catch {
    return null
  }
}

/**
 * Troca o banco local pelo que o servidor tem.
 *
 * É o que faz a subida ser possível: `sessao_exercicio.id_ex_usuario` aponta
 * para a linha da ficha, e o servidor só aceita a sessão se esse id for o dele.
 * Enquanto a ficha local vier da semente, com ids próprios, nada sobe.
 *
 * **Apaga o histórico local** — decisão dele em 13/09/2026, tomada depois de o
 * teste de campo já ter gerado treinos no aparelho. Quem chama tem de avisar
 * antes, na tela.
 */
export async function recomecar(bd, cliente, { token, senha }) {
  // A rede toda ANTES de tocar no banco: se a ficha não vier, o aparelho fica
  // exatamente como estava, com a ficha velha, em vez de meio recomeçado.
  const [usuarios, exercicios] = await Promise.all([
    cliente.rest('/usuario?select=id,nome,cpf,email,titulo,aluno,professor,admin,ativo', { token }),
    cliente.rest('/exercicio?select=id_exercicio,nome_exercicio,tipo', { token }),
  ])

  // Quem é o dono do token, entre o que veio.
  //
  // Para aluno, a política devolve só a própria linha. Para professor e admin
  // devolve a academia inteira — `usuarios[0]` seria outra pessoa qualquer.
  const meuId = idDoToken(token)
  const dono = usuarios.find((u) => u.id === meuId) ?? usuarios[0]
  if (!dono) throw new Error('o servidor não devolveu usuário nenhum para este token')

  // O filtro por aluno **não** é redundante com o RLS, e essa foi a armadilha:
  // a política de leitura de `treino` deixa professor e admin verem os treinos
  // de todos. Sem o filtro, quem dá aula baixava a ficha da academia inteira
  // para o aparelho — e a primeira delas quebrava, porque o professor que a
  // montou não é o dono deste aparelho e não existe no banco local.
  const treinos = await cliente.rest(
    `/treino?select=*,treino_bloco(*),ex_usuario(*)&id_aluno=eq.${dono.id}&ativo=eq.true`,
    { token },
  )

  // A hash não desce, e não vai descer: a coluna `senha` não é selecionável por
  // papel nenhum. Mas a pessoa acabou de digitar a senha e a Edge Function
  // confirmou que está certa, então dá para refazer a hash aqui, pelo mesmo
  // caminho do cadastro. Sem isto, o login do app (que é local) pararia de
  // funcionar depois do recomeço.
  const hash = await criarHashComSal(senha)

  // `BEGIN`/`COMMIT`/`ROLLBACK` passam por `query` mesmo: os dois drivers os
  // reconhecem e fazem o certo de cada lado — no aparelho eles viram os
  // **métodos** do plugin de SQLite, e no `node:sqlite` dos testes vão diretos,
  // sem `prepare()`.
  await bd.query('BEGIN')
  try {
    // A ordem é a das dependências, de trás para a frente: sessao_serie
    // referencia sessao_exercicio, que referencia sessao_treino...
    for (const tabela of [
      'sessao_serie',
      'sessao_exercicio',
      'sessao_treino',
      'pedido_treino',
      'ex_usuario',
      'treino_bloco',
      'treino',
      'exercicio',
      'usuario',
      'sincronizacao_envio',
    ]) {
      await bd.query(`DELETE FROM ${tabela}`)
    }

    await bd.query(
      `INSERT INTO usuario (id, nome, senha, cpf, email, titulo, aluno, professor, admin, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        dono.id,
        dono.nome,
        hash,
        dono.cpf,
        dono.email,
        dono.titulo,
        dono.aluno,
        dono.professor,
        dono.admin,
        dono.ativo,
      ],
    )

    // Quem montou a ficha precisa existir aqui: `treino.id_professor`
    // referencia `usuario(id)`, e sem a linha o INSERT do treino morre com
    // "FOREIGN KEY constraint failed" — erro que não diz nada a quem o vê.
    //
    // O nome vem do servidor quando a política deixa (professor e admin leem
    // os outros); para aluno, que só enxerga a própria linha, entra uma linha
    // mínima só para sustentar a referência. A tela mostra "Montado por
    // Professor", que é melhor que não abrir.
    const professores = [...new Set(treinos.map((t) => t.id_professor))].filter(
      (id) => id !== dono.id,
    )
    for (const idProfessor of professores) {
      const conhecido = usuarios.find((u) => u.id === idProfessor)
      await bd.query(
        `INSERT INTO usuario (id, nome, senha, cpf, email, titulo, aluno, professor, admin, ativo)
         VALUES ($1, $2, $3, $4, $5, $6, FALSE, TRUE, FALSE, $7)`,
        [
          idProfessor,
          conhecido?.nome ?? 'Professor',
          // Sem hash utilizável: esta linha existe para a referência, e ninguém
          // entra por ela neste aparelho.
          'sem-senha-local',
          conhecido?.cpf ?? String(idProfessor).padStart(11, '0'),
          conhecido?.email ?? 'professor@local',
          conhecido?.titulo ?? String(idProfessor).padStart(12, '0'),
          conhecido?.ativo ?? true,
        ],
      )
    }

    for (const exercicio of exercicios) {
      await bd.query(
        'INSERT INTO exercicio (id_exercicio, nome_exercicio, tipo) VALUES ($1, $2, $3)',
        [exercicio.id_exercicio, exercicio.nome_exercicio, exercicio.tipo],
      )
    }

    for (const treino of treinos) {
      await bd.query(
        `INSERT INTO treino (id_treino, id_aluno, id_professor, ativo, criado_em)
         VALUES ($1, $2, $3, $4, $5)`,
        [treino.id_treino, treino.id_aluno, treino.id_professor, treino.ativo, treino.criado_em],
      )

      for (const bloco of treino.treino_bloco ?? []) {
        await bd.query(
          `INSERT INTO treino_bloco (id_bloco, id_treino, letra, nome, ordem, ativo)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [bloco.id_bloco, bloco.id_treino, bloco.letra, bloco.nome, bloco.ordem, bloco.ativo],
        )
      }

      for (const exercicio of treino.ex_usuario ?? []) {
        await bd.query(
          // `observacao_ex_usuario`, e não `observacao`: é o nome que vem do
          // banco original do projeto, como `tipo` para grupo muscular. Não se
          // "corrige".
          `INSERT INTO ex_usuario
             (id, id_treino, id_bloco, id_user, id_exercicio, numero_serie, repeticoes, carga,
              observacao_ex_usuario, ativo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            exercicio.id,
            exercicio.id_treino,
            exercicio.id_bloco,
            exercicio.id_user,
            exercicio.id_exercicio,
            exercicio.numero_serie,
            exercicio.repeticoes,
            exercicio.carga,
            exercicio.observacao_ex_usuario,
            exercicio.ativo,
          ],
        )
      }
    }

    // Não é preciso empurrar contador nenhum: o tradutor de dialeto vira
    // `SERIAL` em `INTEGER PRIMARY KEY AUTOINCREMENT`, e o SQLite atualiza o
    // `sqlite_sequence` sozinho quando o INSERT traz o id explícito — o
    // próximo id local já nasce acima do maior que veio do servidor.
    //
    // Fica registrado porque a intuição vinda do Postgres é a oposta: lá a
    // sequência é independente da tabela, e sem `setval` o próximo insert
    // colide (é o que `test-rls/cenario.js` precisa fazer). A primeira versão
    // desta função carregava um `empurrarSequencias` que não fazia nada, e o
    // teste abaixo passava com ele e sem ele.
    await bd.query('COMMIT')
  } catch (erro) {
    // Sem isto, uma falha no meio deixaria o aparelho com as tabelas apagadas e
    // sem ficha nenhuma — o pior estado possível.
    await bd.query('ROLLBACK')
    throw erro
  }

  return {
    usuario: dono,
    exercicios: exercicios.length,
    blocos: treinos.reduce((total, t) => total + (t.treino_bloco?.length ?? 0), 0),
    exerciciosDaFicha: treinos.reduce((total, t) => total + (t.ex_usuario?.length ?? 0), 0),
  }
}
