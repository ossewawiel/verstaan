import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// apps/console/client: `npm run dev` proxies /api and /events to the Fastify server (issue 99);
// `npm run build` emits the built client into apps/console/dist, which the server then serves.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:7864',
      '/events': { target: 'http://127.0.0.1:7864', ws: false },
      '/health': 'http://127.0.0.1:7864',
    },
  },
});
