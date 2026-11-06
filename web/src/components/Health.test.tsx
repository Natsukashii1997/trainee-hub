import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHealth, HealthStatus } from './Health';

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));

afterEach(() => vi.unstubAllGlobals());

describe('后端健康状态', () => {
  it('数据库连通：显示迁移版本，检查时间按北京时间', async () => {
    vi.stubGlobal('fetch', reply(200, { ok: true, db: 'up', migration: '0001_init', checkedAt: '2026-11-06T09:30:00Z' }));
    render(<HealthStatus />);
    const el = await screen.findByText(/数据库正常/);
    expect(el.className).toBe('health ok');
    expect(el.textContent).toBe('数据库正常·迁移 0001');
    expect(el.getAttribute('title')).toBe('数据库正常，当前迁移 0001_init（检查于 17:30）');
  });

  it('数据库断开：后端返回 503，显示中文说明', async () => {
    vi.stubGlobal('fetch', reply(503, { ok: false, db: 'down', migration: null, message: '数据库连不上：ECONNREFUSED', checkedAt: '2026-11-06T09:30:00Z' }));
    expect(await fetchHealth()).toMatchObject({ state: 'down', label: '数据库连不上', detail: '数据库连不上：ECONNREFUSED' });
  });

  it('连通但没迁移：提示未迁移', async () => {
    vi.stubGlobal('fetch', reply(200, { ok: false, db: 'up', migration: null, message: '数据库已连通，但还没有执行迁移' }));
    expect(await fetchHealth()).toMatchObject({ state: 'warn', label: '数据库未迁移' });
  });

  it('后端没起：代理返回非 JSON 或请求失败，都不抛错', async () => {
    vi.stubGlobal('fetch', reply(502, ''));
    expect(await fetchHealth()).toMatchObject({ state: 'down', label: '后端连不上', detail: '后端没有正常响应（HTTP 502）' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await fetchHealth()).toMatchObject({ state: 'down', label: '后端连不上' });
  });
});
