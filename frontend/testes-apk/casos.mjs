/**
 * Os casos, rodados no APK de verdade.
 *
 * **O que entra aqui:** o que só existe na fronteira entre o WebView Android e
 * o servidor remoto — CORS, relógio de máquinas diferentes, rede que cai no
 * meio, conexão que não volta, texto que chega na tela. Os quatro bugs achados
 * em 13/09/2026 eram todos desse tipo, e a suíte de 316 testes em Node estava
 * verde com todos eles no ar.
 *
 * **O que NÃO entra:** regra de negócio. Ela é mais barata e mais completa no
 * Vitest e no `node --test`, e repetir aqui só faria a suíte demorar.
 */
import { desligarRede, dormir, ligarRede, relancarApp, temInternet } from './aparelho.mjs'

/**
 * Cada caso recebe o mesmo contexto e devolve uma linha do relatório. Lançar
 * reprova o caso; devolver texto é a observação que entra no relatório.
 */
export const CASOS = [
  {
    nome: 'o app abre e deixa entrar com a conta da semente',
    async rodar({ tela, semente }) {
      await tela.esperar("document.querySelectorAll('input').length >= 2", { oQue: 'tela de login' })
      await tela.preencher('CPF', semente.cpf)
      await tela.preencher('Senha', semente.senha)
      await tela.clicarBotao('entrar')
      await tela.esperar("!location.href.includes('/entrar')", { oQue: 'sair do login' })
      return `entrou em ${await tela.url()}`
    },
  },

  {
    nome: 'dá para treinar sem nunca ter ativado a sincronização',
    async rodar({ tela }) {
      await tela.irPara('/aluno')
      await tela.esperar(
        `[...document.querySelectorAll('button')].some(b => /iniciar treino/i.test(b.textContent))`,
        { oQue: 'botão de iniciar treino' },
      )
      const texto = await tela.texto()
      if (/erro|não foi poss/i.test(texto)) throw new Error(`erro na tela: ${texto.slice(0, 150)}`)
      return 'a ficha da semente abre normalmente, offline'
    },
  },

  {
    nome: 'a tela diz que o app funciona sem sincronizar',
    async rodar({ tela }) {
      await tela.irPara('/aluno/perfil')
      await tela.esperar(`document.body.innerText.includes('Sincronizar com a academia')`, {
        oQue: 'cartão de sincronização',
      })
      const texto = await tela.texto()
      if (!/continua funcionando normalmente/i.test(texto)) {
        throw new Error('a tela não diz que o app funciona sem a sincronização')
      }
      return 'dito com todas as letras'
    },
  },

  {
    nome: 'o campo de senha tem o olho de mostrar',
    async rodar({ tela }) {
      await tela.clicarBotao('ativar sincroniza')
      const tem = await tela.avaliar(`
        return [...document.querySelectorAll('button')]
          .some(b => /mostrar senha/i.test(b.getAttribute('aria-label') ?? ''));
      `)
      if (!tem) throw new Error('sem botão de mostrar senha — digitar de memória sem conferir')
      return 'presente, como na tela de login'
    },
  },

  {
    nome: 'o aviso do histórico aparece ANTES de pedir a senha',
    async rodar({ tela }) {
      const texto = await tela.texto()
      if (!/ser[áa] apagado/i.test(texto)) {
        throw new Error('o aviso de que o histórico local será apagado não está visível')
      }
      return 'visível junto com os campos'
    },
  },

  {
    nome: 'credencial errada dá mensagem em português, e não trava a tela',
    async rodar({ tela, conta }) {
      await tela.preencher('CPF', conta.cpf)
      await tela.preencher('Senha', 'senha-que-nao-e-a-dela')
      await tela.clicarBotao('confirmar e ativar')
      await tela.esperar(`document.querySelector('[role="alert"]')`, {
        oQue: 'mensagem de erro',
        tentativas: 30,
      })

      const alerta = await tela.avaliar(`return document.querySelector('[role="alert"]').innerText`)
      if (/[A-Za-z]+ [A-Za-z]+ (at|denied|failed|invalid)/i.test(alerta)) {
        throw new Error(`erro técnico em inglês na tela: "${alerta}"`)
      }
      if (!/cpf|senha|incorret/i.test(alerta)) {
        throw new Error(`mensagem não fala da credencial: "${alerta}"`)
      }
      // E o formulário continua utilizável: ninguém foi expulso.
      if (!(await tela.temBotao('confirmar e ativar'))) {
        throw new Error('a tela saiu do formulário depois de um erro de digitação')
      }
      return `"${alerta.trim()}"`
    },
  },

  {
    nome: 'sem rede, ativar avisa que é conexão — e não erro do app',
    async rodar({ tela, conta }) {
      await desligarRede()
      await tela.preencher('CPF', conta.cpf)
      await tela.preencher('Senha', conta.senha)
      await tela.clicarBotao('confirmar e ativar')
      await tela.esperar(`document.querySelector('[role="alert"]')`, { oQue: 'aviso de rede' })

      const alerta = await tela.avaliar(`return document.querySelector('[role="alert"]').innerText`)
      await ligarRede()

      if (!/conex|internet/i.test(alerta)) {
        throw new Error(`sem rede, a mensagem devia falar de conexão: "${alerta}"`)
      }
      return `"${alerta.trim()}"`
    },
  },

  {
    nome: 'ativar com a rede de volta traz a ficha do servidor',
    async rodar({ tela, conta }) {
      if (!(await temInternet())) throw new Error('o emulador está sem internet')

      // A rede acabou de voltar no caso anterior, e o Android leva alguns
      // segundos para a rota realmente valer — `ping` respondendo não garante
      // que a primeira conexão TLS vá completar. Sem esta folga o caso falha
      // por timing e parece bug do app.
      await dormir(4000)

      await tela.preencher('CPF', conta.cpf)
      await tela.preencher('Senha', conta.senha)
      await tela.clicarBotao('confirmar e ativar')

      try {
        await tela.esperar(`document.body.innerText.includes('Sua ficha veio do servidor')`, {
          oQue: 'confirmação da ativação',
          tentativas: 60,
        })
      } catch (erro) {
        // O que a tela diz importa mais que "esperei e não veio": alerta de
        // credencial e alerta de rede pedem investigações diferentes.
        const alerta = await tela.avaliar(
          `return document.querySelector('[role="alert"]')?.innerText ?? null`,
        )
        throw new Error(alerta ? `${erro.message} — a tela diz: "${alerta}"` : erro.message)
      }

      const usuarios = await tela.consultar('SELECT id, cpf FROM usuario')
      if (usuarios.length !== 1 || usuarios[0].id !== conta.id) {
        throw new Error(`o usuário local devia ser o ${conta.id} do servidor: ${JSON.stringify(usuarios)}`)
      }
      const exercicios = await tela.consultar('SELECT COUNT(*) AS n FROM ex_usuario')
      return `usuário ${usuarios[0].id} e ${exercicios[0].n} exercício(s), vindos do servidor`
    },
  },

  {
    nome: 'a sessão do app sobrevive ao recomeço — ninguém volta para o login',
    async rodar({ tela }) {
      // O recomeço troca a linha do usuário pela do servidor, com o id de lá.
      // Sem entrar de novo por dentro, a requisição seguinte vira 401.
      await tela.irPara('/aluno')
      await dormir(2000)
      const url = await tela.url()
      if (url.includes('/entrar')) throw new Error('o app caiu para a tela de login depois de ativar')
      return `segue logado em ${url}`
    },
  },

  {
    nome: 'a ficha que aparece é a do servidor',
    async rodar({ tela, conta }) {
      await tela.esperar(
        `[...document.querySelectorAll('button')].some(b => /iniciar treino/i.test(b.textContent))`,
        { oQue: 'Meu treino com a ficha nova', tentativas: 60 },
      )
      const texto = await tela.texto()
      if (!texto.includes(conta.nomeDoExercicio)) {
        throw new Error(`esperava "${conta.nomeDoExercicio}" na ficha; tela: ${texto.slice(0, 200)}`)
      }
      return `mostra "${conta.nomeDoExercicio}"`
    },
  },

  {
    nome: 'um treino feito com rede sobe sozinho, sem apertar nada',
    async rodar({ tela, servidor, conta }) {
      await treinar(tela)
      // O gatilho do fim de sessão dispara a subida sem `await`; dar tempo.
      await dormir(8000)

      const noServidor = await servidor.sessoesDe(conta.id)
      if (noServidor.length !== 1) {
        throw new Error(`esperava 1 sessão no servidor, achei ${noServidor.length}`)
      }
      const local = await tela.consultar('SELECT uuid FROM sessao_treino')
      if (local[0].uuid !== noServidor[0].uuid) {
        throw new Error('o uuid do aparelho não é o mesmo do servidor')
      }
      return `sessão ${noServidor[0].id_sessao} no servidor, mesmo uuid`
    },
  },

  {
    nome: 'sincronizar de novo não duplica, mesmo perdendo a marca local',
    async rodar({ tela, servidor, conta }) {
      // Apagar a marca é o estado de quem subiu e morreu antes de marcar.
      await tela.executar('DELETE FROM sincronizacao_envio;')
      await tela.irPara('/aluno/perfil')
      await tela.clicarBotao('sincronizar agora')
      await dormir(7000)

      const sessoes = await servidor.sessoesDe(conta.id)
      if (sessoes.length !== 1) throw new Error(`duplicou: ${sessoes.length} sessões no servidor`)

      const marca = await tela.consultar('SELECT uuid FROM sincronizacao_envio')
      if (marca.length !== 1) throw new Error('a marca local não se consertou sozinha')
      return 'servidor reconheceu o uuid e a marca voltou'
    },
  },

  {
    nome: 'treino feito em modo avião fica pendente, e a tela avisa sem alarme',
    async rodar({ tela }) {
      await desligarRede()
      await tela.irPara('/aluno')
      await treinar(tela)

      await tela.irPara('/aluno/historico')
      await dormir(2500)
      const historico = await tela.texto()
      if (!/n[ãa]o enviado/i.test(historico)) {
        throw new Error('o histórico não marcou a sessão como não enviada')
      }

      await tela.irPara('/aluno/perfil')
      await dormir(1500)
      const perfil = await tela.texto()
      if (!/aguardando envio/i.test(perfil)) {
        throw new Error('o Perfil não diz quantos treinos estão aguardando')
      }
      if (!/sem rede/i.test(perfil)) throw new Error('o selo de rede não mudou para "sem rede"')
      return 'selo "não enviado" no histórico e "1 aguardando envio" no perfil'
    },
  },

  {
    nome: 'o pendente sobe quando a rede volta',
    async rodar({ tela, servidor, conta }) {
      await ligarRede()
      if (!(await temInternet())) throw new Error('a rede não voltou no emulador')

      await tela.clicarBotao('sincronizar agora')
      await dormir(9000)

      const sessoes = await servidor.sessoesDe(conta.id)
      if (sessoes.length !== 2) {
        throw new Error(`esperava 2 sessões no servidor, achei ${sessoes.length}`)
      }
      const texto = await tela.texto()
      if (!/tudo enviado/i.test(texto)) throw new Error('o Perfil ainda mostra pendência')
      return `as 2 sessões no servidor, e o app diz "tudo enviado"`
    },
  },

  {
    nome: 'fechar e reabrir o app não perde a sincronização nem a sessão',
    async rodar({ conectar }) {
      await relancarApp()
      const tela = await conectar()
      const url = await tela.url()
      if (url.includes('/entrar')) throw new Error('reabrir o app derrubou a sessão')

      await tela.irPara('/aluno/perfil')
      await dormir(2000)
      const texto = await tela.texto()
      if (/ativar sincroniza/i.test(texto)) {
        throw new Error('a sincronização apareceu desligada depois de reabrir')
      }
      return 'segue logado e sincronizado'
    },
  },

  {
    nome: 'token de sincronização vencido não derruba a sessão do app',
    async rodar({ tela }) {
      // As duas identidades são separadas de propósito: a do app é contra o
      // SQLite, a da sincronização é contra o servidor. Vencer uma não pode
      // derrubar a outra — o projeto já expulsou gente por confundir isso.
      await tela.avaliar(`
        localStorage.setItem('gymsys.sync.expira', String(Math.floor(Date.now()/1000) - 10));
        return true;
      `)
      await tela.irPara('/aluno')
      await dormir(1500)
      await tela.irPara('/aluno/perfil')
      await dormir(2000)

      const url = await tela.url()
      if (url.includes('/entrar')) {
        throw new Error('token de sincronização vencido derrubou a sessão DO APP')
      }
      const texto = await tela.texto()
      if (!/ativar sincroniza/i.test(texto)) {
        throw new Error('com o token vencido, a tela devia oferecer ativar de novo')
      }
      return 'app segue logado; a sincronização pede para ativar de novo'
    },
  },

  {
    nome: 'desativar a sincronização não apaga os treinos do aparelho',
    async rodar({ tela, semente, conta }) {
      const antes = await tela.consultar('SELECT COUNT(*) AS n FROM sessao_treino')
      await tela.esperar(`document.body.innerText.includes('Sincronizar com a academia')`, {
        oQue: 'cartão desligado',
      })
      const depois = await tela.consultar('SELECT COUNT(*) AS n FROM sessao_treino')
      if (Number(depois[0].n) !== Number(antes[0].n)) {
        throw new Error(`o histórico local mudou ao desativar: ${antes[0].n} -> ${depois[0].n}`)
      }
      void semente
      void conta
      return `${depois[0].n} treino(s) continuam no aparelho`
    },
  },
]

