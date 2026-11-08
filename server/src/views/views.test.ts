// A 级查询的测试（issue #42）：待办四类与事实对象一致、两种首页与决策看板、项目与节点详情、我的路径、任务详情、
// 成长档案（通过的成果、能力证据点回来源）、成长时间线（含本人参与项目的项目事件）；查询都经过统一授权入口。
// 连真测试库，和其他后端测试用同一把测试锁；每个 test 前用初始化脚本重置示例数据。
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, test } from 'node:test';
import type pg from 'pg';
import { createApp } from '../app.ts';
import type { Actor, CommandId } from '../authorize.ts';
import { CommandError, runCommand } from '../commands/index.ts';
import { createPool } from '../db.ts';
import { DEMO_COOKIE } from '../demo.ts';
import { resetDemo } from '../seed.ts';
import { checkConnectedTestDb, checkTestUrl } from '../testdb.ts';
import { runView } from './index.ts';

const url = process.env.TEST_DATABASE_URL;
const refused = checkTestUrl(url);
if (refused) throw new Error(`不清库，停止测试：${refused}`);

const TEST_LOCK = 5_320_002;
let pool: pg.Pool;
let lockClient: pg.PoolClient;

before(async () => {
  pool = createPool(url);
  lockClient = await pool.connect();
  const wrong = await checkConnectedTestDb(lockClient);
  if (wrong) throw new Error(`不清库，停止测试：${wrong}`);
  await lockClient.query('select pg_advisory_lock($1)', [TEST_LOCK]);
});
after(async () => {
  await lockClient.query('select pg_advisory_unlock($1)', [TEST_LOCK]);
  lockClient.release();
  await pool.end();
});
beforeEach(() => resetDemo(pool, { TRAINEE_HUB_DEMO: '1' }, url));

// 示例数据里的人（seed.ts）：林夏、许诺是管培生；周颖是两人的默认带教，有管理权限；吴桐（u-wu）是许诺销售站和 pj-2 的带教
const lin: Actor = { id: 'u-lin', name: '林夏', role: 'trainee', isAdmin: false };
const xu: Actor = { id: 'u-xu', name: '许诺', role: 'trainee', isAdmin: false };
const zhou: Actor = { id: 'u-zhou', name: '周颖', role: 'mentor', isAdmin: true };
const wu: Actor = { id: 'u-wu', name: '吴桐', role: 'mentor', isAdmin: false };

const run = <T = Record<string, unknown>>(actor: Actor, command: CommandId, input: Record<string, unknown>) => runCommand(pool, actor, command, input) as Promise<T>;
/** 测试里按需取字段，不为每个查询结果写类型 */
type Any = any;
const view = (actor: Actor, route: string) => runView(pool, actor, route) as Promise<Any>;
const ids = (sql: string, params: unknown[] = []) => pool.query(sql, params).then(r => r.rows.map(x => x.id as string));
const pick = (list: Any[], key: string) => list.map(x => x[key]);

/** 查询失败：抛出指定状态码的错误 */
const denied = (fn: () => Promise<unknown>, code: number, message: RegExp) =>
  assert.rejects(fn(), (e: unknown) => e instanceof CommandError && e.status === code && message.test(e.message));

/** 走一遍 pj-1 节点 ms-1-1：V1 需改进 → V2 通过并认定两人的任务 → 提炼能力证据 */
async function passMs11() {
  const v1 = await run<{ submissionId: string }>(lin, 'C06', { milestoneId: 'ms-1-1', url: 'https://feishu.cn/docx/v1' });
  const r1 = await run<{ reviewId: string }>(zhou, 'C08', { submissionId: v1.submissionId, grade: '需改进', actions: [{ kind: 'revise', content: '补样本' }] });
  const v2 = await run<{ submissionId: string }>(lin, 'C07', { prevReviewId: r1.reviewId, url: 'https://feishu.cn/docx/v2', changeNote: '补了' });
  const r2 = await run<{ reviewId: string }>(zhou, 'C08', { submissionId: v2.submissionId, grade: '达标', creditTaskIds: ['k-lin-3', 'k-xu-3'] });
  return { v1: v1.submissionId, r1: r1.reviewId, v2: v2.submissionId, r2: r2.reviewId };
}

