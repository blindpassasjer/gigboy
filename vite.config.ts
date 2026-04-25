import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Set base to './' for GitHub Pages subdirectory deployment.
// Override with VITE_BASE env var if deploying to a custom domain root.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? './',
})
