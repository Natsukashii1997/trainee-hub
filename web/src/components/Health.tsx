// 后端健康状态（issue #1）：主区右下角一枚小标记（外壳 AppLayout 里挂一次），从 /api/health 读，
// 数据库连通显示迁移版本，断开显示说明，不白屏。
import { useEffect, useState } from 'react';
import { fmtTime } from '../lib/time';

export type HealthView =
  | { state: 'checking' }
  | { state: 'ok' | 'warn' | 'down'; label: string; detail: string; checkedAt?: string };

const POLL_MS = 30_000;

/** 读健康检查并转成要显示的文字；任何失败都返回「down」，不抛错 */
export async function fetchHealth(): Promise<HealthView> {
  let res: Response;
  try {
    res = await fetch('/api/health', { cache: 'no-store' });
  } catch {
    return { state: 'down', label: '后端连不上', detail: '请求没有发出去：后端可能没有启动' };
  }
  let body: { ok?: boolean; db?: string; migration?: string | null; message?: string; checkedAt?: string };
  try {
    body = await res.json();
  } catch {
    return { state: 'down', label: '后端连不上', detail: `后端没有正常响应（HTTP ${res.status}）` };
  }
  const checkedAt = body.checkedAt;
  if (body.db === 'up' && body.ok && body.migration)
    return { state: 'ok', label: `迁移 ${body.migration.split('_')[0]}`, detail: `数据库正常，当前迁移 ${body.migration}`, checkedAt };
  if (body.db === 'up') return { state: 'warn', label: '数据库未迁移', detail: body.message ?? '数据库已连通，但还没有执行迁移', checkedAt };
  return { state: 'down', label: '数据库连不上', detail: body.message ?? `后端返回 HTTP ${res.status}`, checkedAt };
}

// 演示视角切换等会让外壳重新挂载，留住上一次结果，避免闪「检查中」
let last: HealthView = { state: 'checking' };

export function HealthStatus() {
  const [h, setH] = useState<HealthView>(last);
  useEffect(() => {
    let alive = true;
    const load = () => fetchHealth().then(v => { last = v; if (alive) setH(v); });
    load();
    const timer = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  if (h.state === 'checking') return <span className="health" role="status"><i aria-hidden="true" />检查中</span>;
  const title = h.checkedAt ? `${h.detail}（检查于 ${fmtTime(h.checkedAt)}）` : h.detail;
  return (
    <span className={`health ${h.state}`} role="status" title={title} aria-label={title}>
      <i aria-hidden="true" />{h.state === 'ok' ? <>数据库正常<em>·</em>{h.label}</> : h.label}
    </span>
  );
}
