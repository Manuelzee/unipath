import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

export default defineConfig(({ mode }) => {
  // One .env file at the repository root serves the web app, API and scripts.
  const env = { ...loadEnv(mode, repoRoot, ''), ...process.env };
  const port = Number(env.WEB_PORT || 5173);
  const apiUrl = env.API_URL || `http://localhost:${env.PORT || 8080}`;

  return {
    base: env.BASE_PATH || '/',
    envDir: repoRoot,
    plugins: [react(), tailwindcss({ optimize: false })],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, 'src') },
      dedupe: ['react', 'react-dom'],
    },
    root: import.meta.dirname,
    build: {
      outDir: path.resolve(import.meta.dirname, 'dist/public'),
      emptyOutDir: true,
    },
    server: {
      port,
      host: env.WEB_HOST || 'localhost',
      // Same-origin /api in development, matching production where the API
      // server also serves the built web app.
      proxy: { '/api': { target: apiUrl, changeOrigin: false } },
      fs: { strict: true },
    },
    preview: {
      port,
      host: env.WEB_HOST || 'localhost',
      proxy: { '/api': { target: apiUrl, changeOrigin: false } },
    },
  };
});
