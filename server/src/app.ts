// HTTP 入口：横切的保护在这里统一做（全局坑 G-07），各接口只管自己的业务。
import http from 'node:http';
import type pg from 'pg';
import { type Actor, authorize } from './authorize.ts';
import { CommandError, isCommandId, runCommand } from './commands/index.ts';
import { DEMO_COOKIE } from './demo.ts';
import { currentMigration } from './migrate.ts';
import { runView } from './views/index.ts';

export interface Health {
  ok: boolean;
  db: 'up' | 'down';
  /** 当前迁移版本；还没迁移过为 null */
  migration: string | null;
  /** 出错时的中文说明 */
  message?: string;
  /** ISO（UTC），前端按北京时间显示 */
  checkedAt: string;
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const hostnameOf = (hostHeader: string) => hostHeader.replace(/:\d+$/, '');
/** 前端开发服务与预览服务（vite.config.ts）经代理转来的请求，Origin 是它们 */
const FRONTEND_ORIGINS = new Set(['5320', '5321'].flatMap(p => [`http://127.0.0.1:${p}`, `http://localhost:${p}`]));

/**
 * 来源校验：只监听 127.0.0.1 挡不住本机浏览器里任意网页发来的请求（全局坑 G-07）。
 * Host 必须是本机（防 DNS 重绑定）；带了 Origin 的，必须同源或是本项目前端。
 */
export function checkSource(req: http.IncomingMessage): string | null {
  const host = req.headers.host ?? '';
  if (!LOCAL_HOSTS.has(hostnameOf(host))) return '只接受本机地址访问';
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== `http://${host}` && !FRONTEND_ORIGINS.has(origin)) return '不接受其他网站发来的请求';
  return null;
}

export async function readHealth(pool: pg.Pool): Promise<Health> {
  const checkedAt = new Date().toISOString();
  try {
    const migration = await currentMigration(pool);
    return { ok: migration !== null, db: 'up', migration, checkedAt, ...(migration === null ? { message: '数据库已连通，但还没有执行迁移' } : {}) };
  } catch (e) {
    return { ok: false, db: 'down', migration: null, message: '数据库连不上，请检查数据库状态与连接配置', checkedAt };
  }
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

/** 读 JSON 请求体，最多 64 KB；不是合法 JSON 对象返回 null */
async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 64 * 1024) return null;
    chunks.push(chunk as Buffer);
  }
  try {
    const v: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function cookieOf(req: http.IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

async function findActor(pool: pg.Pool, id: string | undefined): Promise<Actor | null> {
  if (!id) return null;
  const { rows } = await pool.query<{ id: string; name: string; role: Actor['role']; is_admin: boolean }>(
    'select id, name, role, is_admin from app_user where id = $1 and stopped_at is null', [id]);
  return rows[0] ? { id: rows[0].id, name: rows[0].name, role: rows[0].role, isAdmin: rows[0].is_admin } : null;
}

/** 当前登录的人：演示模式下认演示身份 cookie；非演示模式在飞书登录做好之前（PRD 下篇 R1）一律当作未登录 */
async function currentActor(pool: pg.Pool, req: http.IncomingMessage, demo: boolean): Promise<Actor | null> {
  return demo ? findActor(pool, cookieOf(req, DEMO_COOKIE)) : null;
}

const demoCookie = (value: string, maxAge?: number) =>
  `${DEMO_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict${maxAge === undefined ? '' : `; Max-Age=${maxAge}`}`;

export interface AppOptions {
  /** 演示模式（demo.ts 的 resolveDemo 决定）；默认关 */
  demo?: boolean;
}

export function createApp(pool: pg.Pool, options: AppOptions = {}): http.Server {
  const demo = options.demo === true;
  return http.createServer(async (req, res) => {
    try {
      const refused = checkSource(req);
      if (refused) return send(res, 403, { error: refused });
      const { pathname } = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (pathname === '/api/health') {
        if (req.method !== 'GET') return send(res, 405, { error: '只支持 GET' });
        const health = await readHealth(pool);
        return send(res, health.db === 'up' ? 200 : 503, health);
      }

      // 演示登录：只在演示模式下存在
      if (pathname.startsWith('/api/demo/')) {
        if (!demo) return send(res, 404, { error: '没有这个接口' });
        if (pathname === '/api/demo/identities' && req.method === 'GET') {
          const { rows } = await pool.query('select id, name, role, is_admin as "isAdmin" from app_user where stopped_at is null order by role desc, id');
          return send(res, 200, { identities: rows });
        }
        if (pathname === '/api/demo/login' && req.method === 'POST') {
          const body = await readJson(req);
          const actor = await findActor(pool, typeof body?.userId === 'string' ? body.userId : undefined);
          if (!actor) return send(res, 400, { error: '没有这个示例身份' });
          res.setHeader('set-cookie', demoCookie(actor.id));
          return send(res, 200, { me: actor, demo });
        }
        if (pathname === '/api/demo/logout' && req.method === 'POST') {
          res.setHeader('set-cookie', demoCookie('', 0));
          return send(res, 200, { ok: true });
        }
        return send(res, 404, { error: '没有这个接口' });
      }

      // 其余 /api/* 都是业务接口：先过统一授权入口（authorize.ts），没登录一律 401
      const actor = await currentActor(pool, req, demo);
      const gate = authorize(actor, { kind: 'read' });
      if (!gate.ok) return send(res, gate.status, { error: demo ? gate.reason : `${gate.reason}：非演示模式在飞书登录做好之前不开放业务接口` });
      if (pathname === '/api/me' && req.method === 'GET') return send(res, 200, { me: actor, demo });

      // 业务命令：POST /api/commands/C01 …（PRD 4.2），都经执行器 runCommand（commands/index.ts）
      const cmd = /^\/api\/commands\/([A-Z]\d{2})$/.exec(pathname);
      if (cmd) {
        if (req.method !== 'POST') return send(res, 405, { error: '只支持 POST' });
        if (!isCommandId(cmd[1])) return send(res, 404, { error: '没有这个命令' });
        const body = await readJson(req);
        if (!body) return send(res, 400, { error: '请求体应为 JSON 对象' });
        try {
          return send(res, 200, { result: await runCommand(pool, actor, cmd[1], body) });
        } catch (e) {
          if (e instanceof CommandError) return send(res, e.status, { error: e.message });
          const code = (e as { code?: string }).code;
          // 数据库约束兜底（23xxx）：命令里的校验没拦住的情况，不暴露内部细节
          if (code?.startsWith('23')) return send(res, 409, { error: '数据不符合约束，没有写入' });
          throw e;
        }
      }
      // A 级查询：GET /api/views/…（views/index.ts），每个查询都过统一授权入口
      if (pathname.startsWith('/api/views/')) {
        if (req.method !== 'GET') return send(res, 405, { error: '只支持 GET' });
        try {
          return send(res, 200, { result: await runView(pool, actor as Actor, pathname.slice('/api/views/'.length)) });
        } catch (e) {
          if (e instanceof CommandError) return send(res, e.status, { error: e.message });
          throw e;
        }
      }
      return send(res, 404, { error: '没有这个接口' });
    } catch (e) {
      // 数据库异常可能带整行数据、SQL 或连接串，只保留格式受限的错误码。
      const code = (e as { code?: unknown })?.code;
      console.error('服务内部出错', typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code) ? code : 'UNKNOWN');
      if (!res.headersSent) send(res, 500, { error: '服务内部出错' });
    }
  });
}
