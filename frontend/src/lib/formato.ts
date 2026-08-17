export function somenteDigitos(valor: string) {
  return valor.replace(/\D/g, '')
}

/** 12345678901 -> 123.456.789-01 */
export function mascararCpf(valor: string) {
  const digitos = somenteDigitos(valor).slice(0, 11)
  return digitos
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

/** 123456789012 -> 1234 5678 9012 */
export function mascararTitulo(valor: string) {
  const digitos = somenteDigitos(valor).slice(0, 12)
  return digitos.replace(/(\d{4})(?=\d)/g, '$1 ')
}

export function formatarData(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function tempoRelativo(iso: string) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  if (dias < 30) return `há ${dias} dias`
  const meses = Math.floor(dias / 30)
  return meses === 1 ? 'há 1 mês' : `há ${meses} meses`
}

export function formatarCarga(carga: string | number | null) {
  if (carga === null || carga === '') return null
  const numero = Number(carga)
  if (!Number.isFinite(numero) || numero === 0) return null
  return `${numero.toLocaleString('pt-BR')} kg`
}

/**
 * Linha de detalhe de um exercício.
 * Cardio é gravado com 0 séries e repetições vazias — nesses casos a descrição
 * some em vez de virar "0 séries ·  reps".
 */
export function descreverSerie(
  numeroSerie: number,
  repeticoes: string,
  carga: string | number | null,
) {
  const partes: string[] = []
  if (numeroSerie > 0) partes.push(`${numeroSerie} séries`)
  if (repeticoes.trim()) partes.push(`${repeticoes} reps`)

  const cargaFormatada = formatarCarga(carga)
  if (cargaFormatada) partes.push(cargaFormatada)

  return partes.join(' · ')
}

/** Versão compacta: "4x10 a 15 · 20 kg". */
export function descreverSerieCurta(
  numeroSerie: number,
  repeticoes: string,
  carga: string | number | null,
) {
  const partes: string[] = []
  if (numeroSerie > 0 && repeticoes.trim()) {
    partes.push(`${numeroSerie}x${repeticoes}`)
  } else if (numeroSerie > 0) {
    partes.push(`${numeroSerie} séries`)
  }

  const cargaFormatada = formatarCarga(carga)
  if (cargaFormatada) partes.push(cargaFormatada)

  return partes.join(' · ')
}

/** 3725 -> "1h02". Para o cronômetro e para o histórico. */
export function formatarDuracao(segundos: number | null) {
  if (segundos === null || !Number.isFinite(segundos)) return '—'

  const total = Math.max(0, Math.round(segundos))
  const horas = Math.floor(total / 3600)
  const minutos = Math.floor((total % 3600) / 60)

  if (horas > 0) return `${horas}h${String(minutos).padStart(2, '0')}`
  if (minutos > 0) return `${minutos} min`
  return `${total}s`
}

/** Formato de cronômetro: 05:12 ou 1:05:12. */
export function formatarCronometro(segundos: number) {
  const total = Math.max(0, Math.floor(segundos))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60

  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0]
}

export function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : '')).toUpperCase()
}
