import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5320, strictPort: true },
  preview: { host: '127.0.0.1', port: 5321 },
  build: { outDir: '../dist', emptyOutDir: true },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
});
