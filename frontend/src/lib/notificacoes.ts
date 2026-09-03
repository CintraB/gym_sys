import { Capacitor } from '@capacitor/core'
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications'
import type { SessaoCompleta } from '../types'

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

/**
 * Embrulha uma rotina do plugin para que ela nunca rejeite.
 *
 * As telas chamam estas funções dentro do `try` do próprio fluxo de negócio:
 * uma rejeição aqui viraria "Não foi possível iniciar o treino" com a sessão já
 * criada no servidor, tela presa em modo execução depois de descartar, ou
 * logout que não acontece. Notificação é enfeite: se o plugin falhar, o treino
 * continua. E o modo de falha nem é exótico — um `cap sync` esquecido num APK
 * futuro já basta.
 */
function aSalvo<A extends unknown[]>(rotina: (...args: A) => Promise<void>) {
  return async (...args: A): Promise<void> => {
    try {
      await rotina(...args)
    } catch {
      // Silêncio de propósito: nenhuma tela depende do resultado.
    }
  }
}

export const limparTreino = aSalvo(async () => {
  if (!noAparelho()) return
  await LocalNotifications.cancel({
    notifications: [{ id: ID_EM_ANDAMENTO }, { id: ID_LEMBRETE }],
  })
  // `cancel` só alcança o que está pendente. O indicador é entregue na hora
  // (não tem schedule.at), e o Android do plugin só chama
  // dismissVisibleNotification no schedule e no toque — nunca no cancel. Como
  // ele é `ongoing`, nem deslizando o usuário tira: sem esta linha o
  // indicador fica grudado na barra para sempre.
  await LocalNotifications.removeDeliveredNotificationsById({
    ids: [ID_EM_ANDAMENTO, ID_LEMBRETE],
  })
})

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

const CANAL_EM_ANDAMENTO = 'treino-em-andamento'
const CANAL_LEMBRETES = 'lembretes'

/**
 * Dois canais, não um.
 *
 * O indicador é informação, não alerta: com importância padrão, iniciar o
 * treino faria o celular tocar dentro da academia. O lembrete é o oposto —
 * precisa chamar quem já esqueceu, e silencioso não serviria para nada.
 *
 * Recriar canal existente é no-op no Android, e createChannel não desfaz o que
 * a pessoa mudou à mão nas configurações.
 */
async function garantirCanais() {
  await LocalNotifications.createChannel({
    id: CANAL_EM_ANDAMENTO,
    name: 'Treino em andamento',
    description: 'Indicador fixo enquanto há um treino aberto',
    importance: 1,
  })
  await LocalNotifications.createChannel({
    id: CANAL_LEMBRETES,
    name: 'Lembretes',
    description: 'Avisos sobre treino esquecido em andamento',
    importance: 3,
  })
}

const horaDe = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/**
 * Posta o indicador fixo do treino em andamento e agenda o lembrete de
 * HORAS_ATE_LEMBRETE horas, numa chamada só de schedule.
 */
export const anunciarTreino = aSalvo(async ({ sessao }: SessaoCompleta) => {
  if (!noAparelho()) return
  if (!(await garantirPermissao())) return

  await garantirCanais()

  const titulo = sessao.bloco_letra
    ? `Treino ${sessao.bloco_letra} em andamento`
    : 'Treino em andamento'

  // A hora vai no corpo porque o plugin não expõe o campo `when` do Android:
  // sem ela, a notificação reposta pela reconciliação diria "agora" para um
  // treino de duas horas.
  const inicio = `começou às ${horaDe(sessao.iniciado_em)}`
  const corpo = sessao.bloco_nome ? `${sessao.bloco_nome} · ${inicio}` : `${inicio} · toque para voltar`

  // isExactNotification é `true` por padrão em toda notificação, tenha ela
  // schedule.at ou não. Com targetSdkVersion 36 (variables.gradle) a permissão
  // de alarme exato vem negada desde o Android 14, e aí o plugin abre a tela
  // "Alarmes e lembretes" do sistema por cima do app a cada schedule. Nada aqui
  // precisa de exatidão: o indicador nem é agendado, e um lembrete de 2 horas
  // aguenta a janela do doze. Não "limpar" estas linhas.
  const notificacoes: LocalNotificationSchema[] = [
    {
      id: ID_EM_ANDAMENTO,
      title: titulo,
      body: corpo,
      channelId: CANAL_EM_ANDAMENTO,
      ongoing: true,
      autoCancel: false,
      isExactNotification: false,
      extra: { rota: '/aluno' },
    },
  ]

  const quandoLembrar = new Date(
    new Date(sessao.iniciado_em).getTime() + HORAS_ATE_LEMBRETE * 60 * 60 * 1000,
  )

  // Lembrete vencido é descartado, não disparado no ato: quem abre o app já
  // está olhando para o treino em andamento.
  if (quandoLembrar.getTime() > Date.now()) {
    notificacoes.push({
      id: ID_LEMBRETE,
      title: 'Treino ainda em andamento',
      // O número sai da constante: escrito à mão, mudar a constante faria a
      // notificação mentir, e ninguém confere isso depois.
      body: `Você começou há ${HORAS_ATE_LEMBRETE} horas. Finalize ou descarte quando puder.`,
      channelId: CANAL_LEMBRETES,
      schedule: { at: quandoLembrar },
      isExactNotification: false,
      extra: { rota: '/aluno' },
    })
  }

  await LocalNotifications.schedule({ notifications: notificacoes })
})

/**
 * Alinha a barra de notificação com o estado real do banco.
 *
 * Existe porque o Android mata o app em segundo plano sob pressão de memória —
 * já aconteceu neste projeto, e foi o que causou o bug do perfil em 27/08.
 * Sem esta reconciliação sobraria um indicador dizendo "treino em andamento"
 * de um treino já finalizado, ou uma sessão aberta sem indicador nenhum.
 */
export const sincronizarTreino = aSalvo(async (sessao: SessaoCompleta | null) => {
  if (!noAparelho()) return
  if (sessao) await anunciarTreino(sessao)
  else await limparTreino()
})
