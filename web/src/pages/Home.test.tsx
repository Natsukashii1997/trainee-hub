// @vitest-environment jsdom
// 管培生首页（PRD v3.0 第 5 页，A 版「原位替换」，总纲 6.4）：深色「下一步」卡（含做完接着做、C09 标记已处理）、
// 带教点评（在等带教的 + 这次要改的最新 3 条）、本周、进度双圆环；资料、团队动态、AI 发现第一阶段只显示占位。
// 后端用 fetch 桩代替：首页查询返回固定数据，命令只记下请求体。
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionProvider, ToastProvider } from '../components/ui';
import Home, { type TraineeHomeView } from './Home';

const LIN = { id: 'u-lin', name: '林夏', role: 'trainee', isAdmin: false };
const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const later = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const fb = (id: string, content: string, extra: Record<string, unknown> = {}) => ({
  id, source: 'review', content, createdByName: '周颖', version: 1, milestoneId: 'ms-1-1', milestoneName: '问题定义', projectId: 'pj-1', ...extra,
});

function homeData(main: 'action' | 'waiting'): TraineeHomeView {
  const action = {
    kind: 'action', actionId: 'a1', actionKind: 'revise', content: '补齐另外两个班组的数据', milestoneId: 'ms-1-1', subjectName: '问题定义',
    projectId: 'pj-1', projectName: '来电归因优化', dueAt: later(30), milestoneStatus: 'revise',
  };
  const ms2 = { kind: 'milestone', milestoneId: 'ms-3-1', subjectName: '渠道漏斗梳理', projectId: 'pj-3', projectName: '渠道复盘', dueAt: later(60), milestoneStatus: 'doing' };
  const waitingMs = { kind: 'milestone', milestoneId: 'ms-1-1', subjectName: '问题定义', projectId: 'pj-1', projectName: '来电归因优化', dueAt: later(5), milestoneStatus: 'submitted', reviewerName: '周颖' };
  return {
    station: { module: '销售岗' },
    next: main === 'action' ? { main: action, then: ms2 } : { main: waitingMs, then: null },
    waiting: {
      reviews: [{ submissionId: 's2', version: 2, submittedAt: ago(30), reviewerName: '周颖', milestoneId: 'ms-1-1', subjectName: '问题定义', projectId: 'pj-1' }],
      blockers: [{ blockerId: 'b1', createdAt: ago(5), handlerName: '吴桐', milestoneId: 'ms-1-2', milestoneName: '分流方案', projectId: 'pj-1' }],
    },
    toFix: { total: 4, items: [fb('f4', '汇报先说结论', { source: 'verbal', version: null }), fb('f3', '没写不处理什么'), fb('f2', '只有一个班组的数据')] },
    week: {
      start: '2026-11-16',
      items: [{ kind: 'milestone', id: 'ms-1-1', title: '问题定义', dueAt: later(5), done: false, milestoneId: 'ms-1-1', projectId: 'pj-1' }],
      switches: [{ id: 's-lin-5', module: '定岗', startDate: '2026-11-25' }],
    },
    growth: {
      day: 70, totalDays: 191, tasks: { total: 7, due: 4, passed: 3 },
      stages: [{ no: 1, name: '入职', state: 'done' }, { no: 2, name: '通识', state: 'done' }, { no: 3, name: '轮岗', state: 'cur' }, { no: 4, name: '定岗', state: 'todo' }],
      rotation: [
        { id: 's3', module: '客服岗', startDate: '2026-10-15', endDate: '2026-11-11', pos: 'past', settled: true },
        { id: 's4', module: '销售岗', startDate: '2026-11-12', endDate: '2026-12-09', pos: 'current', settled: false },
      ],
      current: { id: 's4', module: '销售岗', startDate: '2026-11-12', endDate: '2026-12-09', pos: 'current', settled: false, days: 28, dayNo: 7 },
      next: { id: 's-lin-5', module: '定岗', startDate: '2026-12-10', endDate: '2027-03-19', pos: 'future', settled: false },
    },
  } as unknown as TraineeHomeView;
}

