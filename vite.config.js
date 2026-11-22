import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/',
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html')
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      }
    }
  }
});
