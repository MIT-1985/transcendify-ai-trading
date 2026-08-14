import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

// Обикновен Vite + React проект. Приставката на base44 я няма - тя вкарваше
// техния SDK през @/entities и @/integrations и правеше проекта незапускаем без
// техен акаунт. Псевдонимът "@" върши същата работа, но е част от Vite.
export default defineConfig({
  logLevel: 'error',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
  server: {
    proxy: {
      // Интерфейсът вика двигателя на същия адрес - без CORS и без адрес,
      // зашит в кода при пускане в браузър.
      '/api': {
        target: process.env.ENGINE_URL ?? 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
});
