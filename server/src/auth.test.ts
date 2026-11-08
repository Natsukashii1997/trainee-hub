// 统一授权入口、演示模式与演示登录的测试（issue #36）。连真测试库，和其他后端测试用同一把测试锁。
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import type pg from 'pg';
import { createApp } from './app.ts';
import { type Actor, authorize, COMMANDS, type CommandId, readScope } from './authorize.ts';
import { createPool } from './db.ts';
import { DEMO_COOKIE, resolveDemo } from './demo.ts';
import { resetDemo } from './seed.ts';
import { checkConnectedTestDb, checkTestUrl } from './testdb.ts';

const url = process.env.TEST_DATABASE_URL;
const refused = checkTestUrl(url);
if (refused) throw new Error(`不清库，停止测试：${refused}`);

const TEST_LOCK = 5_320_002;
let pool: pg.Pool;
let lockClient: pg.PoolClient;

before(async () => {
  pool = createPool(url);
  lockClient = await pool.connect();
  const wrong = await checkConnectedTestDb(lockClient);
  if (wrong) throw new Error(`不清库，停止测试：${wrong}`);
  await lockClient.query('select pg_advisory_lock($1)', [TEST_LOCK]);
  await resetDemo(pool, { TRAINEE_HUB_DEMO: '1' }, url); // 示例数据：林夏、许诺（管培生），周颖（带教、管理权限），吴桐（带教）
});
after(async () => {
  await lockClient.query('select pg_advisory_unlock($1)', [TEST_LOCK]);
  lockClient.release();
  await pool.end();
});

/** 起一个临时端口的后端，发一个请求，关掉 */
async function call(demo: boolean, path: string, init: { method?: string; cookie?: string; body?: unknown } = {}) {
  const server = createApp(pool, { demo });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const headers: Record<string, string> = {};
    if (init.cookie) headers.cookie = init.cookie;
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
    return { status: res.status, setCookie: res.headers.get('set-cookie'), body: (await res.json()) as Record<string, unknown> };
  } finally {
    server.close();
  }
}

describe('演示模式开关', () => {
  test('没设 TRAINEE_HUB_DEMO=1 就是关的', () => {
    assert.equal(resolveDemo({}, '127.0.0.1'), false);
    assert.equal(resolveDemo({ TRAINEE_HUB_DEMO: 'true' }, '127.0.0.1'), false);
  });
  test('本机地址上能开', () => {
    assert.equal(resolveDemo({ TRAINEE_HUB_DEMO: '1' }, '127.0.0.1'), true);
    assert.equal(resolveDemo({ TRAINEE_HUB_DEMO: '1' }, 'localhost'), true);
  });
  test('监听非本机地址时拒绝开启', () => {
    assert.throws(() => resolveDemo({ TRAINEE_HUB_DEMO: '1' }, '0.0.0.0'), /只能在本机地址上开/);
    assert.throws(() => resolveDemo({ TRAINEE_HUB_DEMO: '1' }, '10.0.0.8'), /只能在本机地址上开/);
  });
});

describe('非演示模式：业务接口一律拒绝（骨架验收第 8 项）', () => {
  test('没登录拿不到任何业务数据：401', async () => {
    for (const path of ['/api/me', '/api/projects', '/api/anything']) {
      const r = await call(false, path);
      assert.equal(r.status, 401, path);
      assert.match(String(r.body.error), /未登录/);
    }
  });
  test('带着演示身份 cookie 也不认', async () => {
    const r = await call(false, '/api/me', { cookie: `${DEMO_COOKIE}=u-zhou` });
    assert.equal(r.status, 401);
  });
  test('演示登录接口不存在：404', async () => {
    assert.equal((await call(false, '/api/demo/identities')).status, 404);
    assert.equal((await call(false, '/api/demo/login', { method: 'POST', body: { userId: 'u-zhou' } })).status, 404);
  });
  test('健康检查照常开放', async () => {
    assert.equal((await call(false, '/api/health')).status, 200);
  });
});

