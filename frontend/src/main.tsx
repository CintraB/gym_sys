import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

/**
 * No APK não existe rede: o núcleo do backend roda dentro do próprio
 * aplicativo, e o adapter do axios entrega as chamadas a ele.
 *
 * Os imports são dinâmicos para o build web não carregar nada disto — e a
 * condição é resolvida no build, então o tree-shaking remove o bloco inteiro
 * quando o modo é web.
 *
 * O render fica dentro da função, e não solto no topo, por duas razões: nenhuma
 * tela chega a tentar uma rede que não existe, e o `await` deixa de ser
 * top-level — que o alvo do build não aceita.
 */
async function iniciar() {
  if (import.meta.env.VITE_MODO_APP === 'standalone') {
    const { ligarAppLocal } = await import('./local/index.js')
    const { abrirBancoDoAparelho } = await import('./local/bancoDoAparelho.js')
    const { instalarAdaptador } = await import('./lib/api')

    instalarAdaptador(ligarAppLocal({ driver: await abrirBancoDoAparelho() }))
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

iniciar()