describe('待办四类与事实对象一致（PRD 第 11 节）', () => {
  /** 每类都和直接查事实对象的结果对比 */
  async function check(actor: Actor) {
    const t = await view(actor, 'todo');
    assert.deepEqual(pick(t.toReview, 'submissionId'), await ids("select id from submission where reviewer_id = $1 and review_state = 'pending' order by submitted_at, id", [actor.id]));
    assert.deepEqual(pick(t.myActions, 'id'), await ids("select id from next_action where owner_id = $1 and status = 'open' and kind in ('revise', 'advance') order by id", [actor.id]));
    const mentees = await ids(`select distinct trainee_id as id from mentorship where mentor_id = $1 and start_date <= (now() at time zone 'Asia/Shanghai')::date and (end_date is null or end_date >= (now() at time zone 'Asia/Shanghai')::date)`, [actor.id]);
    assert.deepEqual(pick(t.blockersToRespond, 'blockerId').sort(), (await ids(
      "select b.id from blocker b join milestone m on m.id = b.milestone_id where b.status = 'open' and exists (select 1 from project_member pm where pm.project_id = m.project_id and pm.trainee_id = any($1))", [mentees])).sort());
    assert.deepEqual(pick(t.projectsToConfirm, 'projectId').sort(), (await ids(
      "select p.id from project p where p.status = 'draft' and exists (select 1 from project_member pm where pm.project_id = p.id and pm.trainee_id = any($1))", [mentees])).sort());
    return t;
  }

  test('随命令变化：待我评审、我的下一步行动、受阻待响应（响应后消失，骨架验收第 4 项）、待确认立项', async () => {
    // 初始：pj-2 草拟，周颖、吴桐（都带许诺）待确认立项里都有
    assert.deepEqual(pick((await check(zhou)).projectsToConfirm, 'projectId'), ['pj-2']);
    assert.deepEqual(pick((await check(wu)).projectsToConfirm, 'projectId'), ['pj-2']);

    const v1 = await run<{ submissionId: string }>(lin, 'C06', { milestoneId: 'ms-1-1', url: 'https://feishu.cn/docx/v1' });
    assert.deepEqual(pick((await check(zhou)).toReview, 'submissionId'), [v1.submissionId]);
    assert.deepEqual((await check(wu)).toReview, []);

    const r1 = await run<{ reviewId: string; actionIds: string[] }>(zhou, 'C08', { submissionId: v1.submissionId, grade: '需改进', actions: [{ kind: 'revise', content: '补样本' }, { kind: 'suggest', content: '可选' }] });
    assert.deepEqual((await check(zhou)).toReview, []);
    assert.deepEqual(pick((await check(lin)).myActions, 'id'), [r1.actionIds[0]]); // 「建议」不进待办

    const b = await run<{ blockerId: string }>(xu, 'C10', { milestoneId: 'ms-2-1', reason: '等数据' });
    assert.deepEqual(pick((await check(zhou)).blockersToRespond, 'blockerId'), [b.blockerId]);
    assert.deepEqual(pick((await check(wu)).blockersToRespond, 'blockerId'), [b.blockerId]);
    await run(wu, 'C11', { blockerId: b.blockerId, content: '我去催' });
    assert.deepEqual((await check(zhou)).blockersToRespond, []); // 响应后消失，但仍受阻
    assert.equal((await view(xu, 'milestones/ms-2-1')).blocked, true);

    await run(zhou, 'C02', { projectId: 'pj-2' });
    assert.deepEqual((await check(zhou)).projectsToConfirm, []);

    const v2 = await run<{ submissionId: string }>(lin, 'C07', { prevReviewId: r1.reviewId, url: 'https://feishu.cn/docx/v2', changeNote: '补了' });
    assert.deepEqual((await check(lin)).myActions, []);
    assert.deepEqual(pick((await check(zhou)).toReview, 'submissionId'), [v2.submissionId]);

    // 管培生没有评审、受阻待响应、待确认立项
    const t = await check(lin);
    assert.deepEqual([t.toReview, t.blockersToRespond, t.projectsToConfirm], [[], [], []]);
  });
});

