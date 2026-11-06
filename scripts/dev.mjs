// 一条命令起开发环境：数据库（没建就建、没起就起）→ 迁移 → 后端（127.0.0.1:5325，改代码自动重启）+ 前端（127.0.0.1:5320）。
// 用法：npm run dev:all。Ctrl-C 停后端和前端；数据库继续运行，要停用 npm run db:stop。
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDbEnv, up } from './db.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  await up();
} catch (e) {
  console.error(`数据库起不来：${e.stderr?.toString().trim() || e.message}`);
  process.exit(1);
}
// 连接串在 up() 之后再读：第一次运行时 db.env 是 up() 里才生成的
const env = { ...readDbEnv(), ...process.env };
const migrated = spawnSync(process.execPath, ['server/src/migrate.ts'], { cwd: root, stdio: 'inherit', env: env });
if (migrated.status !== 0) process.exit(migrated.status ?? 1);

const children = [
  spawn(process.execPath, ['--watch', 'server/src/index.ts'], { cwd: root, stdio: 'inherit', env: env }),
  spawn(path.join(root, 'node_modules/.bin/vite'), [], { cwd: root, stdio: 'inherit', env: env }),
];
let stopping = false;
const stopAll = code => {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill('SIGTERM');
  process.exitCode = code;
};
for (const c of children) c.on('exit', code => stopAll(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stopAll(0));
