import pg from 'pg';

/** 建连接池。连接串从环境变量读（不进仓库），本机开发由 scripts/db.mjs 生成。 */
export function createPool(connectionString: string | undefined = process.env.DATABASE_URL): pg.Pool {
  if (!connectionString) throw new Error('没有设置 DATABASE_URL：先运行 npm run db:up，再用 npm run dev:all 或 node scripts/db.mjs exec -- <命令> 启动');
  // 连不上时 2 秒内报错，健康检查不会一直挂着
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 2000, max: 5 });
  // 数据库重启或断开时，空闲连接会报错；不处理会让整个进程崩掉
  pool.on('error', err => console.error(`数据库连接断开：${err.message}`));
  return pool;
}