describe('首页（两种角色）与决策看板', () => {
  test('管培生首页：当前站、主推项目与当前节点、最重要的下一步、需要协调的事、最新反馈、证据覆盖', async () => {
    const v1 = await run<{ submissionId: string }>(lin, 'C06', { milestoneId: 'ms-1-1', url: 'https://feishu.cn/docx/v1' });
    await run(zhou, 'C08', { submissionId: v1.submissionId, grade: '需改进', keyIssue: '口径未定', actions: [{ kind: 'revise', content: '补样本' }] });
    await run(lin, 'C10', { milestoneId: 'ms-1-2', reason: '等试点班组' });
    await run(zhou, 'C16', { traineeId: 'u-lin', itemId: 'ci-2', sourceType: 'observation', summary: '能讲清服务链路', judgment: 'guided' });

    const h = await view(lin, 'home');
    assert.equal(h.role, 'trainee');
    const station = await pool.query("select s.id from personal_module s join personal_path p on p.id = s.path_id where p.user_id = 'u-lin' and s.start_date <= (now() at time zone 'Asia/Shanghai')::date and s.end_date >= (now() at time zone 'Asia/Shanghai')::date");
    assert.equal(h.station?.id ?? null, station.rows[0]?.id ?? null);
    assert.deepEqual([h.focus.id, h.focus.currentMilestone.id, h.focus.currentMilestone.status], ['pj-1', 'ms-1-1', 'revise']);
    assert.deepEqual(pick(h.nextActions, 'kind'), ['revise']);
    assert.deepEqual(pick(h.blocked, 'milestoneId'), ['ms-1-2']);
    assert.deepEqual(h.pending, []);
    assert.deepEqual([h.latestFeedback[0].grade, h.latestFeedback[0].keyIssue], ['需改进', '口径未定']);
    assert.deepEqual(h.progress, { itemsTotal: 5, itemsCovered: 1, evidenceTotal: 1 });
  });

  test('带教首页：待我判断、我带的人（风险标记）；有管理权限的才有决策看板', async () => {
    // ms-1-1 连续两次需改进；许诺的 ms-2-1 受阻
    const v1 = await run<{ submissionId: string }>(lin, 'C06', { milestoneId: 'ms-1-1', url: 'https://feishu.cn/docx/v1' });
    const r1 = await run<{ reviewId: string }>(zhou, 'C08', { submissionId: v1.submissionId, grade: '需改进', actions: [{ kind: 'revise', content: '补' }] });
    const v2 = await run<{ submissionId: string }>(lin, 'C07', { prevReviewId: r1.reviewId, url: 'https://feishu.cn/docx/v2', changeNote: '改' });
    await run(zhou, 'C08', { submissionId: v2.submissionId, grade: '需改进', actions: [{ kind: 'revise', content: '再补' }] });
    await run(xu, 'C10', { milestoneId: 'ms-2-1', reason: '等数据' });
    await run(zhou, 'C02', { projectId: 'pj-2' });
    const v3 = await run<{ submissionId: string; reviewerId: string }>(xu, 'C06', { taskId: 'k-xu-6', url: 'https://feishu.cn/docx/x' });

    const h = await view(zhou, 'home');
    assert.equal(h.role, 'mentor');
    assert.deepEqual(pick(h.awaiting.blockersToRespond, 'milestoneId'), ['ms-2-1']);
    assert.deepEqual(pick(h.mentees, 'id'), ['u-lin', 'u-xu']);
    const [linRow, xuRow] = h.mentees;
    assert.deepEqual(linRow.risks, { blocked: false, repeatedRevise: true });
    assert.deepEqual(xuRow.risks, { blocked: true, repeatedRevise: true }); // 许诺参与 pj-1，ms-1-1 连续两次需改进也算他的风险
    assert.equal(linRow.focus.currentMilestone.id, 'ms-1-1');
    assert.equal(linRow.lastFeedback.grade, '需改进');
    const [repeated, pendingBy] = h.dashboard.signals;
    assert.equal(repeated.label, '某项目连续两次未通过同一节点');
    assert.deepEqual(pick(repeated.items, 'milestoneId'), ['ms-1-1']);
    const expected = Object.fromEntries((await pool.query("select u.id, count(s.id)::int as n from app_user u left join submission s on s.reviewer_id = u.id and s.review_state = 'pending' where u.role = 'mentor' group by u.id")).rows.map(r => [r.id, r.n]));
    assert.deepEqual(Object.fromEntries(pendingBy.items.map((x: Any) => [x.mentorId, x.pending])), expected);
    assert.ok(Object.values(expected).some(n => n === 1), `许诺的任务成果待 ${v3.reviewerId} 评审`);

    const w = await view(wu, 'home');
    assert.equal(w.dashboard, null);
    assert.ok(pick(w.mentees, 'id').includes('u-xu'));
    assert.equal((await view(wu, 'dashboard')).signals.length, 2); // 骨架期带教都能看看板（PRD 2.3），首页只给有管理权限的带
    await denied(() => view(lin, 'dashboard'), 403, /只有带教能查看/);
  });
});

