import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Ortak paket kaynak olarak derlenir (ayrı build gerekmez).
    alias: { '@derslik/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Geliştirmede API aynı kökenden: refresh çerezi birinci taraf kalır.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
