import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@arielladigitalconsulting/new-react-org-chart': path.resolve(
        __dirname,
        '../AriellaDigitalConsulting/new-react-org-chart/src/index.ts'
      ),
    },
  },
})
