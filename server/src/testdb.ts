// 测试库安全闸门：后端测试开跑前要清空整个库，所以只认本项目本机实例上的测试库（PR #27 审核 P1-01）。
// 两道关：连之前看连接串，连上之后再查一遍实际连到的库、地址、端口；任何一道不对都不清库。
import type pg from 'pg';

export const TEST_DB = { host: '127.0.0.1', port: Number(process.env.PGPORT_TRAINEE_HUB ?? 5433), database: 'trainee_hub_test' };

/** 连接串必须是 127.0.0.1（或 localhost）:端口/trainee_hub_test，且不带参数；不对返回原因，对了返回 null */
export function checkTestUrl(url: string | undefined): string | null {
  if (!url) return '没有设置 TEST_DATABASE_URL；用 npm run test:server 跑';
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'TEST_DATABASE_URL 格式不对';
  }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') return `TEST_DATABASE_URL 不是 PostgreSQL 连接串（${u.protocol}）`;
  if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return `测试库只能在本机 127.0.0.1，不是 ${u.hostname}`;
  if (Number(u.port || 5432) !== TEST_DB.port) return `测试库端口要是 ${TEST_DB.port}，不是 ${u.port || 5432}`;
  if (decodeURIComponent(u.pathname.slice(1)) !== TEST_DB.database) return `测试库名要是 ${TEST_DB.database}，不是 ${decodeURIComponent(u.pathname.slice(1))}`;
  // ?host=、?options= 之类的参数能改掉实际连到的地址或库，一律不收
  if (u.search) return '测试库连接串不能带参数';
  return null;
}

/** 连上之后核对实际连到的库、地址、端口；对了返回 null */
export async function checkConnectedTestDb(db: pg.Pool | pg.PoolClient): Promise<string | null> {
  const { rows } = await db.query<{ db: string; addr: string | null; port: number | null }>(
    'select current_database() as db, host(inet_server_addr()) as addr, inet_server_port() as port',
  );
  const { db: name, addr, port } = rows[0];
  if (name !== TEST_DB.database || addr !== TEST_DB.host || port !== TEST_DB.port)
    return `实际连到的是 ${addr ?? '本机套接字'}:${port ?? '-'}/${name}，不是本项目测试库 ${TEST_DB.host}:${TEST_DB.port}/${TEST_DB.database}`;
  return null;
}
