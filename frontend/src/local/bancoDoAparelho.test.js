// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { abrirBancoDoAparelho, COLUNAS_BOOLEANAS } from './bancoDoAparelho.js'

/**
 * Duplo do plugin: registra as chamadas e devolve o que for combinado.
 *
 * O driver é testável sem aparelho porque o que importa é **como** ele chama o
 * plugin — e é aí que estão os dois padrões perigosos (`transaction` e
 * `returnMode`).
 */
function pluginFalso({
  aoConsultar = () => ({ values: [] }),
  aoEscrever = () => ({ changes: { changes: 1 } }),
} = {}) {
  const chamadas = []
  const conexao = {
    open: async () => chamadas.push(['open']),
    close: async () => chamadas.push(['close']),
    execute: async (sql, transacao) => {
      chamadas.push(['execute', sql, transacao])
      return { changes: { changes: 0 } }
    },
    query: async (sql, valores) => {
      chamadas.push(['query', sql, valores])
      return aoConsultar(sql, valores)
    },
    run: async (sql, valores, transacao, returnMode) => {
      chamadas.push(['run', sql, valores, transacao, returnMode])
      return aoEscrever(sql, valores)
    },
    beginTransaction: async () => chamadas.push(['begin']),
    commitTransaction: async () => chamadas.push(['commit']),
    rollbackTransaction: async () => chamadas.push(['rollback']),
  }

  return {
    chamadas,
    plugin: {
      createConnection: async (...args) => {
        chamadas.push(['createConnection', ...args])
        return conexao
      },
      closeConnection: async () => chamadas.push(['closeConnection']),
    },
  }
}

const semSeed = async () => {}

