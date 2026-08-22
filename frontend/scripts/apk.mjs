import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
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
const javaHome = process.env.JAVA_HOME ?? join(estudio, 'jbr')
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

execFileSync(gradlew, ['assembleDebug'], {
  cwd: pastaAndroid,
  stdio: 'inherit',
  // No Windows o wrapper é um .bat, e o Node passou a recusar executá-lo
  // diretamente — uma correção de segurança dele. Pelo shell funciona, e o
  // único argumento aqui não tem espaço nem caractere para escapar.
  shell: process.platform === 'win32',
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
