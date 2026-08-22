import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'


export default defineConfig(() => ({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // O service worker só é registrado em contexto seguro (HTTPS ou
      // localhost). Acessando pelo IP da rede em HTTP ele fica inerte — passa
      // a valer quando o Caddy de deploy/ estiver no ar.
      registerType: 'autoUpdate',
      includeAssets: ['logoapp.png'],
      manifest: {
        name: 'Gym Sys',
        short_name: 'Gym Sys',
        description: 'Gestão de treinos, alunos e professores da academia.',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0a0d0c',
        theme_color: '#0a0d0c',
        lang: 'pt-BR',
        icons: [
          {
            src: '/logoapp.png',
            sizes: '1024x1024',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        // SPA: qualquer rota cai no index.html, menos as chamadas de API.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Só leitura do treino e do histórico. NetworkFirst: online sempre
            // traz o dado fresco; offline devolve o último que passou por aqui,
            // que é o suficiente para conferir a série no meio da academia.
            //
            // O padrão precisa casar a URL inteira, desde o protocolo: o
            // Workbox ignora regex que não ancora no início quando a
            // requisição é cross-origin — e a API fica em outra porta.
            urlPattern: /^https?:\/\/[^/]+\/(alunos\/(meutreino|sessoes|historico)|me)$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'gymsys-leitura',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      devOptions: {
        // Desligado em dev: service worker servindo cache atrapalha o
        // hot reload e esconde mudanca recem-salva.
        enabled: false,
      },
    }),
  ],
  resolve: {
    /**
     * Troca os três arquivos do backend que não atravessam para o browser pelas
     * bordas de `src/local/`. É o que permite o app rodar os controllers de
     * verdade sem editar nenhum deles.
     *
     * Casa pelo especificador do import, e cada um destes é único no projeto —
     * conferido: `db.js` só é importado como '../config/db.js', `senha.js` só
     * como '../lib/senha.js'. O `env.js` também é importado como './env.js',
     * mas só por dentro do próprio `db.js`, que é substituído aqui — então esse
     * caminho deixa de existir.
     *
     * Vale nos testes e no build. Um teste em `src/local/troca.test.js` prova
     * que a substituição está de pé: sem ele, um caminho que deixasse de casar
     * traria `dotenv`, `pg` e `node:crypto` para dentro do APK em silêncio.
     */
    alias: [
      { find: /^\.\.\/config\/db\.js$/, replacement: fileURLToPath(new URL('./src/local/banco.js', import.meta.url)) },
      { find: /^\.\.\/config\/env\.js$/, replacement: fileURLToPath(new URL('./src/local/ambiente.js', import.meta.url)) },
      { find: /^\.\.\/lib\/senha\.js$/, replacement: fileURLToPath(new URL('./src/local/senha.js', import.meta.url)) },
    ],
  },
  server: {
    // host: true expõe o dev server na rede local — é o que permite abrir
    // no celular pelo IP do PC enquanto se desenvolve.
    host: true,
    port: 5173,
    // O modo standalone importa os controllers de ../backend, fora da raiz do
    // projeto. Sem isto o dev server recusa a leitura, e o teste que compara a
    // borda de senha com a do backend nem carrega.
    fs: { allow: ['..'] },
  },
  preview: {
    host: true,
    port: 4173,
  },
  test: {
    environment: 'jsdom',
    server: {
      deps: {
        // Sem isto o Vitest externaliza o que esta fora da raiz do projeto e
        // carrega direto pelo Node, sem passar pelos plugins — e a troca das
        // bordas nao aconteceria: os testes usariam o db.js e o env.js de
        // verdade, que exigem .env e o driver do Postgres.
        inline: [/backend[\\/]src/],
      },
    },
    setupFiles: ['./src/test/setup.ts'],
    // globals desligado: os testes importam describe/it/expect de 'vitest'.
    // Com globals ligado, o ESLint (que roda com --max-warnings 0) acusaria
    // cada um como variavel nao declarada.
    globals: false,
    css: false,
  },
}))