describe('driver do aparelho', () => {
  it('abre a conexao e devolve o contrato de banco', async () => {
    const { plugin, chamadas } = pluginFalso()

    const bd = await abrirBancoDoAparelho({ plugin, semear: semSeed })

    expect(typeof bd.query).toBe('function')
    expect(typeof bd.connect).toBe('function')
    expect(typeof bd.end).toBe('function')
    expect(chamadas.map((c) => c[0])).toContain('open')
  })

  it('SELECT vai por query, e as linhas voltam em rows', async () => {
    const { plugin, chamadas } = pluginFalso({ aoConsultar: () => ({ values: [{ id: 7 }] }) })
    const bd = await abrirBancoDoAparelho({ plugin, semear: semSeed })

    const r = await bd.query('SELECT id FROM usuario WHERE id = ?1', [7])

    expect(r.rows).toEqual([{ id: 7 }])
    expect(chamadas).toContainEqual(['query', 'SELECT id FROM usuario WHERE id = ?', [7]])
  })

  // returnMode 'all' e o que faz o RETURNING voltar. Com o padrao 'no' do
  // plugin, todo INSERT ... RETURNING id voltaria vazio e o controller quebraria
  // ao ler rows[0].id — e o projeto tem 16 desses.
  it('INSERT com RETURNING vai por run, pedindo as linhas de volta', async () => {
    const { plugin, chamadas } = pluginFalso({
      aoEscrever: () => ({ changes: { changes: 1, lastId: 3, values: [{ id: 3 }] } }),
    })
    const bd = await abrirBancoDoAparelho({ plugin, semear: semSeed })

    const r = await bd.query('INSERT INTO usuario (nome) VALUES (?1) RETURNING id', ['Fulano'])

    expect(r.rows).toEqual([{ id: 3 }])
    const chamada = chamadas.find((c) => c[0] === 'run')
    expect(chamada[3]).toBe(false) // transaction
    expect(chamada[4]).toBe('all') // returnMode
  })

  // transaction: false em toda escrita. Com o padrao true do plugin, cada UPDATE
  // abriria e fecharia a propria transacao, e o BEGIN ... COMMIT dos controllers
  // — de que as travas de perfil e o cadastro de treino dependem — deixaria de
  // envolver as escritas.
  it('escrita sem RETURNING nao abre transacao propria', async () => {
    const { plugin, chamadas } = pluginFalso()
    const bd = await abrirBancoDoAparelho({ plugin, semear: semSeed })

    await bd.query('UPDATE usuario SET nome = ?1 WHERE id = ?2', ['Outro', 1])

    const chamada = chamadas.find((c) => c[0] === 'run')
    expect(chamada[3]).toBe(false)
    expect(chamada[4]).toBe('no')
  })

  // Os controllers pedem transacao mandando o SQL "BEGIN" pela conexao. O plugin
  // tem metodos proprios e controla o estado por dentro: misturar os dois
  // caminhos deixaria a transacao pendurada.
  it('BEGIN, COMMIT e ROLLBACK viram os metodos do plugin', async () => {
    const { plugin, chamadas } = pluginFalso()
    const bd = await abrirBancoDoAparelho({ plugin, semear: semSeed })

    const cliente = await bd.connect()
    await cliente.query('BEGIN')
    await cliente.query('COMMIT')
    await cliente.query('ROLLBACK')
    cliente.release()

    const nomes = chamadas.map((c) => c[0])
    expect(nomes).toContain('begin')
    expect(nomes).toContain('commit')
    expect(nomes).toContain('rollback')
    // Nenhum dos tres pode ter ido como SQL solto.
    expect(chamadas.filter((c) => c[0] === 'run' || c[0] === 'query')).toEqual([])
  })

  it('booleano e Date convertidos antes de chegar ao plugin', async () => {
    const { plugin, chamadas } = pluginFalso()
    const bd = await abrirBancoDoAparelho({ plugin, semear: semSeed })

    const quando = new Date('2026-08-22T19:00:00.000Z')
    await bd.query('UPDATE usuario SET ativo = ?1, visto = ?2 WHERE id = ?3', [false, quando, 1])

    const chamada = chamadas.find((c) => c[0] === 'run')
    expect(chamada[2]).toEqual([0, '2026-08-22T19:00:00.000Z', 1])
  })

  it('booleano volta como boolean nas colunas do schema', async () => {
    const { plugin } = pluginFalso({
      aoConsultar: () => ({ values: [{ ativo: 1, aluno: 0, nome: 'x' }] }),
    })
    const bd = await abrirBancoDoAparelho({ plugin, semear: semSeed })

    const r = await bd.query('SELECT ativo, aluno, nome FROM usuario')

    expect(r.rows[0]).toEqual({ ativo: true, aluno: false, nome: 'x' })
  })

  it('coluna nula continua nula', async () => {
    const { plugin } = pluginFalso({ aoConsultar: () => ({ values: [{ ativo: null }] }) })
    const bd = await abrirBancoDoAparelho({ plugin, semear: semSeed })

    const r = await bd.query('SELECT ativo FROM usuario')

    expect(r.rows[0].ativo).toBe(null)
  })

  it('violacao de unicidade chega com o codigo do Postgres', async () => {
    const { plugin } = pluginFalso({
      aoEscrever: () => {
        throw new Error('UNIQUE constraint failed: usuario.cpf')
      },
    })
    const bd = await abrirBancoDoAparelho({ plugin, semear: semSeed })

    await expect(bd.query('INSERT INTO usuario (cpf) VALUES (?1)', ['1'])).rejects.toMatchObject({
      code: '23505',
    })
  })

  it('semeia na abertura, uma vez', async () => {
    const { plugin } = pluginFalso()
    let vezes = 0

    await abrirBancoDoAparelho({
      plugin,
      semear: async () => {
        vezes += 1
      },
    })

    expect(vezes).toBe(1)
  })

  // A lista fixa e a unica duplicacao de conhecimento do banco neste arquivo.
  it('a lista de colunas booleanas confere com o schema', () => {
    const schema = readFileSync(join(process.cwd(), '..', 'backend', 'db', 'schema.sql'), 'utf8')
    const noSchema = [...schema.matchAll(/^\s+(\w+)\s+BOOLEAN\b/gim)].map((achado) => achado[1])

    expect([...new Set(noSchema)].filter((coluna) => !COLUNAS_BOOLEANAS.has(coluna))).toEqual([])
  })
})
