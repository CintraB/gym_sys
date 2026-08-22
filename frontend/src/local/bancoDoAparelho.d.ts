import type { DriverDeBanco } from './index'

/** Abre o banco SQLite do aparelho. Implementado na leva 3, com o Capacitor. */
export function abrirBancoDoAparelho(): Promise<DriverDeBanco>