const posts: { id: string; body: Record<string, unknown> }[] = [];
function backend(data: TraineeHomeView) {
  posts.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (input === '/api/demo/identities') return ok({ identities: [LIN] });
    if (input === '/api/me') return ok({ me: LIN, demo: true });
    if (input === '/api/views/home') return ok({ result: data });
    if (input === '/api/views/todo') return ok({ result: { toReview: [], myActions: [], blockersToRespond: [], projectsToConfirm: [] } });
    const cmd = /^\/api\/commands\/(\w+)$/.exec(input);
    if (cmd) { posts.push({ id: cmd[1], body: JSON.parse(String(init?.body)) }); return ok({ result: {} }); }
    return ok({ result: null });
  }));
}
const mount = () => render(
  <MemoryRouter initialEntries={['/']}>
    <SessionProvider><ToastProvider><Routes><Route path="/" element={<Home />} /></Routes></ToastProvider></SessionProvider>
  </MemoryRouter>,
);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('管培生首页：下一步、做完接着做、在等带教的、这次要改的、本周、进度；去掉的模块不出现', async () => {
  backend(homeData('action'));
  mount();
  const next = await screen.findByRole('article', { name: '下一步' });
  expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('现在有 2 件事要做');
  expect(within(next).getByText('补齐另外两个班组的数据')).toBeTruthy();
  expect(within(next).getByText(/下一步 · 修改再交 · 来电归因优化 · 问题定义/)).toBeTruthy();
  expect(within(next).getByRole('link', { name: '去修改' }).getAttribute('href')).toBe('/projects/pj-1/milestones/ms-1-1');
  expect(within(next).getByText('做完接着做')).toBeTruthy();
  expect(within(next).getByText('渠道漏斗梳理')).toBeTruthy();

  const notes = screen.getByRole('region', { name: '带教点评' });
  const waiting = within(notes).getByLabelText('在等带教的');
  expect(within(waiting).getByText('问题定义 · 第 2 版')).toBeTruthy();
  expect(within(waiting).getByText('周颖 评审 · 已等 1 天')).toBeTruthy();
  expect(within(waiting).getByText('受阻 · 分流方案')).toBeTruthy();
  expect(within(waiting).getByText('吴桐 响应 · 已等 5 小时')).toBeTruthy();
  const fix = within(notes).getByLabelText('这次要改的');
  expect(within(fix).getByText('4 条待验证')).toBeTruthy();
  expect(within(fix).getAllByRole('link').map(a => a.textContent)).toEqual([
    expect.stringContaining('汇报先说结论'), expect.stringContaining('没写不处理什么'), expect.stringContaining('只有一个班组的数据'),
  ]);
  expect(within(fix).getByText(/另有 1 条/)).toBeTruthy();

  const week = screen.getByRole('region', { name: '我的本周' });
  expect(within(week).getByText('问题定义')).toBeTruthy();
  expect(within(week).getByText('换站 → 到定岗')).toBeTruthy();
  const prog = screen.getByRole('region', { name: '我的进度' });
  expect(within(prog).getByRole('img').getAttribute('aria-label')).toBe('完成 3/4，时间 37%');
  expect(within(prog).getByText('落后 1 项')).toBeTruthy();
  expect(within(prog).getByText('22 天后换到定岗')).toBeTruthy();

  for (const name of ['当前岗位资料', '团队动态']) expect(within(screen.getByRole('region', { name })).getByText('第二阶段接入')).toBeTruthy();
  expect(screen.queryByText(/贡献榜/)).toBeNull();
  expect(screen.queryByText(/推荐 AI 资产/)).toBeNull();
});

test('下一步行动可以就地标记已处理（C09）：不再需要时必须写原因', async () => {
  backend(homeData('action'));
  mount();
  const next = await screen.findByRole('article', { name: '下一步' });
  fireEvent.click(within(next).getByRole('button', { name: '标记已处理' }));
  fireEvent.click(within(next).getByRole('button', { name: '不再需要' }));
  const confirm = within(next).getByRole('button', { name: '确认' }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.change(within(next).getByLabelText('不再需要的原因'), { target: { value: '带教改成口头说明' } });
  fireEvent.click(confirm);
  await waitFor(() => expect(posts).toEqual([{ id: 'C09', body: { actionId: 'a1', result: 'dropped', resolution: '带教改成口头说明' } }]));
});

test('没有未完成的行动时显示当前里程碑；已交时标出在等谁评审，不能标记已处理', async () => {
  backend(homeData('waiting'));
  mount();
  const next = await screen.findByRole('article', { name: '下一步' });
  expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('成果在等 周颖 评审');
  expect(within(next).getByText(/下一步 · 当前里程碑/)).toBeTruthy();
  expect(within(next).getByRole('link', { name: '查看里程碑' })).toBeTruthy();
  expect(within(next).queryByRole('button', { name: '标记已处理' })).toBeNull();
  expect(within(next).queryByText('做完接着做')).toBeNull();
});
