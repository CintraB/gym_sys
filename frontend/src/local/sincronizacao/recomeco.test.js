// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { abrirBancoDeTeste } from '../bancoDeTeste.js'
import { semear, SEMENTE_PUBLICA } from '../semear.js'
import { verificarSenha } from '../senha.js'
import { recomecar } from './recomeco.js'

/** Token com o `sub` que o recomeço lê para saber quem está entrando. */
function tokenDe(id) {
  const claims = Buffer.from(JSON.stringify({ sub: String(id) })).toString('base64url')
  return `cabecalho.${claims}.assinatura`
}

/** O que o servidor devolveria: ids que NAO sao os da semente local. */
function servidorFalso() {
  return {
    rest: vi.fn(async (caminho) => {
      if (caminho.startsWith('/usuario')) {
        return [
          {
            id: 501,
            nome: 'Dono do Aparelho',
            cpf: '11111111111',
            email: 'dono@exemplo.local',
            titulo: '111111111111',
            aluno: true,
            professor: true,
            admin: true,
            ativo: true,
          },
        ]
      }
      if (caminho.startsWith('/exercicio')) {
        return [
          { id_exercicio: 901, nome_exercicio: 'SUPINO RETO', tipo: 'PEITORAL' },
          { id_exercicio: 902, nome_exercicio: 'ROSCA DIRETA', tipo: 'BICEPS' },
        ]
      }
      if (caminho.startsWith('/treino')) {
        return [
          {
            id_treino: 701,
            id_aluno: 501,
            id_professor: 501,
            ativo: true,
            criado_em: '2026-09-01T10:00:00Z',
            treino_bloco: [
              { id_bloco: 801, id_treino: 701, letra: 'A', nome: 'Peito', ordem: 1, ativo: true },
            ],
            ex_usuario: [
              {
                id: 601,
                id_treino: 701,
                id_bloco: 801,
                id_user: 501,
                id_exercicio: 901,
                numero_serie: 3,
                repeticoes: '10',
                carga: 20,
                observacao_ex_usuario: null,
                ativo: true,
              },
            ],
          },
        ]
      }
      throw new Error(`caminho nao esperado: ${caminho}`)
    }),
  }
}

async function bancoSemeado() {
  const bd = await abrirBancoDeTeste()
  await semear(bd, SEMENTE_PUBLICA)
  return bd
}

