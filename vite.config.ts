import { writeFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

function localSavePlugin(): Plugin {
  return {
    name: 'local-save',
    configureServer(server) {
      server.middlewares.use('/api/save-sample', (req, res, next) => {
        if (req.method !== 'POST') return next()
        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk })
        req.on('end', () => {
          try {
            const { name, content } = JSON.parse(body) as { name: string; content: string }
            const filePath = resolve(__dirname, 'src/samples', `${name}.json`)
            writeFileSync(filePath, content, 'utf8')
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true }))
          } catch (e) {
            res.writeHead(500)
            res.end(JSON.stringify({ error: String(e) }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), localSavePlugin()],
  server: {
    host: true,          // bind to 0.0.0.0 so the container's network interface is reachable
    allowedHosts: true,  // allow any Host header (needed for Codespaces / VS Code tunnels)
  },
})
