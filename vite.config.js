import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '')
  const proxyTarget =
    env.VITE_OLLAMA_PROXY_TARGET || 'http://ai.turtleware.au:11434'

  const proxyConfig = {
    '/ollama': {
      target: proxyTarget,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/ollama/, ''),
    },
  }

  return {
    plugins: [react()],
    server: {
      proxy: proxyConfig,
    },
    preview: {
      proxy: proxyConfig,
    },
  }
})