describe('项目、节点、任务、路径', () => {
  test('项目列表：管培生只看自己参与的（含草拟），带教看全部；带当前节点、受阻、项目带教', async () => {
    assert.deepEqual(pick(await view(lin, 'projects'), 'id'), ['pj-1']);
    assert.deepEqual(pick(await view(xu, 'projects'), 'id'), ['pj-1', 'pj-2']);
    const all = await view(zhou, 'projects');
    assert.deepEqual(pick(all, 'id'), ['pj-1', 'pj-2']);
    const pj2 = all.find((p: Any) => p.id === 'pj-2');
    assert.deepEqual([pj2.status, pj2.leadId, pj2.mentor.id, pj2.currentMilestone.id, pj2.blocked], ['draft', 'u-xu', 'u-wu', 'ms-2-1', false]);
  });

  test('项目详情与节点详情：版本时间线带评审、行动、认定；受阻带响应；关联任务带认定', async () => {
    const f = await passMs11();
    const b = await run<{ blockerId: string }>(lin, 'C10', { milestoneId: 'ms-1-2', reason: '等试点' });
    await run(zhou, 'C11', { blockerId: b.blockerId, content: '下周开始' });

    const p = await view(xu, 'projects/pj-1');
    assert.deepEqual(pick(p.members, 'id'), ['u-lin', 'u-xu']);
    assert.equal(p.mentor.id, 'u-zhou');
    assert.deepEqual(p.milestones.map((m: Any) => [m.id, m.status, m.blocked, m.latestSubmission?.version ?? null]), [['ms-1-1', 'passed', false, 2], ['ms-1-2', 'todo', true, null]]);
    assert.deepEqual(p.tasks.filter((t: Any) => t.credited).map((t: Any) => t.id), ['k-lin-3', 'k-xu-3']);
    assert.equal(p.recentReviews[0].grade, '达标');
    assert.equal(p.conclusion, null);

    const m = await view(lin, 'milestones/ms-1-1');
    assert.deepEqual(m.submissions.map((s: Any) => [s.version, s.reviewerId, s.review.grade, s.review.actions.length, s.credits.length]), [[1, 'u-zhou', '需改进', 1, 0], [2, 'u-zhou', '达标', 0, 2]]);
    assert.equal(m.submissions[0].review.actions[0].status, 'done');
    assert.deepEqual(m.tasks.map((t: Any) => [t.id, t.credit?.submissionId]), [['k-lin-3', f.v2], ['k-xu-3', f.v2]]);
    const m2 = await view(lin, 'milestones/ms-1-2');
    assert.deepEqual(m2.blockers.map((x: Any) => [x.status, x.responses.length, x.handlerId]), [['responded', 1, 'u-zhou']]);
  });

  test('任务详情：在项目中完成的看认定记录（点回节点）；自己交的看版本与评审；我的路径', async () => {
    const f = await passMs11();
    const k = await view(xu, 'tasks/k-xu-3');
    assert.deepEqual([k.status, k.inProject, k.projectId], ['passed', true, 'pj-1']);
    assert.deepEqual(k.credits.map((c: Any) => [c.submissionId, c.version, c.milestoneId, c.creditedBy]), [[f.v2, 2, 'ms-1-1', 'u-zhou']]);
    assert.deepEqual(k.submissions, []);

    const v = await run<{ submissionId: string }>(lin, 'C06', { taskId: 'k-lin-4', url: 'https://feishu.cn/docx/t' });
    await run(zhou, 'C05', { subjectType: 'task', subjectId: 'k-lin-4', dueAt: '2026-12-31T18:00:00+08:00', reason: '等数据' });
    const t = await view(lin, 'tasks/k-lin-4');
    assert.deepEqual(t.submissions.map((s: Any) => [s.id, s.reviewState]), [[v.submissionId, 'pending']]);
    assert.equal(t.deadlineChanges.length, 1);

    const path = await view(lin, 'path');
    assert.equal(path.cohort.id, 'c-demo');
    assert.equal(path.stations.length, 5);
    assert.ok(path.stations.filter((s: Any) => s.current).length <= 1);
    const k3 = path.stations.flatMap((s: Any) => s.tasks).find((t: Any) => t.id === 'k-lin-3');
    assert.deepEqual([k3.inProject, k3.projectName, k3.status], [true, '来电归因优化', 'passed']);
    assert.deepEqual(await view(zhou, 'path/u-lin'), path);
  });
});

