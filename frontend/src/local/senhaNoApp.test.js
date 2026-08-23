// @vitest-environment node
//
// O núcleo local é código de servidor rodando dentro do cliente: não tem DOM.
// No jsdom o jose recusa a chave que o TextEncoder produz, porque o instanceof
// Uint8Array falha entre o realm do jsdom e o do Node.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { despachar } from './roteador.js'
import { configurarPool } from './banco.js'

/**
 * As duas rotas de senha dentro do aplicativo, sobre SQLite e com os
 * controllers de verdade.
 *
 * O backend já cobre a regra; o que se prova aqui é que ela chega inteira ao
 * APK — mesmo caminho, banco diferente. Trocar a senha é o primeiro passo depois
 * de instalar, porque a conta inicial é pública: se algo quebrar só neste lado,
 * quebra logo na primeira coisa que a pessoa faz.
 */

const SENHA = 'senha123'

async function bancoDeTeste() {
  const { criarBancoSqlite } = await import('../../../backend/src/config/sqlite.js')
  const raiz = join(process.cwd(), '..', 'backend', 'db')

  const bd = criarBancoSqlite({ arquivo: ':memory:' })
  bd.aplicarSql(readFileSync(join(raiz, 'schema.sql'), 'utf8'))
  bd.aplicarSql(readFileSync(join(raiz, 'seed.sql'), 'utf8'))
  configurarPool(bd)
  return bd
}

/** Cria a conta direto no banco e entra com ela. */
async function entrar(bd, { cpf, aluno = true, professor = false, admin = false }) {
  const { criarHashComSal } = await import('./senha.js')
  const hash = await criarHashComSal(SENHA)
  bd.aplicarSql(`
    INSERT INTO usuario (cpf, nome, senha, email, titulo, aluno, professor, admin, ativo)
    VALUES ('${cpf}', 'Pessoa ${cpf}', '${hash}', '${cpf}@t.com', '${cpf}0',
            ${aluno ? 'TRUE' : 'FALSE'}, ${professor ? 'TRUE' : 'FALSE'},
            ${admin ? 'TRUE' : 'FALSE'}, TRUE)
  `)

  const entrada = await despachar({ metodo: 'POST', caminho: '/login', corpo: { cpf, senha: SENHA } })
  if (entrada.status !== 200) throw new Error(`login falhou: ${JSON.stringify(entrada)}`)

  return {
    id: entrada.corpo.usuario.id,
    cabecalhos: { Authorization: `Bearer ${entrada.corpo.token}` },
  }
}

const login = (cpf, senha) => despachar({ metodo: 'POST', caminho: '/login', corpo: { cpf, senha } })

describe('trocar a própria senha dentro do app', () => {
  it('a senha nova passa a valer e a antiga para de valer', async () => {
    const bd = await bancoDeTeste()
    const eu = await entrar(bd, { cpf: '11111111111' })

    const resposta = await despachar({
      metodo: 'PUT',
      caminho: '/me/senha',
      corpo: { senha_atual: SENHA, senha_nova: 'outraSenha456' },
      cabecalhos: eu.cabecalhos,
    })

    expect(resposta.status).toBe(200)
    expect((await login('11111111111', 'outraSenha456')).status).toBe(200)
    expect((await login('11111111111', SENHA)).status).toBe(401)
  })

  it('devolve token novo, para quem trocou não cair no login', async () => {
    const bd = await bancoDeTeste()
    const eu = await entrar(bd, { cpf: '11111111111' })

    const resposta = await despachar({
      metodo: 'PUT',
      caminho: '/me/senha',
      corpo: { senha_atual: SENHA, senha_nova: 'outraSenha456' },
      cabecalhos: eu.cabecalhos,
    })

    expect(resposta.corpo.token).toBeTruthy()
    const meu = await despachar({
      metodo: 'GET',
      caminho: '/me',
      cabecalhos: { Authorization: `Bearer ${resposta.corpo.token}` },
    })
    expect(meu.status).toBe(200)
  })

  // Foi o que apareceu no aparelho: o 401 daqui é da senha digitada, não da
  // sessão — o token continua de pé, e o interceptor do api.ts sabe disso.
  it('errar a senha atual é 401, não muda nada e não mata o token', async () => {
    const bd = await bancoDeTeste()
    const eu = await entrar(bd, { cpf: '11111111111' })

    const resposta = await despachar({
      metodo: 'PUT',
      caminho: '/me/senha',
      corpo: { senha_atual: 'chuteErrado', senha_nova: 'outraSenha456' },
      cabecalhos: eu.cabecalhos,
    })

    expect(resposta.status).toBe(401)
    expect((await login('11111111111', SENHA)).status).toBe(200)
    expect((await login('11111111111', 'outraSenha456')).status).toBe(401)

    const meu = await despachar({ metodo: 'GET', caminho: '/me', cabecalhos: eu.cabecalhos })
    expect(meu.status).toBe(200)
  })

  it('recusa preenchimento inválido do mesmo jeito que o servidor', async () => {
    const bd = await bancoDeTeste()
    const eu = await entrar(bd, { cpf: '11111111111' })

    const casos = [
      { corpo: {}, esperado: 400 },
      { corpo: { senha_atual: SENHA, senha_nova: '12345' }, esperado: 400 },
      { corpo: { senha_atual: SENHA, senha_nova: '        ' }, esperado: 400 },
      { corpo: { senha_atual: SENHA, senha_nova: SENHA }, esperado: 400 },
      { corpo: { senha_atual: SENHA, senha_nova: 12345678 }, esperado: 400 },
      { corpo: { senha_nova: 'outraSenha456' }, esperado: 401 },
    ]

    for (const caso of casos) {
      const resposta = await despachar({
        metodo: 'PUT',
        caminho: '/me/senha',
        corpo: caso.corpo,
        cabecalhos: eu.cabecalhos,
      })

      expect(resposta.status, JSON.stringify(caso.corpo)).toBe(caso.esperado)
    }

    expect((await login('11111111111', SENHA)).status).toBe(200)
  })

  it('sem token é 401', async () => {
    await bancoDeTeste()

    const resposta = await despachar({
      metodo: 'PUT',
      caminho: '/me/senha',
      corpo: { senha_atual: SENHA, senha_nova: 'outraSenha456' },
    })

    expect(resposta.status).toBe(401)
  })
})

