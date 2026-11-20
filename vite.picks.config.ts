import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// #44 关键页挑版的独立构建：只打包 web/picks.html，相对路径，产物发布为多文件 Artifact。
// 用法：npx vite build --config vite.picks.config.ts（产物在 dist/picks，dist 不进仓库）
export default defineConfig({
  root: 'web',
  base: './',
  plugins: [react()],
  build: { outDir: '../dist/picks', emptyOutDir: true, rollupOptions: { input: resolve(import.meta.dirname, 'web/picks.html') } },
});
