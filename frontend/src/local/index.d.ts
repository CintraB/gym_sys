import type { AxiosAdapter } from 'axios'

/**
 * Tipos do núcleo local, para o TypeScript do app.
 *
 * Existe este arquivo, e não `.ts` em `src/local/`, porque aquele código
 * conversa com o backend, que é JS. O atrito de tipos fica isolado aqui.
 */

/** O driver de banco do ambiente: SQLite nativo no APK, node:sqlite nos testes. */
export interface DriverDeBanco {
  query: (texto: string, valores?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
  connect: () => Promise<{ query: DriverDeBanco['query']; release: () => void }>
  end: () => Promise<void>
}

export function ligarAppLocal(opcoes: { driver: DriverDeBanco }): AxiosAdapter
