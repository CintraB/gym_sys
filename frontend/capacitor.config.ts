import type { CapacitorConfig } from '@capacitor/cli'

/**
 * O `webDir` aponta para `dist-app`, e não `dist`: é a saída do
 * `build:standalone`, a única que leva o núcleo do backend dentro. Empacotar
 * `dist` geraria um APK que tenta falar com um servidor que não existe.
 */
const config: CapacitorConfig = {
  appId: 'com.cintra.gymsys',
  appName: 'Gym Sys',
  webDir: 'dist-app',
  android: {
    // O aplicativo é offline: não há conteúdo remoto para carregar, e permitir
    // conteúdo misto só abriria caminho para requisição em texto claro.
    allowMixedContent: false,
  },
}

export default config