describe('admin redefinindo senha dentro do app', () => {
  it('redefine a senha de outra pessoa', async () => {
    const bd = await bancoDeTeste()
    const admin = await entrar(bd, { cpf: '11111111111', professor: true, admin: true })
    const outro = await entrar(bd, { cpf: '22222222222' })

    const resposta = await despachar({
      metodo: 'PUT',
      caminho: `/admin/usuarios/${outro.id}/senha`,
      corpo: { senha_nova: 'temporaria1' },
      cabecalhos: admin.cabecalhos,
    })

    expect(resposta.status).toBe(200)
    expect((await login('22222222222', 'temporaria1')).status).toBe(200)
    expect((await login('22222222222', SENHA)).status).toBe(401)
  })

  // A conta inicial do app tem os três perfis, então é ela mesma que aparece na
  // lista de usuários: sem esta recusa, a exigência da senha atual não valeria
  // justamente para a conta pública.
  it('recusa a própria conta do admin com 403', async () => {
    const bd = await bancoDeTeste()
    const admin = await entrar(bd, { cpf: '11111111111', professor: true, admin: true })

    const resposta = await despachar({
      metodo: 'PUT',
      caminho: `/admin/usuarios/${admin.id}/senha`,
      corpo: { senha_nova: 'temporaria1' },
      cabecalhos: admin.cabecalhos,
    })

    expect(resposta.status).toBe(403)
  })

  it('recusa preenchimento inválido e id que não é número', async () => {
    const bd = await bancoDeTeste()
    const admin = await entrar(bd, { cpf: '11111111111', professor: true, admin: true })
    const outro = await entrar(bd, { cpf: '22222222222' })

    const casos = [
      { caminho: `/admin/usuarios/${outro.id}/senha`, corpo: {}, esperado: 400 },
      { caminho: `/admin/usuarios/${outro.id}/senha`, corpo: { senha_nova: '12345' }, esperado: 400 },
      {
        caminho: `/admin/usuarios/${outro.id}/senha`,
        corpo: { senha_nova: '        ' },
        esperado: 400,
      },
      { caminho: '/admin/usuarios/abc/senha', corpo: { senha_nova: 'temporaria1' }, esperado: 400 },
      { caminho: '/admin/usuarios/9999/senha', corpo: { senha_nova: 'temporaria1' }, esperado: 404 },
    ]

    for (const caso of casos) {
      const resposta = await despachar({
        metodo: 'PUT',
        caminho: caso.caminho,
        corpo: caso.corpo,
        cabecalhos: admin.cabecalhos,
      })

      expect(resposta.status, `${caso.caminho} ${JSON.stringify(caso.corpo)}`).toBe(caso.esperado)
    }

    expect((await login('22222222222', SENHA)).status).toBe(200)
  })

  it('quem não é admin não redefine senha de ninguém', async () => {
    const bd = await bancoDeTeste()
    await entrar(bd, { cpf: '11111111111', professor: true, admin: true })
    const aluno = await entrar(bd, { cpf: '22222222222' })

    const resposta = await despachar({
      metodo: 'PUT',
      caminho: `/admin/usuarios/${aluno.id}/senha`,
      corpo: { senha_nova: 'temporaria1' },
      cabecalhos: aluno.cabecalhos,
    })

    expect(resposta.status).toBe(403)
  })
})
