import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // host: true expõe o dev server na rede local — é o que permite abrir
    // no celular pelo IP do PC enquanto se desenvolve.
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
})
