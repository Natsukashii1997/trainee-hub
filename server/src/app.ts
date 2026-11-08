// HTTP 入口：横切的保护在这里统一做（全局坑 G-07），各接口只管自己的业务。
import http from 'node:http';
import type pg from 'pg';
import { currentMigration } from './migrate.ts';

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
    const err = e as Error & { code?: string };
    return { ok: false, db: 'down', migration: null, message: `数据库连不上：${err.code ?? err.message}`, checkedAt };
  }
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function createApp(pool: pg.Pool): http.Server {
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
      return send(res, 404, { error: '没有这个接口' });
    } catch (e) {
      console.error(e);
      if (!res.headersSent) send(res, 500, { error: '服务内部出错' });
    }
  });
}
