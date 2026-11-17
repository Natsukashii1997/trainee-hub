// 初始化故障注入：仅清空经过两道安全闸门的隔离测试库。
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type pg from 'pg';
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
});
after(async () => {
  await lock.query('select pg_advisory_unlock($1)', [5320002]);
  lock.release();
  await pool.end();
});

for (const [stage, prefix] of [
  ['迁移', 'create table if not exists schema_migrations'],
  ['示例数据', 'insert into app_user'],
]) {
  test(`安全 H02：${stage}中途失败时，恢复清库前的数据与迁移状态`, async () => {
    await resetDemo(pool, { TRAINEE_HUB_DEMO: '1' }, url);
    await pool.query('create table audit_reset_sentinel (value text); insert into audit_reset_sentinel values (\'原始合成数据\')');
    const migrations = (await pool.query('select version, checksum from schema_migrations order by version')).rows;
    const failurePool = {
      query: pool.query.bind(pool),
      connect: async () => {
        const client = await pool.connect();
        return new Proxy(client, {
          get(target, key) {
            if (key === 'query') return async (sql: string, params?: unknown[]) => {
              if (sql.startsWith(prefix)) throw new Error('审计注入故障');
              return target.query(sql, params);
            };
            const value = Reflect.get(target, key);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      },
    } as unknown as pg.Pool;
    await assert.rejects(resetDemo(failurePool, { TRAINEE_HUB_DEMO: '1' }, url), /审计注入故障/);
    assert.equal((await pool.query("select to_regclass('audit_reset_sentinel') is not null as kept")).rows[0].kept, true);
    assert.deepEqual((await pool.query('select * from audit_reset_sentinel')).rows, [{ value: '原始合成数据' }]);
    assert.deepEqual((await pool.query('select version, checksum from schema_migrations order by version')).rows, migrations);
    assert.equal((await pool.query('select count(*)::int as n from app_user')).rows[0].n, 4);
  });
}
