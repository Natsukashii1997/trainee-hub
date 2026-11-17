// 数据库迁移：server/migrations/NNNN_名称.sql 按文件名顺序执行，每条在一个事务里，执行过的记进 schema_migrations。
// 重复执行只跑没跑过的；加会话级咨询锁，两个进程同时迁移时后一个等前一个做完。
// 防护（PR #27 审核 P1-02、P2-01、P2-02）：
// - 迁移文件里不能写事务控制语句（begin / commit / rollback …），否则执行器的事务会被提前提交，执行和登记不再同进同退；
// - 编号不能重复；已执行的迁移记校验值，文件事后被改直接报错，不自动重放；
// - 锁没解开就销毁连接，不把仍持锁的连接放回池里。
// 用法：node server/src/migrate.ts（需要 DATABASE_URL；本机用 npm run db:migrate）
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { createPool } from './db.ts';

const DIR = fileURLToPath(new URL('../migrations/', import.meta.url));
export const LOCK_KEY = 5_320_001; // 任意常数，只要本项目内不重复

export function migrationFiles(dir = DIR): { version: string; file: string }[] {
  const list = fs.readdirSync(dir).filter(f => /^\d{4}_[\w-]+\.sql$/.test(f)).sort().map(f => ({ version: f.slice(0, -4), file: path.join(dir, f) }));
  const seen = new Map<string, string>();
  for (const { version } of list) {
    const no = version.slice(0, 4);
    if (seen.has(no)) throw new Error(`迁移编号 ${no} 重复：${seen.get(no)} 和 ${version}；每个编号只能用一次`);
    seen.set(no, version);
  }
  return list;
}

const TX_CONTROL = new Set(['begin', 'start', 'commit', 'end', 'rollback', 'abort', 'savepoint', 'release', 'prepare']);

/**
 * 找迁移 SQL 里顶层的事务控制语句，返回第一个的关键字；没有返回 null。
 * 按 PostgreSQL 的词法跳过注释（含嵌套块注释）、字符串（含 E'' 转义）、带引号的标识符和 $标签$ 函数体，
 * 所以函数体里的 begin … end、字符串或注释里的 commit 不会误判。
 */
export function findTransactionControl(sql: string): string | null {
  let i = 0;
  let atStatementStart = true;
  while (i < sql.length) {
    const c = sql[i];
    if (sql.startsWith('--', i)) {
      const nl = sql.indexOf('\n', i);
      i = nl < 0 ? sql.length : nl + 1;
      continue;
    }
    if (sql.startsWith('/*', i)) {
      let depth = 0;
      do {
        if (sql.startsWith('/*', i)) { depth++; i += 2; }
        else if (sql.startsWith('*/', i)) { depth--; i += 2; }
        else i++;
      } while (depth > 0 && i < sql.length);
      continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    if (c === ';') { atStatementStart = true; i++; continue; }

    const word = /^[A-Za-z_][\w$]*/.exec(sql.slice(i, i + 64))?.[0];
    if (atStatementStart && word && TX_CONTROL.has(word.toLowerCase())) return word.toLowerCase();
    atStatementStart = false;

    if (c === "'") {
      // E'…' 里反斜杠转义；普通字符串里 '' 表示一个单引号
      const escapes = /[eE]/.test(sql[i - 1] ?? '') && !/[\w$]/.test(sql[i - 2] ?? '');
      i++;
      while (i < sql.length) {
        if (escapes && sql[i] === '\\') i += 2;
        else if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") { i++; break; }
        else i++;
      }
      continue;
    }
    if (c === '"') {
      i++;
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') i += 2;
        else if (sql[i] === '"') { i++; break; }
        else i++;
      }
      continue;
    }
    const dollar = c === '$' ? /^\$(?:[A-Za-z_][\w]*)?\$/.exec(sql.slice(i, i + 64))?.[0] : undefined;
    if (dollar) {
      const close = sql.indexOf(dollar, i + dollar.length);
      i = close < 0 ? sql.length : close + dollar.length;
      continue;
    }
    i += word ? word.length : 1;
  }
  return null;
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** 执行没跑过的迁移，返回这次新执行的版本号 */
// transaction 由初始化脚本提供，迁移加入该事务，提交与回滚均由调用者负责。
export async function migrate(pool: pg.Pool, dir = DIR, transaction?: pg.PoolClient): Promise<string[]> {
  const files = migrationFiles(dir).map(m => ({ ...m, sql: fs.readFileSync(m.file, 'utf8') }));
  const client = transaction ?? await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(transaction ? 'select pg_advisory_xact_lock($1)' : 'select pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query('create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())');
    await client.query('alter table schema_migrations add column if not exists checksum text');
    const { rows } = await client.query<{ version: string; checksum: string | null }>('select version, checksum from schema_migrations');
    const done = new Map(rows.map(r => [r.version, r.checksum]));

    // 先把要执行的和已执行的都查一遍，有问题一条都不执行
    const pending = [];
    for (const m of files) {
      const sum = sha256(m.sql);
      if (done.has(m.version)) {
        const recorded = done.get(m.version);
        if (recorded === null) await client.query('update schema_migrations set checksum = $2 where version = $1', [m.version, sum]); // 加校验值之前执行的，补记
        else if (recorded !== sum) throw new Error(`迁移 ${m.version} 执行后被改过（校验值对不上）；已执行的迁移不能改，要改表请新加一条`);
        continue;
      }
      const tx = findTransactionControl(m.sql);
      if (tx) throw new Error(`迁移 ${m.version} 里有事务控制语句「${tx}」；每条迁移由执行器包在一个事务里，文件里不要写 begin / commit / rollback 等`);
      pending.push({ ...m, sum });
    }

    for (const { version, sql, sum } of pending) {
      try {
        if (!transaction) await client.query('begin');
        const before = await client.query<{ x: string }>('select pg_current_xact_id()::text as x');
        await client.query(sql);
        // 第二道防线：事务号变了说明文件里的语句提前结束了事务，不登记，回滚剩下的
        const after = await client.query<{ x: string }>('select pg_current_xact_id()::text as x');
        if (after.rows[0].x !== before.rows[0].x) throw new Error('迁移提前结束了执行器的事务');
        await client.query('insert into schema_migrations (version, checksum) values ($1, $2)', [version, sum]);
        if (!transaction) await client.query('commit');
      } catch (e) {
        if (!transaction) await client.query('rollback');
        throw new Error(`迁移 ${version} 失败：${(e as Error).message}`);
      }
      applied.push(version);
    }
  } finally {
    if (!transaction) {
      let unlocked = false;
      try {
        unlocked = (await client.query<{ ok: boolean }>('select pg_advisory_unlock($1) as ok', [LOCK_KEY])).rows[0].ok;
      } catch {
        // 解锁失败：下面销毁连接，会话结束锁随之释放
      }
      client.release(!unlocked);
    }
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
