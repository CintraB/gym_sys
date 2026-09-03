import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

/**
 * Ids fixos. Cancelar exige conhecer o id, e um treino aberto por aluno é
 * regra do banco (idx_sessao_aberta_por_aluno) — não há duas sessões para
 * anunciar, então id fixo não colide.
 */
export const ID_EM_ANDAMENTO = 1
export const ID_LEMBRETE = 2

/** Horas de treino aberto até o lembrete. O texto da notificação deriva daqui. */
export const HORAS_ATE_LEMBRETE = 2

/**
 * Notificação é coisa de aparelho. No navegador o módulo carrega e não faz
 * nada — a versão web não ganha notificação, e chamar o plugin ali quebraria.
 */
const noAparelho = () => Capacitor.isNativePlatform()

export async function limparTreino() {
  if (!noAparelho()) return
  await LocalNotifications.cancel({
    notifications: [{ id: ID_EM_ANDAMENTO }, { id: ID_LEMBRETE }],
  })
}

/**
 * Garante a permissão de notificar, pedindo no máximo uma vez.
 *
 * O Android 13+ exige POST_NOTIFICATIONS em runtime, e só deixa pedir duas
 * vezes: depois disso o pedido é negado sem diálogo nenhum, e a única saída
 * são as configurações do sistema. Por isso quem já negou não é incomodado de
 * novo — e nada no app depende do retorno para funcionar.
 */
export async function garantirPermissao() {
  if (!noAparelho()) return false
  try {
    const atual = await LocalNotifications.checkPermissions()
    if (atual.display === 'granted') return true
    if (atual.display === 'denied') return false

    const pedido = await LocalNotifications.requestPermissions()
    return pedido.display === 'granted'
  } catch {
    // Notificação é enfeite: se o plugin falhar, o treino continua.
    return false
  }
}
