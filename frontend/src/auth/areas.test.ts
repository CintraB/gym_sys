import { describe, expect, it } from 'vitest'
import { rotaParaRetomar, salvarUltimaRota } from './areas'
import type { Usuario } from '../types'

const ALUNO: Usuario = {
  id: 1,
  nome: 'Ana Souza',
  cpf: '11111111111',
  cargo: 'aluno',
  perfis: { aluno: true, professor: false, admin: false },
  ativo: true,
}

const ADMIN: Usuario = {
  id: 2,
  nome: 'Admin Teste',
  cpf: '99999999999',
  cargo: 'admin',
  perfis: { aluno: true, professor: true, admin: true },
  ativo: true,
}

describe('rotaParaRetomar', () => {
  it('sem rota salva, manda para a área do cargo principal', () => {
    expect(rotaParaRetomar(ADMIN)).toBe('/admin')
  })

  it('com rota salva alcançável pelos perfis atuais, retoma nela', () => {
    salvarUltimaRota('/aluno')
    expect(rotaParaRetomar(ADMIN)).toBe('/aluno')
  })

  it('retoma numa sub-rota salva, não só na raiz da área', () => {
    salvarUltimaRota('/aluno/historico')
    expect(rotaParaRetomar(ADMIN)).toBe('/aluno/historico')
  })

  it('rota salva de um perfil que a pessoa não tem mais cai para o cargo principal', () => {
    salvarUltimaRota('/admin')
    expect(rotaParaRetomar(ALUNO)).toBe('/aluno')
  })
})
