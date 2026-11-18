// @vitest-environment jsdom
// 里程碑详情（PRD v3.0 第 1 页，B 版时间线）：带教评审时验证上次的反馈并分条写新反馈；管培生看「这次要改的」（待验证最多 3 条）并修改再交。
// 后端用 fetch 桩代替：查询返回固定数据，命令只记下请求体。
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionProvider, ToastProvider } from '../components/ui';
import { MilestoneDetail, type MilestoneView } from './Milestone';

const ZHOU = { id: 'u-zhou', name: '周颖', role: 'mentor', isAdmin: true };
const LIN = { id: 'u-lin', name: '林夏', role: 'trainee', isAdmin: false };

const fb = (id: string, content: string, extra: Record<string, unknown> = {}) => ({
  id, traineeId: 'u-lin', traineeName: '林夏', source: 'review', content, tags: [], nature: null, needsAction: false, verifyNext: true,
  createdByName: '周颖', createdAt: '2026-11-12T02:00:00Z', reviewId: 'r1', submissionId: 's1', version: 1, milestoneId: 'ms-1-1', milestoneName: '问题定义',
  pending: true, verifications: [], ...extra,
});

function milestone(status: MilestoneView['status'], v2: boolean): MilestoneView {
  const review = {
    id: 'r1', grade: '需改进', comment: '', keyIssue: '口径没说清', judgment: null, reviewerName: '周颖', createdAt: '2026-11-12T02:00:00Z',
    actions: [{ id: 'a1', kind: 'revise', content: '按反馈改完再交', status: v2 ? 'done' : 'open', resolution: null, ownerId: 'u-lin', ownerName: '林夏' }],
    feedback: [fb('f1', '分类口径没有依据', { tags: ['分类口径'], nature: 'standard' }), fb('f2', '只有一个班组的数据'), fb('f3', '没写不处理什么', { needsAction: true, verifyNext: false, pending: false }), fb('f4', '录音抽查做得好', { verifyNext: false, pending: false })],
  };
  const sub = (id: string, version: number, at: string, state: string, r: unknown) => ({
    id, version, url: `https://example.feishu.cn/docx/v${version}`, note: null, changeNote: version > 1 ? '补了另外两个班组' : null, submittedAt: at,
    submitterId: 'u-lin', submitterName: '林夏', reviewerId: 'u-zhou', reviewerName: '周颖', reviewState: state, review: r, credits: [], verifications: [],
  });
  const verbal = fb('o1', '汇报先说结论', { source: 'verbal', reviewId: null, submissionId: null, version: null, createdAt: '2026-11-13T02:00:00Z' });
  return {
    id: 'ms-1-1', name: '问题定义', goal: '把近四周来电按问题分类', acceptanceCriteria: '分类口径经带教确认；三类问题各有样本和占比',
    commonMistakes: '先想好方案再倒推问题\n样本只取一个班组', escalation: '标签一天内导不出来', sampleLinks: [{ title: '上一期样例', url: 'https://example.feishu.cn/docx/s' }],
    status, dueAt: '2026-11-13T10:00:00Z', originalDueAt: '2026-11-13T10:00:00Z', cancelReason: null, blocked: false,
    createdByName: '林夏', createdAt: '2026-11-05T02:00:00Z', projectId: 'pj-1', projectName: '来电归因优化', projectStatus: 'active',
    members: [{ id: 'u-lin', name: '林夏', role: 'lead' }], mentor: { id: 'u-zhou', name: '周颖' }, deadlineChanges: [],
    submissions: [sub('s1', 1, '2026-11-11T02:00:00Z', 'reviewed', review), ...(v2 ? [sub('s2', 2, '2026-11-17T08:00:00Z', 'pending', null)] : [])],
    blockers: [], verbalFeedback: [verbal], tasks: [], verifiableFeedbackIds: v2 ? ['f1', 'f2', 'o1', 'f9'] : [],
    pendingFeedback: [review.feedback[0], review.feedback[1], verbal, fb('f9', '另一个里程碑上的反馈', { milestoneName: '分流方案', createdAt: '2026-11-10T02:00:00Z' })],
  } as unknown as MilestoneView;
}

