// 初始化故障注入：仅清空经过两道安全闸门的隔离测试库。
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type pg from 'pg';
import { createPool } from './db.ts';
import { resetDemo, seedAll } from './seed.ts';
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
});
after(async () => {
  await lock.query('select pg_advisory_unlock($1)', [5320002]);
  lock.release();
  await pool.end();
});

/** 和 pool 一样，只是连接上以 prefix 开头的那句 SQL 会抛错 */
function failing(prefix: string): pg.Pool {
  return {
    query: pool.query.bind(pool),
    connect: async () => {
      const client = await pool.connect();
      return new Proxy(client, {
        get(target, key) {
          if (key === 'query') return async (sql: string, params?: unknown[]) => {
            if (typeof sql === 'string' && sql.startsWith(prefix)) throw new Error('审计注入故障');
            return target.query(sql, params);
          };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  } as unknown as pg.Pool;
}

for (const [stage, prefix] of [
  ['迁移', 'create table if not exists schema_migrations'],
  ['示例数据', 'insert into app_user'],
]) {
  test(`安全 H02：${stage}中途失败时，恢复清库前的数据与迁移状态`, async () => {
    await resetDemo(pool, { TRAINEE_HUB_DEMO: '1' }, url);
    await pool.query('create table audit_reset_sentinel (value text); insert into audit_reset_sentinel values (\'原始合成数据\')');
    const migrations = (await pool.query('select version, checksum from schema_migrations order by version')).rows;
    await assert.rejects(resetDemo(failing(prefix), { TRAINEE_HUB_DEMO: '1' }, url), /审计注入故障/);
    assert.equal((await pool.query("select to_regclass('audit_reset_sentinel') is not null as kept")).rows[0].kept, true);
    assert.deepEqual((await pool.query('select * from audit_reset_sentinel')).rows, [{ value: '原始合成数据' }]);
    assert.deepEqual((await pool.query('select version, checksum from schema_migrations order by version')).rows, migrations);
    assert.equal((await pool.query('select count(*)::int as n from app_user')).rows[0].n, 4);
  });
}

test('安全 H02：整套初始化在重置阶段失败时，报错写明库里的数据没有变', async () => {
  await resetDemo(pool, { TRAINEE_HUB_DEMO: '1' }, url);
  await pool.query("create table audit_reset_sentinel (value text); insert into audit_reset_sentinel values ('原始合成数据')");
  await assert.rejects(seedAll(failing('insert into app_user'), { TRAINEE_HUB_DEMO: '1' }, url), /^Error: 初始化失败，库里的数据没有变：审计注入故障$/);
  assert.deepEqual((await pool.query('select * from audit_reset_sentinel')).rows, [{ value: '原始合成数据' }]);
});

test('安全 H02：演示故事中途失败时，基础示例完整，报错写明重置前的数据已清掉、故事没写完', async () => {
  await resetDemo(pool, { TRAINEE_HUB_DEMO: '1' }, url);
  await pool.query("create table audit_reset_sentinel (value text); insert into audit_reset_sentinel values ('原始合成数据')");
  // 故事的第三步（直接写一条口头反馈）出错：前两步经业务命令已各自提交
  await assert.rejects(
    seedAll(failing("insert into feedback_item (trainee_id, source, milestone_id, content"), { TRAINEE_HUB_DEMO: '1' }, url),
    /示例数据已重置（重置前的数据已清掉），但第 1 页的演示故事没有写完：审计注入故障。修好原因后重跑 npm run db:seed/,
  );
  // 重置那一段已经提交：重置前的数据不在了，基础示例是完整的
  assert.equal((await pool.query("select to_regclass('audit_reset_sentinel') is not null as kept")).rows[0].kept, false);
  assert.equal((await pool.query('select count(*)::int as n from app_user')).rows[0].n, 4);
  // 故事停在第三步之前：第 1 版和它的评审在，口头反馈和第 2 版不在
  assert.equal((await pool.query("select count(*)::int as n from submission where milestone_id = 'ms-1-1'")).rows[0].n, 1);
  assert.equal((await pool.query("select count(*)::int as n from feedback_item where source = 'verbal'")).rows[0].n, 0);
  // 重跑一次就是完整的；再重置回基础示例，不把故事留给后面的测试
  assert.match(await seedAll(pool, { TRAINEE_HUB_DEMO: '1' }, url), /含第 1 页的演示故事/);
  assert.equal((await pool.query("select count(*)::int as n from submission where milestone_id = 'ms-1-1'")).rows[0].n, 2);
  assert.equal((await pool.query("select count(*)::int as n from feedback_item where source = 'verbal'")).rows[0].n, 1);
  await resetDemo(pool, { TRAINEE_HUB_DEMO: '1' }, url);
});
