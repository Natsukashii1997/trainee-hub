// 本机开发库：项目自己的 PostgreSQL 16 实例，数据和密码都在仓库外，只监听 127.0.0.1（AGENTS.md「运行」）。
// 用法：node scripts/db.mjs up | stop | status | exec -- <命令…>
//   up      没有数据目录就建（initdb + 随机密码），没运行就启动，再确保开发库和测试库存在
//   stop    停止实例
//   status  看是否在运行
//   exec    读入连接串（DATABASE_URL、TEST_DATABASE_URL）后执行后面的命令；环境里已设的不覆盖
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_ROOT = process.env.TRAINEE_HUB_HOME ?? path.join(os.homedir(), 'Library/Application Support/trainee-hub');
const PGDATA = path.join(DATA_ROOT, 'pgdata');
const LOG = path.join(DATA_ROOT, 'postgres.log');
const ENV_FILE = path.join(DATA_ROOT, 'db.env');
const PG_BIN = process.env.PG_BIN ?? '/opt/homebrew/opt/postgresql@16/bin';
const PORT = Number(process.env.PGPORT_TRAINEE_HUB ?? 5433);
const USER = 'trainee_hub';
const DATABASES = { DATABASE_URL: 'trainee_hub', TEST_DATABASE_URL: 'trainee_hub_test' };

const bin = name => path.join(PG_BIN, name);
// macOS 上 LANG / LC_ALL 为空时，postmaster 启动会报「became multithreaded during startup」退出（docs/LESSONS.md L-02）
const PG_ENV = { ...process.env, LC_ALL: process.env.LC_ALL || 'en_US.UTF-8' };
const run = (name, args) => execFileSync(bin(name), args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: PG_ENV });

/** 读 db.env（KEY=VALUE 每行一条），返回对象；文件不存在返回空对象 */
export function readDbEnv() {
  if (!fs.existsSync(ENV_FILE)) return {};
  return Object.fromEntries(fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
}

function init() {
  if (!fs.existsSync(path.join(PG_BIN, 'initdb'))) throw new Error(`找不到 ${bin('initdb')}：先 brew install postgresql@16，或用 PG_BIN 指向它的 bin 目录`);
  fs.mkdirSync(DATA_ROOT, { recursive: true });
  const password = randomBytes(18).toString('base64url');
  const pwfile = path.join(DATA_ROOT, '.pwfile');
  fs.writeFileSync(pwfile, password, { mode: 0o600 });
  try {
    run('initdb', ['-D', PGDATA, '-U', USER, '--pwfile', pwfile, '--auth=scram-sha-256', '-E', 'UTF8', '--locale=C']);
  } finally {
    fs.rmSync(pwfile, { force: true });
  }
  // 只走 TCP、只听 127.0.0.1；不建 Unix 套接字（数据目录路径带空格，也用不着）
  fs.appendFileSync(path.join(PGDATA, 'postgresql.conf'), `\n# trainee-hub（scripts/db.mjs 写入）\nlisten_addresses = '127.0.0.1'\nport = ${PORT}\nunix_socket_directories = ''\ntimezone = 'UTC'\n`);
  const url = db => `postgres://${USER}:${password}@127.0.0.1:${PORT}/${db}`;
  fs.writeFileSync(ENV_FILE, Object.entries(DATABASES).map(([k, db]) => `${k}=${url(db)}`).join('\n') + '\n', { mode: 0o600 });
  console.log(`已建数据目录 ${PGDATA}，连接串写在 ${ENV_FILE}`);
}

const running = () => spawnSync(bin('pg_ctl'), ['-D', PGDATA, 'status'], { stdio: 'ignore' }).status === 0;

async function ensureDatabases() {
  const { default: pg } = await import('pg');
  const env = readDbEnv();
  const admin = new URL(env.DATABASE_URL);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    for (const db of Object.values(DATABASES)) {
      const { rowCount } = await client.query('select 1 from pg_database where datname = $1', [db]);
      if (!rowCount) { await client.query(`create database ${db}`); console.log(`已建数据库 ${db}`); }
    }
  } finally {
    await client.end();
  }
}

export async function up() {
  if (!fs.existsSync(path.join(PGDATA, 'PG_VERSION'))) init();
  if (!running()) {
    run('pg_ctl', ['-D', PGDATA, '-l', LOG, '-w', 'start']);
    console.log(`数据库已启动：127.0.0.1:${PORT}（日志 ${LOG}）`);
  } else console.log(`数据库已在运行：127.0.0.1:${PORT}`);
  await ensureDatabases();
}

function stop() {
  if (!running()) return console.log('数据库没有在运行');
  run('pg_ctl', ['-D', PGDATA, '-w', 'stop']);
  console.log('数据库已停止');
}

function exec(args) {
  if (!args.length) throw new Error('用法：node scripts/db.mjs exec -- <命令…>');
  const env = { ...readDbEnv(), ...process.env };
  const r = spawnSync(args[0], args.slice(1), { stdio: 'inherit', env });
  process.exitCode = r.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    if (cmd === 'up') await up();
    else if (cmd === 'stop') stop();
    else if (cmd === 'status') console.log(running() ? `数据库在运行：127.0.0.1:${PORT}` : '数据库没有在运行');
    else if (cmd === 'exec') exec(rest[0] === '--' ? rest.slice(1) : rest);
    else { console.error('用法：node scripts/db.mjs up | stop | status | exec -- <命令…>'); process.exitCode = 2; }
  } catch (e) {
    console.error(`数据库脚本出错：${e.stderr?.toString().trim() || e.message}`);
    process.exitCode = 1;
  }
}
