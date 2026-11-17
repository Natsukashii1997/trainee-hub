// 本轮审计补齐 HTTP 入口的角色矩阵，复用项目的合成数据和测试锁。
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type pg from 'pg';
import { createApp } from './app.ts';
import { COMMANDS } from './authorize.ts';
import { createPool } from './db.ts';
import { resetDemo } from './seed.ts';
import { checkConnectedTestDb, checkTestUrl } from './testdb.ts';

const url = process.env.TEST_DATABASE_URL;
const refused = checkTestUrl(url);
if (refused) throw new Error(`不清库，停止测试：${refused}`);
let pool: pg.Pool;
let lock: pg.PoolClient;
before(async () => {
  pool = createPool(url);
  lock = await pool.connect();
  const wrong = await checkConnectedTestDb(lock);
  if (wrong) throw new Error(wrong);
  await lock.query('select pg_advisory_lock($1)', [5320002]);
  await resetDemo(pool, { TRAINEE_HUB_DEMO: '1' }, url);
});
after(async () => {
  await lock.query('select pg_advisory_unlock($1)', [5320002]);
  lock.release();
  await pool.end();
});

const routes = [
  'home', 'todo', 'dashboard', 'projects', 'projects/pj-2', 'milestones/ms-2-1',
  'path', 'path/u-xu', 'tasks/k-xu-6', 'people/u-xu', 'people/u-xu/timeline',
];

async function withApp(demo: boolean, check: (base: string) => Promise<void>) {
  const server = createApp(pool, { demo });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await check(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('安全权限矩阵：非演示模式的全部查询与 19 条命令一律 401', async () => {
  await withApp(false, async base => {
    for (const userId of ['u-lin', 'u-zhou', 'u-wu', 'u-unopened']) {
      const headers = { cookie: `th_demo_user=${userId}` };
      for (const route of routes) assert.equal((await fetch(`${base}/api/views/${route}`, { headers })).status, 401, `${userId}/${route}`);
      for (const command of Object.keys(COMMANDS)) assert.equal((await fetch(`${base}/api/commands/${command}`, { method: 'POST', headers, body: '{}' })).status, 401, `${userId}/${command}`);
    }
  });
});

test('安全权限矩阵：本人、其他管培生、普通带教、管理者、未开通身份', async () => {
  await withApp(true, async base => {
    for (const [userId, expected] of [
      ['u-lin', [200, 200, 403, 200, 403, 403, 200, 403, 403, 403, 403]],
      ['u-xu', Array(11).fill(200).map((status, i) => i === 2 ? 403 : status)],
      ['u-wu', Array(11).fill(200).map((status, i) => i === 6 ? 404 : status)],
      ['u-zhou', Array(11).fill(200).map((status, i) => i === 6 ? 404 : status)],
      ['u-unopened', Array(11).fill(401)],
    ] as [string, number[]][]) {
      for (const [i, route] of routes.entries()) {
        const response = await fetch(`${base}/api/views/${route}`, { headers: { cookie: `th_demo_user=${userId}` } });
        assert.equal(response.status, expected[i], `${userId}/${route}`);
        if (route === 'projects' && response.status === 200) {
          const body = await response.json() as { result: { id: string }[] };
          assert.deepEqual(body.result.map(row => row.id).sort(), userId === 'u-lin' ? ['pj-1'] : ['pj-1', 'pj-2']);
        }
      }
    }
  });
});

test('安全输入：查询编号 SQL 注入无匹配，跨来源请求拒绝，越权写入不落事件', async () => {
  await withApp(true, async base => {
    const headers = { cookie: 'th_demo_user=u-lin' };
    const injected = encodeURIComponent("pj-2' OR 1=1--");
    assert.equal((await fetch(`${base}/api/views/projects/${injected}`, { headers })).status, 404);
    assert.equal((await fetch(`${base}/api/views/home`, { headers: { ...headers, origin: 'https://audit.invalid' } })).status, 403);
    const before = (await pool.query('select count(*)::int as n from event_log')).rows[0].n;
    const denied = await fetch(`${base}/api/commands/C02`, { method: 'POST', headers, body: JSON.stringify({ projectId: 'pj-2' }) });
    assert.equal(denied.status, 403);
    assert.equal((await pool.query("select status from project where id = 'pj-2'")).rows[0].status, 'draft');
    assert.equal((await pool.query('select count(*)::int as n from event_log')).rows[0].n, before);
  });
});
