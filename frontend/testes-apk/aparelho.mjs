/**
 * O aparelho, para os testes do APK: adb, WebView e a rede.
 *
 * Isto existe porque os erros que mais dói descobrir não moram na lógica — e a
 * lógica já tem 316 testes no Vitest. Moram na fronteira entre o WebView
 * Android e um servidor remoto: CORS, relógio de máquinas diferentes, conexão
 * que não volta, mensagem em inglês chegando na tela. Nada disso o Node vê.
 *
 * As armadilhas aqui já custaram caro antes, e estão todas comentadas no ponto
 * em que importam.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import WebSocket from 'ws'

const executar = promisify(execFile)

/** `adb` não está no PATH do Git Bash desta máquina. */
const ADB = 'C:/Users/crist/AppData/Local/Android/Sdk/platform-tools/adb.exe'
const EMULADOR = 'C:/Users/crist/AppData/Local/Android/Sdk/emulator/emulator.exe'

/** O applicationId REAL. Errar faz `uninstall` e `monkey` falharem calados. */
export const PACOTE = 'com.cintra.gymsys'

export const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

export async function adb(...args) {
  const { stdout } = await executar(ADB, args, { maxBuffer: 10 * 1024 * 1024 })
  return stdout.trim()
}

export async function emuladorDePe() {
  const lista = await adb('devices')
  return /emulator-\d+\s+device/.test(lista)
}

export async function subirEmulador(avd = 'gymsys') {
  if (await emuladorDePe()) return 'já estava de pé'

  // `detached` + `unref`: o emulador vive além deste processo, e esperar por
  // ele seria esperar para sempre.
  const { spawn } = await import('node:child_process')
  spawn(EMULADOR, ['-avd', avd, '-no-snapshot-load'], { detached: true, stdio: 'ignore' }).unref()

  await adb('wait-for-device')
  for (let i = 0; i < 60; i++) {
    const pronto = await adb('shell', 'getprop', 'sys.boot_completed').catch(() => '')
    if (pronto === '1') return `subiu em ~${i * 5}s`
    await dormir(5000)
  }
  throw new Error('o emulador não terminou de subir')
}

/**
 * Reinstala o APK do zero.
 *
 * `install -r` não serve: o Service Worker guarda o bundle JS antigo, e o teste
 * passaria a medir a versão anterior sem ninguém perceber.
 */
export async function reinstalar(caminhoDoApk) {
  await adb('uninstall', PACOTE).catch(() => {})
  await adb('install', caminhoDoApk)
}

export async function abrirApp() {
  await adb('shell', 'monkey', '-p', PACOTE, '-c', 'android.intent.category.LAUNCHER', '1')
  await dormir(7000)
}

export async function fecharApp() {
  await adb('shell', 'am', 'force-stop', PACOTE)
  await dormir(1500)
}

/** Mata e reabre — é como a pessoa volta ao app, e não um reload de página. */
export async function relancarApp() {
  await fecharApp()
  await abrirApp()
}

/**
 * A rede do aparelho.
 *
 * O AVD guarda o estado entre sessões: ele ficou em modo avião desde um teste
 * de setembro, e a primeira suspeita foi do código — não era. Por isso todo
 * caso que precisa de rede a liga explicitamente, em vez de presumir.
 */
export async function ligarRede() {
  await adb('shell', 'settings', 'put', 'global', 'airplane_mode_on', '0')
  await adb('shell', 'su', '0', 'am', 'broadcast', '-a', 'android.intent.action.AIRPLANE_MODE', '--ez', 'state', 'false').catch(() => {})
  await adb('shell', 'svc', 'data', 'enable')
  await dormir(6000)
}

export async function desligarRede() {
  await adb('shell', 'svc', 'data', 'disable')
  await adb('shell', 'settings', 'put', 'global', 'airplane_mode_on', '1')
  await adb('shell', 'su', '0', 'am', 'broadcast', '-a', 'android.intent.action.AIRPLANE_MODE', '--ez', 'state', 'true').catch(() => {})
  await dormir(4000)
}

export async function temInternet() {
  const saida = await adb('shell', 'ping', '-c', '1', '-W', '2', '8.8.8.8').catch(() => '')
  return /1 received/.test(saida)
}

/**
 * Abre o DevTools do WebView.
 *
 * O nome do socket muda a cada instalação e relançamento, então ele é
 * descoberto toda vez — guardar o anterior dá "connection refused" sem dizer
 * por quê.
 */
