import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  // /api 转给后端（server/，默认 127.0.0.1:5325）；changeOrigin 让 Host 变成后端自己的地址，过后端的来源校验
  server: { host: '127.0.0.1', port: 5320, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:5325', changeOrigin: true } } },
  preview: { host: '127.0.0.1', port: 5321, proxy: { '/api': { target: 'http://127.0.0.1:5325', changeOrigin: true } } },
  build: { outDir: '../dist', emptyOutDir: true },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
});