describe('成长档案与成长时间线', () => {
  test('通过的成果 = 本人提交且通过的版本 + 对本人任务的认定记录（PRD 8.4）', async () => {
    const f = await passMs11();
    const own = await run<{ submissionId: string }>(xu, 'C06', { taskId: 'k-xu-6', url: 'https://feishu.cn/docx/x' });
    await run(zhou, 'C08', { submissionId: own.submissionId, grade: '优秀' });

    const linPassed = (await view(lin, 'people/u-lin')).passed.map((x: Any) => [x.kind, x.submissionId, x.taskId]);
    assert.deepEqual(linPassed.sort(), [['credit', f.v2, 'k-lin-3'], ['submission', f.v2, null]].sort());
    const xuPassed = (await view(xu, 'people/u-xu')).passed.map((x: Any) => [x.kind, x.submissionId, x.taskId]);
    assert.deepEqual(xuPassed.sort(), [['credit', f.v2, 'k-xu-3'], ['submission', own.submissionId, 'k-xu-6']].sort());
    // 需改进的 V1 不算
    assert.ok(!linPassed.some((x: Any) => x[1] === f.v1));
  });

  test('能力证据按能力项列出，并能点回来源节点和版本（骨架验收第 6 项）；项目经历带交付与验证', async () => {
    const f = await passMs11();
    await run(zhou, 'C16', { traineeId: 'u-xu', itemId: 'ci-3', sourceType: 'review', sourceId: f.r2, summary: '参与问题分类', judgment: 'guided' });
    await run(lin, 'C14', { projectId: 'pj-1', delivery: 'met' });
    const p = await view(xu, 'people/u-xu');
    const ci3 = p.competencies.find((c: Any) => c.no === 3);
    assert.equal(ci3.name, '实际项目推进与交付');
    assert.deepEqual(ci3.evidence.map((e: Any) => [e.sourceType, e.milestoneId, e.version, e.projectId, e.confirmedBy]), [['review', 'ms-1-1', 2, 'pj-1', 'u-zhou']]);
    assert.equal(p.competencies.length, 5);
    assert.deepEqual(p.projects.map((x: Any) => [x.id, x.role, x.delivery ?? null, x.verificationStatus ?? null]), [['pj-1', 'member', 'met', 'unverified'], ['pj-2', 'lead', null, null]]);
  });

  test('时间线包含本人参与项目的项目事件，不含别的项目', async () => {
    await passMs11(); // 林夏提交、周颖评审：事件所属项目 pj-1，许诺是参与者
    const { projectId } = await run<{ projectId: string }>(lin, 'C01', { name: '只有林夏的项目', goal: 'g', acceptanceCriteria: 'a', leadTraineeId: 'u-lin' });
    const xuLine = await view(xu, 'people/u-xu/timeline');
    const types = xuLine.filter((e: Any) => e.projectId === 'pj-1').map((e: Any) => e.type);
    for (const t of ['C06', 'C07', 'C08', 'C02']) assert.ok(types.includes(t), `许诺的时间线应有 pj-1 的 ${t}`);
    assert.ok(!xuLine.some((e: Any) => e.projectId === projectId));
    assert.equal(xuLine.find((e: Any) => e.type === 'C08').label, '评审');
    assert.ok((await view(lin, 'people/u-lin/timeline')).some((e: Any) => e.projectId === projectId));
  });
});