const posts: { id: string; body: Record<string, unknown> }[] = [];
function backend(me: typeof ZHOU, data: MilestoneView) {
  posts.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (input === '/api/demo/identities') return ok({ identities: [ZHOU, LIN] });
    if (input === '/api/me') return ok({ me, demo: true });
    if (input.startsWith('/api/views/milestones/')) return ok({ result: data });
    if (input === '/api/views/todo') return ok({ result: { toReview: [], myActions: [], blockersToRespond: [], projectsToConfirm: [] } });
    const cmd = /^\/api\/commands\/(\w+)$/.exec(input);
    if (cmd) { posts.push({ id: cmd[1], body: JSON.parse(String(init?.body)) }); return ok({ result: {} }); }
    return ok({ result: null });
  }));
}
const mount = () => render(
  <MemoryRouter initialEntries={['/projects/pj-1/milestones/ms-1-1']}>
    <SessionProvider><ToastProvider><Routes><Route path="/projects/:id/milestones/:mid" element={<MilestoneDetail />} /></Routes></ToastProvider></SessionProvider>
  </MemoryRouter>,
);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('带教评审第 2 版：列出这一版之前的待验证反馈（含口头的），逐条验证、分条写新反馈，一次提交 C08', async () => {
  backend(ZHOU, milestone('submitted', true));
  mount();
  const check = await screen.findByRole('region', { name: '上次说的，这次改了吗' });
  // 4 条待验证都在第 2 版提交之前，都能在这一版上验证
  expect(within(check).getByText('4 条待验证')).toBeTruthy();
  const items = within(check).getAllByRole('group', { name: '验证结果' });
  fireEvent.click(within(items[0]).getByRole('button', { name: '已改善' }));
  fireEvent.click(within(items[1]).getByRole('button', { name: '仍存在' }));

  const compose = screen.getByRole('region', { name: '这一版的反馈' });
  fireEvent.change(within(compose).getByLabelText('写一条反馈'), { target: { value: '第三类的样本还是少' } });
  fireEvent.click(within(compose).getByRole('button', { name: '加上这一条' }));
  fireEvent.click(within(compose).getByRole('button', { name: '下次验证' }));
  fireEvent.change(within(compose).getByLabelText('第 1 条的标签'), { target: { value: '证据来源 样本' } });
  fireEvent.click(within(compose).getByRole('button', { name: '需改进' }));
  fireEvent.click(within(compose).getByRole('button', { name: '提交评审' }));

  await waitFor(() => expect(posts.map(p => p.id)).toEqual(['C08']));
  expect(posts[0].body).toMatchObject({
    submissionId: 's2', grade: '需改进', actions: [{ kind: 'revise', content: '按上面的反馈改完再交' }],
    feedback: [{ content: '第三类的样本还是少', tags: ['证据来源', '样本'], nature: null, verifyNext: true, needsAction: false }],
    verifications: [{ feedbackId: 'f1', result: 'improved' }, { feedbackId: 'f2', result: 'persisting' }],
  });
});

test('没选结论不提交', async () => {
  backend(ZHOU, milestone('submitted', true));
  mount();
  fireEvent.click(await screen.findByRole('button', { name: '提交评审' }));
  expect(await screen.findByText('还没选结论。')).toBeTruthy();
  expect(posts).toEqual([]);
});

test('管培生需修改：「这次要改的」先列这一版就要补上的，待验证最多 3 条；修改说明必填，提交 C07', async () => {
  backend(LIN, milestone('revise', false));
  mount();
  const fix = await screen.findByRole('region', { name: '这次要改的' });
  expect(within(fix).getByText('没写不处理什么')).toBeTruthy();
  expect(within(fix).getAllByText(/分类口径没有依据|只有一个班组的数据|汇报先说结论/)).toHaveLength(3);
  expect(within(fix).queryByText('另一个里程碑上的反馈')).toBeNull();
  expect(within(fix).getByText('另有 1 条待验证的反馈，先改上面这几条。')).toBeTruthy();

  const form = screen.getByRole('region', { name: '修改再交' });
  fireEvent.change(within(form).getByLabelText('成果链接（飞书文档或 GitHub）'), { target: { value: 'https://example.feishu.cn/docx/v2' } });
  const go = within(form).getByRole('button', { name: '提交第 2 版' }) as HTMLButtonElement;
  expect(go.disabled).toBe(true);
  fireEvent.change(within(form).getByLabelText(/修改说明/), { target: { value: '补了另外两个班组' } });
  fireEvent.click(go);
  await waitFor(() => expect(posts).toEqual([{ id: 'C07', body: { prevReviewId: 'r1', url: 'https://example.feishu.cn/docx/v2', changeNote: '补了另外两个班组' } }]));
});

test('时间线：任务标准五件事、各版成果、评审里的分条反馈和口头反馈按时间排，最后一格是现在', async () => {
  backend(LIN, milestone('submitted', true));
  mount();
  const std = await screen.findByRole('region', { name: '任务标准' });
  for (const t of ['为什么做、交付什么', '怎样算好', '常见失误', '什么情况要及时找带教', '样例']) expect(within(std).getByText(t)).toBeTruthy();
  const titles = screen.getAllByRole('region').map(r => r.getAttribute('aria-label'));
  expect(titles.slice(0, 5)).toEqual(['任务标准', '第 1 版', '第 1 版评审', '口头反馈', '第 2 版']);
  expect(screen.getByText('等周颖评审第 2 版')).toBeTruthy();
  expect(within(screen.getByRole('region', { name: '第 1 版评审' })).getByText('4 条反馈，2 条下次验证')).toBeTruthy();
});
