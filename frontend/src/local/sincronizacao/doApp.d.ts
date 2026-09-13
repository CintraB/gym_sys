/**
 * Tipos do motor de sincronização para as telas.
 *
 * Mesmo padrão de `src/local/index.d.ts`: o núcleo é JavaScript, e o que as
 * telas em TypeScript enxergam é declarado aqui.
 */
export interface EstadoSincronizacao {
  ligada: boolean
  /** `null` enquanto nenhuma tentativa aconteceu nesta sessão do app. */
  online: boolean | null
  ultima: string | null
  ocupada: boolean
}

export interface ResumoDoRecomeco {
  usuario: { id: number; nome: string; cpf: string }
  exercicios: number
  blocos: number
  exerciciosDaFicha: number
}

export interface ResultadoDaSincronizacao {
  enviadas?: number
  repetidas?: number
  falhas?: number
  falhasDeRede?: number
  online?: boolean | null
  ligada?: boolean
  ocupada?: boolean
  precisaEntrarDeNovo?: boolean
  erro?: string
}

export interface MotorDeSincronizacao {
  estado(): EstadoSincronizacao
  assinar(ouvinte: (estado: EstadoSincronizacao) => void): () => void
  entrarNaSincronizacao(credencial: { cpf: string; senha: string }): Promise<ResumoDoRecomeco>
  sair(): void
  sincronizar(): Promise<ResultadoDaSincronizacao>
  pendentes(): Promise<Array<{ id_sessao: number }>>
}

export function sincronizacaoDoApp(): MotorDeSincronizacao
export function esquecerSincronizacaoDoApp(): void
