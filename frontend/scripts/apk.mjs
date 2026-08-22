import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Gera o APK de depuração.
 *
 * Existe porque `JAVA_HOME` e `ANDROID_HOME` não estão definidos nesta máquina —
 * o Java vive dentro do Android Studio. Sem resolver os dois, o Gradle falha com
 * "JAVA_HOME is not set", que não diz o que fazer a respeito.
 *
 * Depuração, e não release: para uso próprio basta, e release exigiria gerar e
 * guardar uma keystore.
 */
const estudio = process.env.ANDROID_STUDIO ?? 'C:\\Program Files\\Android\\Android Studio'

/**
 * Acha um JDK que o Gradle aceite.
 *
 * O JDK embutido no Android Studio é o **25**, e o Gradle 8.14 com AGP 8.13 que
 * o Capacitor gera vai até o 24 — a falha é um enigmático "Unsupported class
 * file major version 69". Por isso a busca prefere um JDK 21 instalado, e o
 * `jbr` do Studio fica só como último recurso.
 *
 * `JAVA_HOME` no ambiente sempre ganha: quem define sabe o que quer.
 */
function acharJdk() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME

  const candidatos = [
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\Java',
    join(process.env.USERPROFILE ?? '', '.jdks'),
  ]

  for (const raiz of candidatos) {
    if (!existsSync(raiz)) continue
    const compativel = readdirSync(raiz)
      .filter((nome) => /(^|[-.])(21|17)([-.]|$)/.test(nome))
      .map((nome) => join(raiz, nome))
      .find((caminho) => existsSync(join(caminho, 'bin', 'java.exe')))
    if (compativel) return compativel
  }

  return join(estudio, 'jbr')
}

const javaHome = acharJdk()
const androidHome =
  process.env.ANDROID_HOME ?? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk')

for (const [nome, caminho] of [
  ['JAVA_HOME', javaHome],
  ['ANDROID_HOME', androidHome],
]) {
  if (!existsSync(caminho)) {
    console.error(`${nome} não encontrado em ${caminho}.`)
    console.error(`Defina a variável de ambiente ${nome} e rode de novo.`)
    process.exit(1)
  }
}

const pastaAndroid = join(process.cwd(), 'android')
if (!existsSync(pastaAndroid)) {
  console.error('A pasta android/ não existe. Rode: npx cap add android')
  process.exit(1)
}

const gradlew = join(pastaAndroid, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')

console.log(`JAVA_HOME=${javaHome}`)
console.log(`ANDROID_HOME=${androidHome}`)

// No Windows o wrapper é um `.bat`, e o Node passou a recusar executá-lo
// diretamente — correção de segurança dele. A saída é chamar pelo `cmd.exe`, e
// não usar `shell: true`: com shell os argumentos são concatenados em vez de
// escapados, o que o próprio Node avisa ser vulnerável.
const [programa, argumentos] =
  process.platform === 'win32'
    ? ['cmd.exe', ['/c', gradlew, 'assembleDebug']]
    : [gradlew, ['assembleDebug']]

execFileSync(programa, argumentos, {
  cwd: pastaAndroid,
  stdio: 'inherit',
  env: {
    ...process.env,
    JAVA_HOME: javaHome,
    ANDROID_HOME: androidHome,
    ANDROID_SDK_ROOT: androidHome,
  },
})

const apk = join(pastaAndroid, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
if (!existsSync(apk)) {
  console.error('O Gradle terminou, mas o APK não foi encontrado onde se esperava.')
  process.exit(1)
}
console.log(`\nAPK pronto: ${apk}`)