describe('查询都经过统一授权入口', () => {
  test('管培生只能看自己的数据和自己参与的项目', async () => {
    await denied(() => view(lin, 'people/u-xu'), 403, /只能查看自己的数据/);
    await denied(() => view(lin, 'people/u-xu/timeline'), 403, /只能查看自己的数据/);
    await denied(() => view(lin, 'path/u-xu'), 403, /只能查看自己的数据/);
    await denied(() => view(lin, 'tasks/k-xu-6'), 403, /只能查看自己的数据/);
    await denied(() => view(lin, 'projects/pj-2'), 403, /只能查看自己的数据/);
    await denied(() => view(lin, 'milestones/ms-2-1'), 403, /只能查看自己的数据/);
    await denied(() => view(zhou, 'projects/pj-x'), 404, /没有这个项目/);
    await denied(() => view(zhou, 'people/u-zhou'), 404, /没有这个管培生/);
    await denied(() => view(zhou, 'nothing'), 404, /没有这个查询/);
  });

  test('HTTP：GET /api/views/…；没登录 401；非演示模式 401；只支持 GET', async () => {
    const get = async (route: string, userId?: string, demo = true, method = 'GET') => {
      const server = createApp(pool, { demo });
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as AddressInfo;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/views/${route}`, { method, headers: userId ? { cookie: `${DEMO_COOKIE}=${userId}` } : {} });
        return { status: res.status, body: (await res.json()) as Any };
      } finally {
        server.close();
      }
    };
    const ok = await get('projects', 'u-lin');
    assert.equal(ok.status, 200);
    assert.deepEqual(pick(ok.body.result, 'id'), ['pj-1']);
    assert.equal((await get('people/u-xu', 'u-lin')).status, 403);
    assert.equal((await get('projects')).status, 401);
    assert.equal((await get('projects', 'u-zhou', false)).status, 401);
    assert.equal((await get('projects', 'u-zhou', true, 'POST')).status, 405);
    assert.equal((await get('nothing', 'u-zhou')).status, 404);
  });
});