describe('演示模式：演示登录与身份切换', () => {
  test('列出示例身份', async () => {
    const r = await call(true, '/api/demo/identities');
    assert.equal(r.status, 200);
    const ids = (r.body.identities as { id: string }[]).map(x => x.id).sort();
    assert.deepEqual(ids, ['u-lin', 'u-wu', 'u-xu', 'u-zhou']);
  });
  test('登录后 /api/me 返回当前身份；切换身份；退出后 401', async () => {
    const login = await call(true, '/api/demo/login', { method: 'POST', body: { userId: 'u-lin' } });
    assert.equal(login.status, 200);
    const cookie = String(login.setCookie).split(';')[0];
    assert.match(String(login.setCookie), /HttpOnly; SameSite=Strict/);
    const me = await call(true, '/api/me', { cookie });
    assert.equal((me.body.me as Actor).name, '林夏');
    assert.equal(me.body.demo, true);

    const sw = await call(true, '/api/demo/login', { method: 'POST', body: { userId: 'u-zhou' }, cookie });
    const me2 = await call(true, '/api/me', { cookie: String(sw.setCookie).split(';')[0] });
    assert.deepEqual(me2.body.me, { id: 'u-zhou', name: '周颖', role: 'mentor', isAdmin: true });

    const out = await call(true, '/api/demo/logout', { method: 'POST' });
    assert.match(String(out.setCookie), /Max-Age=0/);
    assert.equal((await call(true, '/api/me', { cookie: String(out.setCookie).split(';')[0] })).status, 401);
  });
  test('不存在的身份、坏请求体：400', async () => {
    assert.equal((await call(true, '/api/demo/login', { method: 'POST', body: { userId: 'u-nobody' } })).status, 400);
    assert.equal((await call(true, '/api/demo/login', { method: 'POST', body: ['u-lin'] })).status, 400);
  });
  test('演示模式下没登录仍然 401', async () => {
    assert.equal((await call(true, '/api/me')).status, 401);
  });
});

describe('统一授权入口', () => {
  const lin: Actor = { id: 'u-lin', name: '林夏', role: 'trainee', isAdmin: false };
  const zhou: Actor = { id: 'u-zhou', name: '周颖', role: 'mentor', isAdmin: true };
  const wu: Actor = { id: 'u-wu', name: '吴桐', role: 'mentor', isAdmin: false };
  const all = Object.keys(COMMANDS) as CommandId[];

  test('没登录：401', () => {
    assert.deepEqual(authorize(null, { kind: 'read' }), { ok: false, status: 401, reason: '未登录' });
    assert.equal(authorize(null, { kind: 'command', command: 'C01' }).ok, false);
  });

  test('带教（含没有管理权限的）可执行全部命令、读全部数据', () => {
    for (const actor of [zhou, wu]) {
      for (const command of all) assert.equal(authorize(actor, { kind: 'command', command, traineeIds: ['u-xu'] }).ok, true, command);
      assert.equal(authorize(actor, { kind: 'read', traineeIds: ['u-lin', 'u-xu'] }).ok, true);
      assert.equal(readScope(actor), null);
    }
  });

  test('管培生执行带教命令被拒绝', () => {
    for (const command of ['C02', 'C05', 'C08', 'C11', 'C13', 'C15', 'C16', 'C17', 'C18'] as CommandId[]) {
      const d = authorize(lin, { kind: 'command', command });
      assert.equal(d.ok, false, command);
      assert.match(d.ok ? '' : d.reason, new RegExp(`管培生不能执行「${COMMANDS[command]}」`));
    }
  });

  test('管培生可执行发起方含管培生的命令，但只能针对与本人相关的对象', () => {
    for (const command of ['C01', 'C03', 'C04', 'C06', 'C07', 'C09', 'C10', 'C12', 'C14', 'C19'] as CommandId[]) {
      assert.equal(authorize(lin, { kind: 'command', command, traineeIds: ['u-lin', 'u-xu'] }).ok, true, command);
      const other = authorize(lin, { kind: 'command', command, traineeIds: ['u-xu'] });
      assert.equal(other.ok, false, command);
    }
  });

  test('管培生查询拿不到别人的个人数据；全员可见的内容可以看', () => {
    assert.equal(authorize(lin, { kind: 'read', traineeIds: ['u-lin'] }).ok, true);
    assert.deepEqual(authorize(lin, { kind: 'read', traineeIds: ['u-xu'] }), { ok: false, status: 403, reason: '只能查看自己的数据' });
    assert.equal(authorize(lin, { kind: 'read' }).ok, true);
    assert.equal(readScope(lin), 'u-lin');
  });

  test('19 条命令都登记了名字', () => {
    assert.equal(all.length, 19);
  });
});
