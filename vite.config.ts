import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,          // bind to 0.0.0.0 so the container's network interface is reachable
    allowedHosts: true,  // allow any Host header (needed for Codespaces / VS Code tunnels)
  },
})