describe('recomeco', () => {
  it('troca a ficha local pela do servidor, com os ids de la', async () => {
    const bd = await bancoSemeado()
    await recomecar(bd, servidorFalso(), { token: tokenDe(501), senha: 'senha-digitada' })

    const treinos = await bd.query('SELECT id_treino FROM treino')
    expect(treinos.rows.map((l) => l.id_treino)).toEqual([701])

    const exercicios = await bd.query('SELECT id, id_exercicio FROM ex_usuario')
    expect(exercicios.rows).toEqual([{ id: 601, id_exercicio: 901 }])
  })

  it('o login local continua funcionando depois — a hash e refeita da senha digitada', async () => {
    const bd = await bancoSemeado()
    await recomecar(bd, servidorFalso(), { token: tokenDe(501), senha: 'senha-digitada' })

    const { rows } = await bd.query('SELECT senha FROM usuario WHERE cpf = $1', ['11111111111'])
    expect(rows).toHaveLength(1)
    expect(await verificarSenha(rows[0].senha, 'senha-digitada')).toBe(true)
  })

  it('o proximo insert local nao colide com id baixado', async () => {
    const bd = await bancoSemeado()
    await recomecar(bd, servidorFalso(), { token: tokenDe(501), senha: 'senha-digitada' })

    await bd.query(
      `INSERT INTO sessao_treino (id_treino, id_bloco, id_aluno, iniciado_em)
       VALUES (701, 801, 501, $1)`,
      [new Date().toISOString()],
    )
    const { rows } = await bd.query('SELECT id_sessao FROM sessao_treino')
    expect(rows).toHaveLength(1)

    // O que importa é em `usuario`, que recebeu o id 501 do servidor: o
    // próximo id local tem de nascer ACIMA dele, e não reaproveitar o 1.
    //
    // Quem garante isso é o AUTOINCREMENT do SQLite, que atualiza o
    // `sqlite_sequence` sozinho quando o INSERT traz id explícito. No Postgres
    // seria preciso `setval`, e a intuição de quem vem de lá manda escrever um
    // `empurrarSequencias` que aqui não faz nada.
    await bd.query(
      `INSERT INTO usuario (cpf, nome, senha, email, titulo)
       VALUES ('99999999999', 'Novo', 'x:y', 'n@e.local', '999999999999')`,
    )
    const { rows: novos } = await bd.query(
      "SELECT id FROM usuario WHERE cpf = '99999999999'",
    )
    expect(novos[0].id).toBeGreaterThan(501)
  })

  it('o historico local e descartado — decisao dele, e precisa estar na tela', async () => {
    const bd = await bancoSemeado()
    const { rows: antes } = await bd.query('SELECT COUNT(*)::int AS n FROM ex_usuario')
    expect(antes[0].n).toBeGreaterThan(0)

    await recomecar(bd, servidorFalso(), { token: tokenDe(501), senha: 'senha-digitada' })

    const { rows } = await bd.query('SELECT COUNT(*)::int AS n FROM sessao_treino')
    expect(rows[0].n).toBe(0)
  })

  // A política de leitura de `treino` deixa professor e admin verem os treinos
  // de TODOS. Sem filtrar por aluno, quem dá aula baixava a academia inteira —
  // e a primeira ficha de outra pessoa quebrava a chave estrangeira. Foi o que
  // aconteceu no aparelho dele em 13/09/2026.
  it('professor so baixa a PROPRIA ficha, e nao a dos alunos', async () => {
    const bd = await bancoSemeado()
    const cliente = servidorFalso()

    // O servidor devolve várias linhas de usuário e vários treinos, como
    // responde para quem dá aula.
    cliente.rest = vi.fn(async (caminho) => {
      if (caminho.startsWith('/usuario')) {
        return [
          { id: 900, nome: 'Aluno de Outro', cpf: '90000000000', email: 'a@b.c', titulo: '900000000000', aluno: true, professor: false, admin: false, ativo: true },
          { id: 501, nome: 'Dono do Aparelho', cpf: '11111111111', email: 'dono@exemplo.local', titulo: '111111111111', aluno: true, professor: true, admin: true, ativo: true },
        ]
      }
      if (caminho.startsWith('/exercicio')) {
        return [{ id_exercicio: 901, nome_exercicio: 'SUPINO RETO', tipo: 'PEITORAL' }]
      }
      if (caminho.startsWith('/treino')) {
        // O filtro tem de estar na URL: é ele que impede a ficha alheia de vir.
        if (!caminho.includes('id_aluno=eq.501')) {
          throw new Error(`o recomeço pediu treino sem filtrar pelo dono: ${caminho}`)
        }
        return [
          {
            id_treino: 701,
            id_aluno: 501,
            id_professor: 501,
            ativo: true,
            criado_em: '2026-09-01T10:00:00Z',
            treino_bloco: [{ id_bloco: 801, id_treino: 701, letra: 'A', nome: 'Peito', ordem: 1, ativo: true }],
            ex_usuario: [
              { id: 601, id_treino: 701, id_bloco: 801, id_user: 501, id_exercicio: 901, numero_serie: 3, repeticoes: '10', carga: 20, observacao_ex_usuario: null, ativo: true },
            ],
          },
        ]
      }
      throw new Error(`caminho nao esperado: ${caminho}`)
    })

    await recomecar(bd, cliente, { token: tokenDe(501), senha: 'senha-digitada' })

    const { rows } = await bd.query('SELECT id FROM usuario ORDER BY id')
    expect(rows.map((l) => l.id)).toEqual([501])
  })

  // `treino.id_professor` referencia `usuario(id)`. Se quem montou a ficha não
  // existir no banco local, o INSERT morre com "FOREIGN KEY constraint failed
  // (code 787)" — que foi o que apareceu na tela dele.
  it('a ficha montada por OUTRO professor entra sem quebrar a chave estrangeira', async () => {
    const bd = await bancoSemeado()
    const cliente = servidorFalso()

    cliente.rest = vi.fn(async (caminho) => {
      if (caminho.startsWith('/usuario')) {
        return [
          { id: 501, nome: 'Dono do Aparelho', cpf: '11111111111', email: 'dono@exemplo.local', titulo: '111111111111', aluno: true, professor: false, admin: false, ativo: true },
        ]
      }
      if (caminho.startsWith('/exercicio')) {
        return [{ id_exercicio: 901, nome_exercicio: 'SUPINO RETO', tipo: 'PEITORAL' }]
      }
      if (caminho.startsWith('/treino')) {
        return [
          {
            id_treino: 701,
            id_aluno: 501,
            // Um professor que o aluno NÃO consegue ler: a política só o deixa
            // ver a própria linha de usuário.
            id_professor: 42,
            ativo: true,
            criado_em: '2026-09-01T10:00:00Z',
            treino_bloco: [{ id_bloco: 801, id_treino: 701, letra: 'A', nome: 'Peito', ordem: 1, ativo: true }],
            ex_usuario: [
              { id: 601, id_treino: 701, id_bloco: 801, id_user: 501, id_exercicio: 901, numero_serie: 3, repeticoes: '10', carga: 20, observacao_ex_usuario: null, ativo: true },
            ],
          },
        ]
      }
      throw new Error(`caminho nao esperado: ${caminho}`)
    })

    await recomecar(bd, cliente, { token: tokenDe(501), senha: 'senha-digitada' })

    const treinos = await bd.query('SELECT id_treino, id_professor FROM treino')
    expect(treinos.rows).toEqual([{ id_treino: 701, id_professor: 42 }])

    // A linha do professor existe, para a referência valer e a tela ter um nome.
    const professor = await bd.query('SELECT id, nome, professor FROM usuario WHERE id = 42')
    expect(professor.rows).toHaveLength(1)
    expect(professor.rows[0].professor).toBe(true)
  })

  it('falha no meio nao deixa o aparelho sem ficha', async () => {
    const bd = await bancoSemeado()
    const original = servidorFalso()
    const cliente = {
      // A ficha vem por último; falhar nela é o pior caso.
      rest: vi.fn(async (caminho) => {
        if (caminho.startsWith('/treino')) throw new Error('rede caiu')
        return original.rest(caminho)
      }),
    }

    await expect(
      recomecar(bd, cliente, { token: tokenDe(501), senha: 'senha-digitada' }),
    ).rejects.toThrow()

    const { rows } = await bd.query('SELECT COUNT(*)::int AS n FROM usuario')
    expect(rows[0].n).toBeGreaterThan(0)
  })
})
