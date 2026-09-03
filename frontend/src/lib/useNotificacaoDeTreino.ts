import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { api } from './api'
import { sincronizarTreino } from './notificacoes'
import { useAuth } from '../auth/useAuth'
import type { SessaoCompleta } from '../types'

/**
 * Alinha a barra de notificação com o banco quando o app abre, e leva para a
 * tela do treino quando a notificação é tocada.
 *
 * Mora no AppShell, e não no AlunoLayout, porque o caso que originou a ideia é
 * o professor que também treina: abrir o app em /professor precisa reconciliar
 * do mesmo jeito.
 */
export function useNotificacaoDeTreino() {
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const ehAluno = Boolean(usuario?.perfis.aluno)

  // O useNavigate do react-router 6 é memoizado com o pathname na lista, então
  // a identidade muda a cada navegação. Como dependência do efeito, ele fazia a
  // "reconciliação na abertura do app" virar um GET da sessão + schedule
  // inteiro a cada toque na barra inferior.
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !ehAluno) return

    let cancelado = false

    api
      .get<SessaoCompleta | null>('/alunos/treino/sessao')
      .then(({ data }) => {
        if (!cancelado) return sincronizarTreino(data)
      })
      // Notificação é enfeite: falha de rede aqui não pode aparecer na tela.
      .catch(() => {})

    const promessa = LocalNotifications.addListener('localNotificationActionPerformed', (evento) => {
      const rota = evento.notification.extra?.rota
      // Sem isso o toque só traz o app à frente, na tela em que ele estava.
      if (typeof rota === 'string') navigateRef.current(rota)
    })

    return () => {
      cancelado = true
      // Promise.resolve() por segurança: no aparelho, testado via CDP, o retorno
      // do addListener não bate com o `.then` direto do tipo declarado — sem
      // isso o ouvinte nunca é removido no APK.
      Promise.resolve(promessa)
        .then((ouvinte) => ouvinte.remove())
        .catch(() => {})
    }
  }, [ehAluno])
}
