import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const fonnteToken = String(env.VITE_FONNTE_TOKEN || env.FONNTE_TOKEN || process.env.FONNTE_TOKEN || '').trim()

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.FONNTE_TOKEN': JSON.stringify(fonnteToken),
    },
  }
})