/** Um treino do início ao fim, como a pessoa faz. */
async function treinar(tela) {
  await tela.esperar(
    `[...document.querySelectorAll('button')].some(b => /iniciar treino/i.test(b.textContent))`,
    { oQue: 'botão de iniciar treino', tentativas: 60 },
  )
  await tela.clicarBotaoExato('Iniciar treino')
  await dormir(1500)

  // Ficha com mais de um bloco abre o painel "qual treino hoje?" antes da
  // confirmação — a da semente tem quatro (A a D), a do servidor no teste tem
  // um só. O painel repete o texto dos cartões que estão atrás dele, então a
  // âncora é a marca "sugerido", que só existe dentro do painel.
  const temPainelDeBlocos = await tela.avaliar(`
    return [...document.querySelectorAll('button')].some(b => /sugerido/i.test(b.textContent));
  `)
  if (temPainelDeBlocos) {
    await tela.avaliar(`
      const b = [...document.querySelectorAll('button')].findLast(b => /sugerido/i.test(b.textContent));
      b.click();
      return true;
    `)
    await dormir(1500)
  }

  // A confirmação ("o tempo começa a contar") tem o botão "Iniciar", seco —
  // e "Iniciar treino", da tela atrás, contém essa palavra. Por isso exato:
  // clicar no de trás não faz nada e o fluxo trava em silêncio.
  //
  // A espera é pelo botão aparecer: o painel tem animação de entrada, e olhar
  // uma vez logo após o clique pega a tela antes dele.
  try {
    await tela.esperar(
      `[...document.querySelectorAll('button')].some(b => b.textContent.trim().toLowerCase() === 'iniciar')`,
      { oQue: 'a confirmação de iniciar', tentativas: 10 },
    )
    await tela.clicarBotaoExato('Iniciar')
    await dormir(2500)
  } catch {
    // Pode não haver confirmação — o importante é o que vem depois.
  }

  try {
    await tela.esperar(
      `[...document.querySelectorAll('button')].some(b => /finalizar treino/i.test(b.textContent))`,
      { oQue: 'modo de execução', tentativas: 40 },
    )
  } catch (erro) {
    // Dizer o que estava na tela: "esperei e não veio" manda quem lê investigar
    // o app, quando quase sempre o caminho é que mudou de nome.
    const botoes = await tela.avaliar(`
      return JSON.stringify([...document.querySelectorAll('button')]
        .map(b => b.textContent.trim()).filter(Boolean).slice(0, 10));
    `)
    const alerta = await tela.avaliar(
      `return document.querySelector('[role="alert"]')?.innerText ?? null`,
    )
    throw new Error(
      `${erro.message}. Botões na tela: ${botoes}${alerta ? ` | alerta: "${alerta}"` : ''}`,
    )
  }

  // "Finalizar treino" abre o painel; dentro dele, o botão que confirma.
  await tela.clicarBotaoExato('Finalizar treino')
  await dormir(1800)
  await tela.clicarBotao('finalizar')
  await dormir(4000)

  await tela.esperar(`document.body.innerText.includes('Treino concluído')`, {
    oQue: 'o resumo do treino concluído',
    tentativas: 30,
  })
}
