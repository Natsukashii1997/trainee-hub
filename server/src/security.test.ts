// 安全回归使用内存数据库桩和随机 HTTP 端口，不读取本机业务数据。
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import type pg from 'pg';
import { createApp, readHealth } from './app.ts';
import { createPool } from './db.ts';

const secret = 'postgres://audit-user:synthetic-password@db.invalid/private';

async function request(pool: pg.Pool, route: string, cookie?: string) {
  const server = createApp(pool, { demo: true });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers: cookie ? { cookie } : {} });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

const actorPool = {
  query: async () => ({ rows: [{ id: 'audit-trainee', name: '审计示例', role: 'trainee', is_admin: false }] }),
} as unknown as pg.Pool;

test('安全 S01：健康检查不返回数据库原始错误或异常 code', async () => {
  for (const code of [undefined, 'ECONNREFUSED', secret]) {
    const pool = { query: async () => { throw Object.assign(new Error(secret), { code }); } } as unknown as pg.Pool;
    const health = await readHealth(pool);
    assert.equal(health.db, 'down');
    assert.match(health.message!, /^数据库连不上/);
    assert.ok(!JSON.stringify(health).includes(secret), '响应包含了合成凭据');
  }
});

test('安全 S02：HTTP 异常日志不包含数据库 message、detail、SQL 或异常 code 里的秘密', async t => {
  const messages: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => messages.push(args));
  const pool = { query: async () => { throw Object.assign(new Error(secret), { detail: secret, query: secret, code: secret }); } } as unknown as pg.Pool;
  const response = await request(pool, '/api/me', 'th_demo_user=audit-trainee');
  assert.equal(response.status, 500);
  assert.ok(messages.length > 0, '内部错误需要留痕');
  assert.ok(!messages.some(args => args.some(value => String(value).includes(secret))), '日志包含了合成凭据');
  assert.ok(!messages.some(args => args.some(value => value instanceof Error)), '不得直接记录完整异常对象');
});

test('安全 S03：数据库连接池空闲异常日志不泄露连接细节', async t => {
  const messages: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => messages.push(args));
  const pool = createPool('postgres://audit:synthetic@127.0.0.1:1/unused');
  try {
    pool.emit('error', new Error(secret));
    assert.ok(messages.length > 0);
    assert.ok(!messages.some(args => args.some(value => String(value).includes(secret))), '日志包含了合成凭据');
  } finally {
    await pool.end();
  }
});

test('安全 S04：畸形演示 Cookie 按未登录处理，后续合法请求可用', async () => {
  assert.equal((await request(actorPool, '/api/me', 'th_demo_user=%E0%A4%A')).status, 401);
  assert.equal((await request(actorPool, '/api/me', 'th_demo_user=audit-trainee')).status, 200);
});

test('安全 S05：畸形查询参数返回 400，合法 UTF-8 编号仍进入正常授权', async () => {
  assert.equal((await request(actorPool, '/api/views/path/%E0%A4%A', 'th_demo_user=audit-trainee')).status, 400);
  assert.equal((await request(actorPool, '/api/views/path/%E8%AE%B8%E8%AF%BA', 'th_demo_user=audit-trainee')).status, 403);
});
