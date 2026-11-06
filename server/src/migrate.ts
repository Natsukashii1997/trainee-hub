// 数据库迁移：server/migrations/NNNN_名称.sql 按文件名顺序执行，每条在一个事务里，执行过的记进 schema_migrations。
// 重复执行只跑没跑过的；加会话级咨询锁，两个进程同时迁移时后一个等前一个做完。
// 用法：node server/src/migrate.ts（需要 DATABASE_URL；本机用 npm run db:migrate）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { createPool } from './db.ts';

const DIR = fileURLToPath(new URL('../migrations/', import.meta.url));
const LOCK_KEY = 5_320_001; // 任意常数，只要本项目内不重复

export function migrationFiles(dir = DIR): { version: string; file: string }[] {
  return fs.readdirSync(dir).filter(f => /^\d{4}_[\w-]+\.sql$/.test(f)).sort().map(f => ({ version: f.slice(0, -4), file: path.join(dir, f) }));
}

/** 执行没跑过的迁移，返回这次新执行的版本号 */
export async function migrate(pool: pg.Pool, dir = DIR): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query('create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())');
    const { rows } = await client.query<{ version: string }>('select version from schema_migrations');
    const done = new Set(rows.map(r => r.version));
    for (const { version, file } of migrationFiles(dir)) {
      if (done.has(version)) continue;
      try {
        await client.query('begin');
        await client.query(fs.readFileSync(file, 'utf8'));
        await client.query('insert into schema_migrations (version) values ($1)', [version]);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback');
        throw new Error(`迁移 ${version} 失败：${(e as Error).message}`);
      }
      applied.push(version);
    }
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
  return applied;
}

/** 当前迁移版本（最新一条已执行的）；还没迁移过返回 null */
export async function currentMigration(db: pg.Pool | pg.PoolClient): Promise<string | null> {
  // 先查表在不在：引用不存在的表，整条语句在规划阶段就报错，case 拦不住
  const exists = await db.query("select to_regclass('schema_migrations') is not null as ok");
  if (!exists.rows[0].ok) return null;
  const { rows } = await db.query<{ version: string | null }>('select max(version) as version from schema_migrations');
  return rows[0]?.version ?? null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pool = createPool();
  try {
    const applied = await migrate(pool);
    console.log(applied.length ? `已执行迁移：${applied.join('、')}` : '没有新的迁移');
    console.log(`当前迁移版本：${await currentMigration(pool) ?? '无'}`);
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
