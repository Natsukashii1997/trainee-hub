// 后端入口：只监听 127.0.0.1（AGENTS.md 规则）。端口默认 5325，可用 PORT 改。
// 演示模式（PRD 2.2）：TRAINEE_HUB_DEMO=1 时打开，只能在本机地址上开（demo.ts）。
import { createApp } from './app.ts';
import { createPool } from './db.ts';
import { resolveDemo } from './demo.ts';

const port = Number(process.env.PORT ?? 5325);
let demo: boolean;
try {
  demo = resolveDemo(process.env, '127.0.0.1'); // 监听地址与下面 listen 一致
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
const pool = createPool();
const server = createApp(pool, { demo });

server.on('error', err => {
  console.error(`后端启动失败：${err.message}`);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => // 来源校验见 app.ts
  console.log(`后端已启动：http://127.0.0.1:${port}（健康检查 /api/health；${demo ? '演示模式：可切换示例身份，只用合成数据' : '非演示模式：飞书登录做好之前，业务接口一律拒绝'}）`));

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => { server.close(); pool.end().finally(() => process.exit(0)); });
