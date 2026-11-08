// 后端入口：只监听 127.0.0.1（AGENTS.md 规则）。端口默认 5325，可用 PORT 改。
import { createApp } from './app.ts';
import { createPool } from './db.ts';

const port = Number(process.env.PORT ?? 5325);
const pool = createPool();
const server = createApp(pool);

server.on('error', err => {
  console.error(`后端启动失败：${err.message}`);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => console.log(`后端已启动：http://127.0.0.1:${port}（健康检查 /api/health）`));

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => { server.close(); pool.end().finally(() => process.exit(0)); });
