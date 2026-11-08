// 后端测试：连真库（TEST_DATABASE_URL，由 npm run test:server 经 scripts/db.mjs 注入）。
// 每次开跑先清空测试库，再从头迁移。清库前过两道安全闸门（testdb.ts），并持测试锁，两个测试进程不会同时清库。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { createApp } from './app.ts';
import { createPool } from './db.ts';
import { currentMigration, findTransactionControl, LOCK_KEY, migrate, migrationFiles } from './migrate.ts';
import { checkConnectedTestDb, checkTestUrl } from './testdb.ts';

const url = process.env.TEST_DATABASE_URL;
const refused = checkTestUrl(url);
if (refused) throw new Error(`不清库，停止测试：${refused}`);

const TEST_LOCK = 5_320_002; // 测试会话锁，和迁移锁不同
let pool: pg.Pool;
let lockClient: pg.PoolClient;
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
  lockClient = await pool.connect();
  const wrong = await checkConnectedTestDb(lockClient);
  if (wrong) throw new Error(`不清库，停止测试：${wrong}`);
  await lockClient.query('select pg_advisory_lock($1)', [TEST_LOCK]);
  await lockClient.query('drop schema public cascade; create schema public');
});
after(async () => {
  await lockClient.query('select pg_advisory_unlock($1)', [TEST_LOCK]);
  lockClient.release();
  await pool.end();
});

describe('迁移', () => {
  test('从空库执行全部迁移，重复执行不报错也不再执行，每条记了校验值', async () => {
    assert.equal(await currentMigration(pool), null);
    assert.deepEqual(await migrate(pool), migrationFiles().map(m => m.version));
    assert.deepEqual(await migrate(pool), []);
    assert.equal(await currentMigration(pool), LATEST);
    const { rows } = await pool.query("select count(*)::int as n from schema_migrations where checksum ~ '^[0-9a-f]{64}$'");
    assert.equal(rows[0].n, migrationFiles().length);
  });

  test('事件日志只追加：改、删、清空都被拒绝', async () => {
    const { rows } = await pool.query("insert into event_log (type, subject_type, subject_id, source, visibility) values ('user.firstLogin', 'user', 'u-1', 'system', 'admin') returning id");
    await assert.rejects(pool.query("update event_log set type = 'x' where id = $1", [rows[0].id]), /只追加/);
    await assert.rejects(pool.query('delete from event_log where id = $1', [rows[0].id]), /只追加/);
    await assert.rejects(pool.query('truncate event_log cascade'), /只追加/); // 不带 cascade 先被外键挡住，带了才会真清
  });

  // v1.1 的待办表在 0003 去掉了（骨架期待办是事实查询，PRD 第 11 节）；骨架表的约束测试见 skeleton.test.ts
});

describe('数据关系约束（0002）', () => {
  before(async () => {
    await pool.query(`
      insert into path_template (id, name, version) values ('pt1', '标准路径', 'v1'), ('pt2', '标准路径', 'v2');
      insert into stage (id, template_id, no, name, days) values ('s1', 'pt1', 1, '阶段一', 30), ('s2', 'pt2', 1, '阶段一', 30);
      insert into module (id, stage_id, no, name, days) values ('m1', 's1', 1, '客户岗', 30);
      insert into task_template (id, module_id, no, name, output, days, deadline_anchor, deadline_time) values ('tt1', 'm1', 1, '客户访谈', '文档', 3, 'station_end', '18:00');
      insert into cohort (id, name, template_id, start_date, end_date) values ('c1', '2026 秋季班', 'pt1', '2026-09-01', '2027-08-31');
      insert into app_user (id, name, role) values ('ua', '甲', 'trainee'), ('ub', '乙', 'trainee');
      insert into personal_path (id, user_id, cohort_id, start_date, end_date) values ('pa', 'ua', 'c1', '2026-09-01', '2027-08-31'), ('pb', 'ub', 'c1', '2026-09-01', '2027-08-31');
      insert into personal_module (id, path_id, module_id, no, start_date, end_date) values ('sa', 'pa', 'm1', 1, '2026-09-01', '2026-09-30'), ('sb', 'pb', 'm1', 1, '2026-09-01', '2026-09-30');
    `);
  });
  const addTask = (station: string, extra = '') => pool.query(
    `insert into task_instance (path_id, station_id, source, task_template_id, name, output, open_at, due_at${extra ? ', original_due_at, due_adjust_reason' : ''})
     values ('pa', $1, 'template', 'tt1', '客户访谈', '文档', '2026-09-01T01:00Z', '2026-09-05T10:00Z'${extra})`, [station]);

  test('任务的站必须属于同一条个人路径', async () => {
    await addTask('sa');
    await assert.rejects(addTask('sb'), /task_instance_station_same_path/);
  });

  test('截止时间调整过就必须写调整原因', async () => {
    await assert.rejects(addTask('sa', ", '2026-09-04T10:00Z', null"), /task_instance_due_adjust_reason/);
    await assert.rejects(addTask('sa', ", '2026-09-04T10:00Z', '  '"), /task_instance_due_adjust_reason/);
    await addTask('sa', ", '2026-09-04T10:00Z', '客户改期'");
  });

  test('路径模板冻结后只读：模板、阶段、模块、任务模板都不能改删增；没冻结的照常改', async () => {
    await pool.query("update path_template set frozen = true where id = 'pt1'"); // 冻结本身允许
    await assert.rejects(pool.query("update stage set name = '改' where id = 's1'"), /只读/);
    await assert.rejects(pool.query("insert into module (stage_id, no, name, days) values ('s1', 2, '老师岗', 30)"), /只读/);
    await assert.rejects(pool.query("update task_template set name = '改' where id = 'tt1'"), /只读/);
    await assert.rejects(pool.query("delete from task_template where id = 'tt1'"), /只读/);
    await assert.rejects(pool.query("update stage set template_id = 'pt1' where id = 's2'"), /只读/); // 挪进冻结模板
    await assert.rejects(pool.query("update path_template set frozen = false where id = 'pt1'"), /只读/);
    await assert.rejects(pool.query("delete from path_template where id = 'pt1'"), /只读/);
    await pool.query("update stage set name = '阶段一（改）' where id = 's2'");
    await pool.query("insert into module (stage_id, no, name, days) values ('s2', 1, '老师岗', 30)");
  });
});

