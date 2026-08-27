import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  contar,
  descreverSerie,
  descreverSerieCurta,
  formatarCarga,
  formatarCronometro,
  formatarDuracao,
  formatarSerieRealizada,
  iniciais,
  mascararCpf,
  mascararTitulo,
  primeiroNome,
  rotularBloco,
  somenteDigitos,
  tempoRelativo,
} from './formato'

describe('somenteDigitos', () => {
  it('descarta tudo que não é dígito', () => {
    expect(somenteDigitos('123.456.789-01')).toBe('12345678901')
  })
})

describe('mascararCpf', () => {
  it('formata onze dígitos', () => {
    expect(mascararCpf('12345678901')).toBe('123.456.789-01')
  })

  it('formata parcialmente enquanto se digita', () => {
    expect(mascararCpf('123')).toBe('123')
    expect(mascararCpf('1234')).toBe('123.4')
    expect(mascararCpf('1234567')).toBe('123.456.7')
  })

  it('ignora o que passa de onze dígitos', () => {
    expect(mascararCpf('123456789012345')).toBe('123.456.789-01')
  })
})

describe('mascararTitulo', () => {
  it('agrupa de quatro em quatro', () => {
    expect(mascararTitulo('123456789012')).toBe('1234 5678 9012')
  })

  it('ignora o que passa de doze dígitos', () => {
    expect(mascararTitulo('1234567890123456')).toBe('1234 5678 9012')
  })
})

describe('tempoRelativo', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const fixarHoje = (iso: string) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(iso))
  }

  it('diz hoje e ontem', () => {
    fixarHoje('2026-08-19T12:00:00Z')
    expect(tempoRelativo('2026-08-19T09:00:00Z')).toBe('hoje')
    expect(tempoRelativo('2026-08-18T09:00:00Z')).toBe('ontem')
  })

  it('conta em dias abaixo de um mês', () => {
    fixarHoje('2026-08-19T12:00:00Z')
    expect(tempoRelativo('2026-08-14T12:00:00Z')).toBe('há 5 dias')
  })

  it('vira meses a partir de trinta dias', () => {
    fixarHoje('2026-08-19T12:00:00Z')
    expect(tempoRelativo('2026-07-19T12:00:00Z')).toBe('há 1 mês')
    expect(tempoRelativo('2026-06-01T12:00:00Z')).toBe('há 2 meses')
  })
})

describe('formatarCarga', () => {
  it('acrescenta a unidade', () => {
    expect(formatarCarga(20)).toBe('20 kg')
    expect(formatarCarga('45')).toBe('45 kg')
  })

  // Cardio é gravado com carga 0: mostrar "0 kg" numa esteira é ruído.
  it('devolve null quando não há carga', () => {
    expect(formatarCarga(0)).toBeNull()
    expect(formatarCarga(null)).toBeNull()
    expect(formatarCarga('')).toBeNull()
    expect(formatarCarga('abc')).toBeNull()
  })
})

describe('descreverSerie', () => {
  it('junta séries, repetições e carga', () => {
    expect(descreverSerie(4, '10 a 15', 20)).toBe('4 séries · 10 a 15 reps · 20 kg')
  })

  // Cardio: 0 séries, repetições vazias, carga 0. Sem o corte, viraria
  // "0 séries ·  reps · 0 kg".
  it('some inteira no cardio', () => {
    expect(descreverSerie(0, '', 0)).toBe('')
  })

  it('omite só a parte que falta', () => {
    expect(descreverSerie(3, '12', null)).toBe('3 séries · 12 reps')
  })
})

describe('descreverSerieCurta', () => {
  it('usa o formato 4x10 a 15', () => {
    expect(descreverSerieCurta(4, '10 a 15', 20)).toBe('4x10 a 15 · 20 kg')
  })

  it('cai para "séries" quando não há repetições', () => {
    expect(descreverSerieCurta(3, '', 10)).toBe('3 séries · 10 kg')
  })

  it('some inteira no cardio', () => {
    expect(descreverSerieCurta(0, '', 0)).toBe('')
  })
})

describe('formatarSerieRealizada', () => {
  it('junta carga e repetições', () => {
    expect(formatarSerieRealizada(20, '10')).toBe('20kg×10')
  })

  it('aceita carga zero', () => {
    expect(formatarSerieRealizada(0, '15')).toBe('0kg×15')
  })
})

describe('formatarDuracao', () => {
  it('passa a hora quando cruza os sessenta minutos', () => {
    expect(formatarDuracao(3725)).toBe('1h02')
  })

  it('usa minutos e segundos abaixo disso', () => {
    expect(formatarDuracao(125)).toBe('2 min')
    expect(formatarDuracao(45)).toBe('45s')
  })

  it('devolve travessão quando não há duração', () => {
    expect(formatarDuracao(null)).toBe('—')
    expect(formatarDuracao(Number.NaN)).toBe('—')
  })
})

describe('formatarCronometro', () => {
  it('omite a hora enquanto não passa de sessenta minutos', () => {
    expect(formatarCronometro(312)).toBe('05:12')
  })

  it('mostra a hora depois disso', () => {
    expect(formatarCronometro(3912)).toBe('1:05:12')
  })

  it('não desce abaixo de zero', () => {
    expect(formatarCronometro(-10)).toBe('00:00')
  })
})

describe('contar', () => {
  it('concorda o plural', () => {
    expect(contar(1, 'exercício')).toBe('1 exercício')
    expect(contar(3, 'exercício')).toBe('3 exercícios')
    expect(contar(0, 'exercício')).toBe('0 exercícios')
  })

  it('aceita plural irregular', () => {
    expect(contar(2, 'sessão', 'sessões')).toBe('2 sessões')
  })
})

describe('rotularBloco', () => {
  it('junta letra e nome quando há nome', () => {
    expect(rotularBloco('A', 'Peito e Tríceps')).toBe('A — Peito e Tríceps')
  })

  it('cai para "Treino A" sem nome', () => {
    expect(rotularBloco('A', null)).toBe('Treino A')
  })

  it('devolve só "Treino" sem letra', () => {
    expect(rotularBloco(null, 'Peito')).toBe('Treino')
  })
})

describe('primeiroNome', () => {
  it('pega a primeira palavra', () => {
    expect(primeiroNome('  Ana Maria Souza ')).toBe('Ana')
  })
})

describe('iniciais', () => {
  it('usa a primeira e a última palavra', () => {
    expect(iniciais('Ana Maria Souza')).toBe('AS')
  })

  it('usa só uma letra quando o nome é uma palavra', () => {
    expect(iniciais('Ana')).toBe('A')
  })

  it('não quebra com nome vazio', () => {
    expect(iniciais('')).toBe('')
  })
})
