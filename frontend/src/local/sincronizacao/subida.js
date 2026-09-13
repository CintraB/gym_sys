/**
 * Manda as sessões finalizadas para o servidor.
 *
 * Uma chamada por sessão, em `sincronizar_sessao`: o pacote inteiro numa
 * transação do lado de lá. Três POST separados não serviriam — as linhas filhas
 * referenciam `id_sessao`, que é o SERIAL do servidor e o aparelho não conhece.
 */

/**
 * Sessões finalizadas que ainda não subiram.
 *
 * A marca é local (`sincronizacao_envio`) e é atalho: a garantia de verdade é o
 * índice único de `uuid` no servidor. Uma marca perdida custa uma chamada a
 * mais, que volta como `criada: false`.
 */
export async function sessoesPendentes(bd) {
  const { rows } = await bd.query(
    `SELECT s.id_sessao
       FROM sessao_treino s
       LEFT JOIN sincronizacao_envio e ON e.uuid = s.uuid
      WHERE s.finalizado_em IS NOT NULL
        AND e.uuid IS NULL
      ORDER BY s.id_sessao`,
  )
  return rows
}

/**
 * Monta o pacote e **grava o uuid no aparelho** antes de mandar.
 *
 * Gravar antes não é detalhe: se o uuid nascesse a cada tentativa, uma
 * retentativa depois de uma queda de rede criaria uma sessão nova no servidor,
 * e a idempotência do índice único não valeria nada.
 */
export async function montarPacote(bd, idSessao) {
  const { rows: sessoes } = await bd.query(
    `SELECT id_sessao, id_treino, id_bloco, id_aluno, iniciado_em, finalizado_em,
            duracao_segundos, observacao, calorias, uuid
       FROM sessao_treino WHERE id_sessao = $1`,
    [idSessao],
  )
  const sessao = sessoes[0]
  if (!sessao) throw new Error(`sessão ${idSessao} não existe no aparelho`)

  const uuid = sessao.uuid ?? crypto.randomUUID()
  if (!sessao.uuid) {
    await bd.query('UPDATE sessao_treino SET uuid = $1 WHERE id_sessao = $2', [uuid, idSessao])
  }

  const { rows: exercicios } = await bd.query(
    `SELECT id, id_ex_usuario, concluido, concluido_em, uuid
       FROM sessao_exercicio WHERE id_sessao = $1 ORDER BY id`,
    [idSessao],
  )

  const montados = []
  for (const exercicio of exercicios) {
    const uuidExercicio = exercicio.uuid ?? crypto.randomUUID()
    if (!exercicio.uuid) {
      await bd.query('UPDATE sessao_exercicio SET uuid = $1 WHERE id = $2', [
        uuidExercicio,
        exercicio.id,
      ])
    }

    const { rows: series } = await bd.query(
      `SELECT id, carga, repeticoes, uuid
         FROM sessao_serie WHERE id_sessao_exercicio = $1 ORDER BY id`,
      [exercicio.id],
    )

    const seriesMontadas = []
    for (const serie of series) {
      const uuidSerie = serie.uuid ?? crypto.randomUUID()
      if (!serie.uuid) {
        await bd.query('UPDATE sessao_serie SET uuid = $1 WHERE id = $2', [uuidSerie, serie.id])
      }
      seriesMontadas.push({ uuid: uuidSerie, carga: serie.carga, repeticoes: serie.repeticoes })
    }

    montados.push({
      uuid: uuidExercicio,
      id_ex_usuario: exercicio.id_ex_usuario,
      concluido: exercicio.concluido,
      concluido_em: exercicio.concluido_em,
      series: seriesMontadas,
    })
  }

  return {
    uuid,
    id_treino: sessao.id_treino,
    id_bloco: sessao.id_bloco,
    id_aluno: sessao.id_aluno,
    iniciado_em: sessao.iniciado_em,
    finalizado_em: sessao.finalizado_em,
    duracao_segundos: sessao.duracao_segundos,
    observacao: sessao.observacao,
    calorias: sessao.calorias,
    exercicios: montados,
  }
}

export async function subir(bd, cliente, { token }) {
  const pendentes = await sessoesPendentes(bd)
  let enviadas = 0
  let repetidas = 0
  let falhas = 0

  for (const { id_sessao: idSessao } of pendentes) {
    const pacote = await montarPacote(bd, idSessao)
    try {
      const resposta = await cliente.rpc('sincronizar_sessao', { pacote }, { token })

      await bd.query('INSERT INTO sincronizacao_envio (uuid, enviado_em) VALUES ($1, $2)', [
        pacote.uuid,
        new Date().toISOString(),
      ])

      // `criada: false` quer dizer que o uuid já estava lá: o app morreu entre
      // subir e marcar numa tentativa anterior. Marcar agora conserta.
      if (resposta?.criada) enviadas += 1
      else repetidas += 1
    } catch (erro) {
      // Credencial é a exceção: o token venceu, e ele vale para TODAS as
      // sessões. Insistir nas outras seria gastar rede à toa para colecionar o
      // mesmo 401 — então relança, e quem chamou desliga a sincronização.
      if (erro?.tipo === 'credencial') throw erro

      // O resto não pode segurar a fila: a sessão seguinte pode ser a que sobe.
      falhas += 1
      console.error('[sincronizacao] sessão', idSessao, erro?.tipo ?? '', erro?.message ?? erro)
    }
  }

  return { enviadas, repetidas, falhas }
}
