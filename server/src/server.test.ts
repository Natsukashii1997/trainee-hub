// 后端测试：连真库（TEST_DATABASE_URL，由 npm run test:server 经 scripts/db.mjs 注入）。
// 每次开跑先清空测试库，再从头迁移。
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import type pg from 'pg';
import { createApp } from './app.ts';
import { createPool } from './db.ts';
import { currentMigration, migrate, migrationFiles } from './migrate.ts';

const url = process.env.TEST_DATABASE_URL;
if (!url || !/\/\w+_test$/.test(new URL(url).pathname)) throw new Error('TEST_DATABASE_URL 没有设置或不是测试库（库名要以 _test 结尾）；用 npm run test:server 跑');

let pool: pg.Pool;
const LATEST = migrationFiles().at(-1)!.version;

/** 起一个临时端口的后端，发一个请求，关掉 */
async function request(p: pg.Pool, path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  const server = createApp(p);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
    return { status: res.status, body: (await res.json()) as Record<string, string | boolean | null> };
  } finally {
    server.close();
  }
}

before(async () => {
  pool = createPool(url);
  await pool.query('drop schema public cascade; create schema public');
});
after(() => pool.end());

describe('迁移', () => {
  test('从空库执行全部迁移，重复执行不报错也不再执行', async () => {
    assert.equal(await currentMigration(pool), null);
    assert.deepEqual(await migrate(pool), migrationFiles().map(m => m.version));
    assert.deepEqual(await migrate(pool), []);
    assert.equal(await currentMigration(pool), LATEST);
  });

  test('事件日志只追加：改、删都被拒绝', async () => {
    const { rows } = await pool.query("insert into event_log (type, subject_type, subject_id, source, visibility) values ('user.firstLogin', 'user', 'u-1', 'system', 'admin') returning id");
    await assert.rejects(pool.query("update event_log set type = 'x' where id = $1", [rows[0].id]), /只追加/);
    await assert.rejects(pool.query('delete from event_log where id = $1', [rows[0].id]), /只追加/);
  });

  test('待办：同一规则 + 对象 + 负责人只能有一条未关闭', async () => {
    await pool.query("insert into app_user (id, name, role) values ('u-admin', '管理员', 'admin')");
    const add = () => pool.query("insert into todo (rule, subject_type, subject_id, owner_id, title) values ('R01', 'user', 'u-new', 'u-admin', '新成员待分配')");
    await add();
    await assert.rejects(add(), /todo_one_open/);
    await pool.query("update todo set status = 'done', closed_at = now() where rule = 'R01'");
    await add(); // 关掉之后可以再开一条
  });
});

describe('健康检查 GET /api/health', () => {
  test('数据库连通：200，返回当前迁移版本和检查时间', async () => {
    const { status, body } = await request(pool, '/api/health');
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.db, 'up');
    assert.equal(body.migration, LATEST);
    assert.ok(!Number.isNaN(Date.parse(String(body.checkedAt))));
  });

  test('数据库连不上：503，带中文说明，不崩', async () => {
    const down = createPool('postgres://nobody:x@127.0.0.1:1/none');
    try {
      const { status, body } = await request(down, '/api/health');
      assert.equal(status, 503);
      assert.equal(body.ok, false);
      assert.equal(body.db, 'down');
      assert.match(String(body.message), /^数据库连不上/);
    } finally {
      await down.end();
    }
  });

  test('来源校验：其他网站发来的请求 403，前端开发服务转来的放行', async () => {
    assert.equal((await request(pool, '/api/health', { headers: { origin: 'https://evil.example' } })).status, 403);
    assert.equal((await request(pool, '/api/health', { headers: { origin: 'http://127.0.0.1:5320' } })).status, 200);
  });

  test('非 GET 405，未知接口 404', async () => {
    assert.equal((await request(pool, '/api/health', { method: 'POST' })).status, 405);
    assert.equal((await request(pool, '/api/nope')).status, 404);
  });
});