export async function conectarNaTela() {
  const unix = await adb('shell', 'cat', '/proc/net/unix')
  const socket = unix.match(/webview_devtools_remote_\d+/)?.[0]
  if (!socket) throw new Error('o WebView não está exposto — o app abriu?')

  await adb('forward', '--remove-all').catch(() => {})
  await adb('forward', 'tcp:9222', `localabstract:${socket}`)

  const resposta = await fetch('http://localhost:9222/json')
  const pagina = (await resposta.json()).find((p) => p.type === 'page')
  if (!pagina) throw new Error('nenhuma página no WebView (só o service worker?)')

  return new Tela(pagina.webSocketDebuggerUrl)
}

/** A página do app, por CDP. */
export class Tela {
  constructor(url) {
    this.socket = new WebSocket(url)
    this.proximoId = 1
    this.pendentes = new Map()
    /**
     * Erros do console, guardados para o relatório.
     *
     * Sem isto, um caso que falha diz só "esperei e não veio" — e a causa, que
     * o app gritou no console, fica invisível. Era preciso escrever um script
     * separado a cada investigação.
     */
    this.errosDoConsole = []
    this.pronta = new Promise((resolve) => this.socket.once('open', resolve))

    this.socket.on('message', (dados) => {
      const msg = JSON.parse(dados)

      if (msg.id && this.pendentes.has(msg.id)) {
        this.pendentes.get(msg.id)(msg)
        this.pendentes.delete(msg.id)
        return
      }

      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        const texto = msg.params.args
          .map((a) => a.value ?? a.description ?? '')
          .join(' ')
          .trim()
        // O plugin de SQLite loga cada chamada como grupo; só o que for erro de
        // verdade interessa.
        if (texto && !/^%c/.test(texto)) this.errosDoConsole.push(texto)
      }

      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails
        this.errosDoConsole.push(d.exception?.description ?? d.text)
      }
    })
  }

  /** Os erros desde a última leitura. */
  drenarErros() {
    const erros = this.errosDoConsole.slice(-8)
    this.errosDoConsole = []
    return erros
  }

  async abrir() {
    await this.pronta
    await this.enviar('Runtime.enable')
    return this
  }

  enviar(metodo, params = {}) {
    const id = this.proximoId++
    return new Promise((resolve, reject) => {
      this.pendentes.set(id, (msg) =>
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result),
      )
      this.socket.send(JSON.stringify({ id, method: metodo, params }))
    })
  }

  async avaliar(expressao) {
    const r = await this.enviar('Runtime.evaluate', {
      expression: `(async () => { ${expressao} })()`,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? 'erro no JavaScript da página')
    }
    return r.result.value
  }

  texto() {
    return this.avaliar('return document.body.innerText')
  }

  url() {
    return this.avaliar('return location.href')
  }

  /** Espera uma condição da página. Sempre por algo que se vai usar. */
  async esperar(expressao, { tentativas = 40, intervalo = 500, oQue = expressao } = {}) {
    for (let i = 0; i < tentativas; i++) {
      if (await this.avaliar(`return !!(${expressao})`)) return
      await dormir(intervalo)
    }
    throw new Error(`esperei ${(tentativas * intervalo) / 1000}s e não veio: ${oQue}`)
  }

  /**
   * Clica num botão pelo texto.
   *
   * `findLast`, e não `find`: painel sobre a tela reaproveita o texto do botão
   * que está atrás dele, e clicar no de trás não faz nada nem dá erro — o
   * fluxo simplesmente trava.
   */
  async clicarBotao(texto) {
    const clicou = await this.avaliar(`
      const b = [...document.querySelectorAll('button')]
        .findLast(b => b.textContent.trim().toLowerCase().includes('${texto.toLowerCase()}'));
      if (!b) return false;
      b.click();
      return true;
    `)
    if (!clicou) throw new Error(`não achei o botão "${texto}"`)
    await dormir(700)
  }

  /**
   * Clica num botão cujo texto é EXATAMENTE o informado.
   *
   * Necessário quando um rótulo é prefixo do outro: "Iniciar" (a confirmação)
   * contra "Iniciar treino" (a tela atrás dela). Com `includes`, clicar em
   * "iniciar" pode acertar o de trás e o fluxo trava sem erro nenhum.
   */
  async clicarBotaoExato(texto) {
    const clicou = await this.avaliar(`
      const b = [...document.querySelectorAll('button')]
        .findLast(b => b.textContent.trim().toLowerCase() === '${texto.toLowerCase()}');
      if (!b) return false;
      b.click();
      return true;
    `)
    if (!clicou) throw new Error(`não achei o botão exatamente "${texto}"`)
    await dormir(700)
    return true
  }

  temBotaoExato(texto) {
    return this.avaliar(`
      return [...document.querySelectorAll('button')]
        .some(b => b.textContent.trim().toLowerCase() === '${texto.toLowerCase()}');
    `)
  }

  temBotao(texto) {
    return this.avaliar(`
      return [...document.querySelectorAll('button')]
        .some(b => b.textContent.trim().toLowerCase().includes('${texto.toLowerCase()}'));
    `)
  }

  /**
   * Navega pelo link.
   *
   * `history.pushState` não faz o React Router navegar neste WebView, e o
   * evento de mouse do CDP também não — a tela fica parada, sem erro.
   */
  async irPara(href) {
    const foi = await this.avaliar(`
      const a = [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === '${href}');
      if (!a) return false;
      a.click();
      return true;
    `)
    if (!foi) throw new Error(`não achei o link ${href}`)
    await dormir(1500)
  }

  /**
   * Preenche um campo pelo rótulo.
   *
   * `.value = x` não serve (o React não vê) e o setter nativo dá "Illegal
   * invocation" neste WebView. O caminho que funciona é focar e usar
   * `Input.insertText`.
   */
  async preencher(rotulo, valor) {
    const caixa = await this.avaliar(`
      const campo = [...document.querySelectorAll('label')]
        .find(l => l.textContent.trim().toLowerCase().startsWith('${rotulo.toLowerCase()}'));
      if (!campo) return null;
      const input = document.getElementById(campo.getAttribute('for'));
      if (!input) return null;
      input.scrollIntoView({ block: 'center' });
      const r = input.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    `)
    if (!caixa) throw new Error(`não achei o campo "${rotulo}"`)

    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.enviar('Input.dispatchMouseEvent', { type, ...caixa, button: 'left', clickCount: 1 })
    }

    // Selecionar tudo antes de escrever: `Input.insertText` **anexa** ao valor
    // que já está lá. Preencher o mesmo campo duas vezes num roteiro (depois de
    // um erro, por exemplo) montava "9090090090290900900902" e o caso falhava
    // como se o app tivesse recusado a credencial certa.
    for (const type of ['keyDown', 'keyUp']) {
      await this.enviar('Input.dispatchKeyEvent', {
        type,
        key: 'a',
        code: 'KeyA',
        windowsVirtualKeyCode: 65,
        modifiers: 2, // Control
      })
    }

    await this.enviar('Input.insertText', { text: valor })
    await dormir(300)

    // Conferir o que ficou no campo: digitação que não entrou é a causa mais
    // chata de falso vermelho, e o erro fica longe da origem.
    const escrito = await this.avaliar(`
      const campo = [...document.querySelectorAll('label')]
        .find(l => l.textContent.trim().toLowerCase().startsWith('${rotulo.toLowerCase()}'));
      return document.getElementById(campo.getAttribute('for')).value;
    `)
    // Campo com máscara devolve formatado — o CPF vira "081.059.076-07". Para
    // valor de só dígitos, o que interessa são os dígitos.
    const soDigitos = /^\d+$/.test(valor)
    const conferido = soDigitos ? escrito.replace(/\D/g, '') : escrito
    if (conferido !== valor) {
      throw new Error(`o campo "${rotulo}" ficou com "${escrito}" em vez de "${valor}"`)
    }
  }

  /** Consulta o SQLite do aparelho, pelo plugin que a página já tem. */
  async consultar(sql) {
    return this.avaliar(`
      const p = window.Capacitor.Plugins.CapacitorSQLite;
      return (await p.query({ database: 'gymsys', statement: ${JSON.stringify(sql)}, values: [] })).values;
    `)
  }

  /** Escreve no SQLite do aparelho. `transaction: false` é obrigatório. */
  async executar(sql) {
    return this.avaliar(`
      const p = window.Capacitor.Plugins.CapacitorSQLite;
      await p.execute({ database: 'gymsys', statements: ${JSON.stringify(sql)}, transaction: false });
      return true;
    `)
  }

  fechar() {
    this.socket.close()
  }
}