describe('迁移执行器的防护', () => {
  let fx: pg.Pool;
  let dir: string;
  // 单独的 schema 和迁移目录，不碰真实迁移的登记
  before(async () => {
    await pool.query('drop schema if exists mig_fixture cascade; create schema mig_fixture');
    fx = new pg.Pool({ connectionString: url, options: '-c search_path=mig_fixture', max: 2 });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trainee-hub-migrate-'));
  });
  after(async () => {
    await fx.end();
    fs.rmSync(dir, { recursive: true, force: true });
    await pool.query('drop schema mig_fixture cascade');
  });
  const write = (name: string, sql: string) => fs.writeFileSync(path.join(dir, name), sql);
  const exists = async (table: string) => (await fx.query<{ ok: boolean }>('select to_regclass($1) is not null as ok', [table])).rows[0].ok;

  test('中途失败：整条回滚、不登记、锁已释放；修好后重试能执行', async () => {
    write('0001_a.sql', 'create table fx_a (id int);\nselect 1 / 0;');
    await assert.rejects(migrate(fx, dir), /迁移 0001_a 失败/);
    assert.equal(await exists('fx_a'), false);
    assert.equal(await currentMigration(fx), null);
    const other = await pool.connect(); // 另一个会话能拿到迁移锁，说明锁没被留在连接池里
    try {
      assert.equal((await other.query('select pg_try_advisory_lock($1) as ok', [LOCK_KEY])).rows[0].ok, true);
      await other.query('select pg_advisory_unlock($1)', [LOCK_KEY]);
    } finally {
      other.release();
    }
    write('0001_a.sql', 'create table fx_a (id int);');
    assert.deepEqual(await migrate(fx, dir), ['0001_a']);
    assert.equal(await exists('fx_a'), true);
  });

  test('迁移里有事务控制语句：执行前就拒绝，一条都不执行', async () => {
    write('0002_b.sql', 'create table fx_b (id int);\ncommit;\ncreate table fx_c (id int);');
    await assert.rejects(migrate(fx, dir), /0002_b 里有事务控制语句「commit」/);
    assert.equal(await exists('fx_b'), false);
    fs.rmSync(path.join(dir, '0002_b.sql'));
  });

  test('识别事务控制语句：函数体、字符串、注释、带引号的标识符里的不算', () => {
    assert.equal(findTransactionControl('create function f() returns void language plpgsql as $$ begin perform 1; commit; end $$;'), null);
    assert.equal(findTransactionControl("create function g() returns int language sql as $body$ select 1; $body$;"), null);
    assert.equal(findTransactionControl("-- commit\nselect 'commit; begin' as x;"), null);
    assert.equal(findTransactionControl('/* begin /* 嵌套 */ commit; */ select "end" from t;'), null);
    assert.equal(findTransactionControl("insert into t values (E'it\\'s; commit');"), null);
    assert.equal(findTransactionControl('create table x (id int);\nBEGIN;'), 'begin');
    assert.equal(findTransactionControl('select 1;\n  Rollback'), 'rollback');
    assert.equal(findTransactionControl('START TRANSACTION;'), 'start');
    assert.equal(findTransactionControl("select 'a'; end;"), 'end');
  });

  test('已执行的迁移事后被改：报错，不重放', async () => {
    write('0001_a.sql', 'create table fx_a (id int, x int);');
    await assert.rejects(migrate(fx, dir), /0001_a 执行后被改过/);
    write('0001_a.sql', 'create table fx_a (id int);');
    assert.deepEqual(await migrate(fx, dir), []);
  });

  test('加校验值之前执行的迁移：补记当前文件的校验值', async () => {
    await fx.query("update schema_migrations set checksum = null where version = '0001_a'");
    assert.deepEqual(await migrate(fx, dir), []);
    const { rows } = await fx.query("select checksum from schema_migrations where version = '0001_a'");
    assert.match(String(rows[0].checksum), /^[0-9a-f]{64}$/);
  });

  test('编号重复：报错，一条都不执行', async () => {
    write('0001_dup.sql', 'create table fx_dup (id int);');
    assert.throws(() => migrationFiles(dir), /迁移编号 0001 重复/);
    await assert.rejects(migrate(fx, dir), /迁移编号 0001 重复/);
    assert.equal(await exists('fx_dup'), false);
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

  test('非 GET 405；非演示模式下其他接口未登录一律 401（#36，见 auth.test.ts）', async () => {
    assert.equal((await request(pool, '/api/health', { method: 'POST' })).status, 405);
    assert.equal((await request(pool, '/api/nope')).status, 401);
  });
});
