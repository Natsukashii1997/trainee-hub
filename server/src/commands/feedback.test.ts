// 反馈条目与验证的测试（PRD v3.0 总纲 6.2、7.1–7.3；issue #45）：C08 分条写反馈、评审时顺手验证、C40 单独验证；
// 前置条件的反例；里程碑详情里的反馈只给本人和带教看；演示故事。
// 连真测试库，和其他后端测试用同一把测试锁；每个 test 前用初始化脚本重置示例数据。
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type pg from 'pg';
import type { Actor, CommandId } from '../authorize.ts';
import { createPool } from '../db.ts';
import { resetDemo, seedStory } from '../seed.ts';
import { checkConnectedTestDb, checkTestUrl } from '../testdb.ts';
import { runView } from '../views/index.ts';
import { CommandError, runCommand } from './index.ts';

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

// 示例数据（seed.ts）：林夏、许诺是 pj-1 的成员；周颖是两人的默认带教
const lin: Actor = { id: 'u-lin', name: '林夏', role: 'trainee', isAdmin: false };
const xu: Actor = { id: 'u-xu', name: '许诺', role: 'trainee', isAdmin: false };
const zhou: Actor = { id: 'u-zhou', name: '周颖', role: 'mentor', isAdmin: true };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const run = <T = Any>(actor: Actor, command: CommandId, input: Record<string, unknown>) => runCommand(pool, actor, command, input) as Promise<T>;
const view = (actor: Actor, route: string) => runView(pool, actor, route) as Promise<Any>;
const rows = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;
const events = async () => Number((await rows("select count(*) as n from event_log where source = 'web'"))[0].n);

async function rejects(fn: () => Promise<unknown>, code: number, message: RegExp) {
  const before = await events();
  await assert.rejects(fn(), (e: unknown) => e instanceof CommandError && e.status === code && message.test(e.message));
  assert.equal(await events(), before, '失败的命令不应写事件');
}

const revise = { kind: 'revise', content: '按反馈改完再交' };
const FB = [
  { content: '分类口径没有依据', tags: ['分类口径'], nature: 'standard', verifyNext: true },
  { content: '只有一个班组的数据', tags: ['证据来源', '样本'], verifyNext: true },
  { content: '没写不处理什么', needsAction: true },
  { content: '录音抽查做得好' },
];

/** 林夏交 V1，周颖评需改进并分条写反馈；返回各编号 */
async function firstRound(feedback: Record<string, unknown>[] = FB) {
  const v1 = await run(lin, 'C06', { milestoneId: 'ms-1-1', url: 'https://feishu.cn/docx/v1' });
  const r1 = await run(zhou, 'C08', { submissionId: v1.submissionId, grade: '需改进', actions: [revise], feedback });
  return { v1: v1.submissionId as string, r1: r1.reviewId as string, fb: r1.feedbackIds as string[] };
}
const resubmit = async (prevReviewId: string, n: number) =>
  (await run(lin, 'C07', { prevReviewId, url: `https://feishu.cn/docx/v${n}`, changeNote: `第 ${n} 版的修改` })).submissionId as string;

describe('C08 评审时分条写反馈', () => {
  test('反馈条目挂在评审和成果版本上，属于提交人；标签、性质、需要行动、下次验证都记下；结论与下一步行动照旧', async () => {
    const f = await firstRound();
    assert.equal(f.fb.length, 4);
    const byContent = Object.fromEntries((await rows('select content, tags, nature, needs_action, verify_next from feedback_item')).map(r => [r.content, r]));
    assert.deepEqual(byContent['分类口径没有依据'], { content: '分类口径没有依据', tags: ['分类口径'], nature: 'standard', needs_action: false, verify_next: true });
    assert.deepEqual(byContent['只有一个班组的数据'].tags, ['证据来源', '样本']);
    assert.equal(byContent['没写不处理什么'].needs_action, true);
    assert.equal(byContent['录音抽查做得好'].verify_next, false);
    assert.deepEqual((await rows('select trainee_id, source, review_id, submission_id, milestone_id, created_by from feedback_item group by 1, 2, 3, 4, 5, 6')),
      [{ trainee_id: 'u-lin', source: 'review', review_id: f.r1, submission_id: f.v1, milestone_id: 'ms-1-1', created_by: 'u-zhou' }]);
    assert.equal((await rows("select status from milestone where id = 'ms-1-1'"))[0].status, 'revise');
    assert.deepEqual((await rows("select payload->'feedbackIds' as ids from event_log where type = 'C08'"))[0].ids, f.fb);
  });

  test('不写反馈也能评审（0 条）', async () => {
    const f = await firstRound([]);
    assert.deepEqual(f.fb, []);
    assert.equal((await rows('select count(*)::int as n from feedback_item'))[0].n, 0);
  });

  test('输入不对：标签超过两个、性质不在三种之内、内容为空，都不写', async () => {
    const v1 = await run(lin, 'C06', { milestoneId: 'ms-1-1', url: 'https://feishu.cn/docx/v1' });
    const review = (feedback: unknown) => () => run(zhou, 'C08', { submissionId: v1.submissionId, grade: '需改进', actions: [revise], feedback });
    await rejects(review([{ content: '一', tags: ['a', 'b', 'c'] }]), 400, /最多写两个标签/);
    await rejects(review([{ content: '一', nature: '随便' }]), 400, /性质只能是/);
    await rejects(review([{ content: ' ' }]), 400, /第 1 条反馈的内容/);
    await rejects(review([{ content: '一', verifyNext: '是' }]), 400, /应为是或否/);
    assert.equal((await rows('select count(*)::int as n from review'))[0].n, 0);
  });
});

describe('验证反馈（C08 顺手验证、C40 单独验证）', () => {
  test('评审第 2 版时逐条验证：已改善的不再待验证，仍存在的留着；验证记下成果版本、验证人、时间，各写一条 C40 事件', async () => {
    const f = await firstRound();
    const v2 = await resubmit(f.r1, 2);
    const r2 = await run(zhou, 'C08', {
      submissionId: v2, grade: '需改进', actions: [revise],
      verifications: [{ feedbackId: f.fb[0], result: 'improved' }, { feedbackId: f.fb[1], result: 'persisting' }],
      feedback: [{ content: '第二版新发现的问题', verifyNext: true }],
    });
    assert.deepEqual(r2.verifiedFeedbackIds, [f.fb[0], f.fb[1]]);
    assert.deepEqual(await rows('select feedback_id, submission_id, result, verified_by from feedback_verification order by result'),
      [{ feedback_id: f.fb[0], submission_id: v2, result: 'improved', verified_by: 'u-zhou' }, { feedback_id: f.fb[1], submission_id: v2, result: 'persisting', verified_by: 'u-zhou' }]);
    assert.deepEqual((await rows("select subject_id, person_id, payload->>'result' as result from event_log where type = 'C40' order by 3")),
      [{ subject_id: f.fb[0], person_id: 'u-lin', result: 'improved' }, { subject_id: f.fb[1], person_id: 'u-lin', result: 'persisting' }]);

    // 待验证 = 「仍存在」的那条 + 第 2 版新写的那条；已改善的那条不再出现
    const m = await view(zhou, 'milestones/ms-1-1');
    assert.deepEqual(m.pendingFeedback.map((x: Any) => x.content), ['只有一个班组的数据', '第二版新发现的问题']);
    assert.deepEqual(m.pendingFeedback[0].verifications.map((v: Any) => [v.result, v.version]), [['persisting', 2]]);

    // 第 3 版上用 C40 单独验证：仍存在的那条改好了
    const v3 = await resubmit(r2.reviewId, 3);
    const before = await events();
    await run(zhou, 'C40', { feedbackId: f.fb[1], submissionId: v3, result: 'improved' });
    assert.equal(await events(), before + 1);
    const m3 = await view(zhou, 'milestones/ms-1-1');
    assert.deepEqual(m3.pendingFeedback.map((x: Any) => x.content), ['第二版新发现的问题']);
    // 证据链：从验证记录能点回反馈、它来自哪次评审的哪一版成果
    const chain = m3.submissions[0].review.feedback.find((x: Any) => x.id === f.fb[1]);
    assert.deepEqual([chain.version, chain.milestoneId, chain.verifications.map((v: Any) => [v.version, v.result])], [1, 'ms-1-1', [[2, 'persisting'], [3, 'improved']]]);
    assert.deepEqual(m3.submissions[2].verifications.map((v: Any) => [v.feedbackId, v.result]), [[f.fb[1], 'improved']]);
  });

  test('「这次没涉及」之后仍待验证', async () => {
    const f = await firstRound();
    const v2 = await resubmit(f.r1, 2);
    await run(zhou, 'C40', { feedbackId: f.fb[0], submissionId: v2, result: 'not_covered' });
    assert.ok((await view(zhou, 'milestones/ms-1-1')).pendingFeedback.some((x: Any) => x.id === f.fb[0]));
  });

  test('前置条件不满足时什么都不写：同一版上写的反馈、没标下次验证、已改善、同一版验证两次、和这个人无关的成果', async () => {
    const f = await firstRound();
    await rejects(() => run(zhou, 'C40', { feedbackId: f.fb[0], submissionId: f.v1, result: 'improved' }), 409, /之后提交的成果上验证/);
    const v2 = await resubmit(f.r1, 2);
    await rejects(() => run(zhou, 'C40', { feedbackId: f.fb[2], submissionId: v2, result: 'improved' }), 409, /没有标「下次验证」/);
    await run(zhou, 'C40', { feedbackId: f.fb[1], submissionId: v2, result: 'persisting' });
    await rejects(() => run(zhou, 'C40', { feedbackId: f.fb[1], submissionId: v2, result: 'improved' }), 409, /这一版成果上已经验证过/);
    await rejects(() => run(zhou, 'C08', { submissionId: v2, grade: '达标', verifications: [{ feedbackId: f.fb[1], result: 'improved' }] }), 409, /这一版成果上已经验证过/);
    await run(zhou, 'C40', { feedbackId: f.fb[0], submissionId: v2, result: 'improved' });
    // 许诺在 pj-2 自己的里程碑上交的成果，和林夏的反馈无关
    await run(zhou, 'C02', { projectId: 'pj-2' });
    const xuSub = await run(xu, 'C06', { milestoneId: 'ms-2-1', url: 'https://feishu.cn/docx/x' });
    await rejects(() => run(zhou, 'C40', { feedbackId: f.fb[1], submissionId: xuSub.submissionId, result: 'improved' }), 409, /无关/);
    await rejects(() => run(zhou, 'C40', { feedbackId: 'nope', submissionId: v2, result: 'improved' }), 404, /没有这条反馈/);
    await rejects(() => run(zhou, 'C40', { feedbackId: f.fb[1], submissionId: v2, result: '好了' }), 400, /验证结果只能是/);
    await rejects(() => run(zhou, 'C08', { submissionId: v2, grade: '达标', verifications: [{ feedbackId: f.fb[1], result: 'improved' }, { feedbackId: f.fb[1], result: 'persisting' }] }), 400, /只能给一个验证结果/);
  });

  test('只有带教能验证', async () => {
    const f = await firstRound();
    const v2 = await resubmit(f.r1, 2);
    await rejects(() => run(lin, 'C40', { feedbackId: f.fb[0], submissionId: v2, result: 'improved' }), 403, /管培生不能执行「验证反馈」/);
  });
});

describe('里程碑详情里的反馈（第 1 页）', () => {
  test('任务标准五件事都在；反馈和验证只给本人和带教看，同项目的另一位成员看不到', async () => {
    const f = await firstRound();
    await resubmit(f.r1, 2);
    const asLin = await view(lin, 'milestones/ms-1-1');
    assert.equal(asLin.commonMistakes.split('\n').length, 3);
    assert.ok(asLin.escalation.length > 0);
    assert.equal(asLin.sampleLinks[0].url, 'https://example.feishu.cn/docx/sample-refund');
    assert.deepEqual([asLin.goal.length > 0, asLin.acceptanceCriteria.length > 0, asLin.createdByName], [true, true, '林夏']);
    assert.equal(asLin.submissions[0].review.feedback.length, 4);
    assert.equal(asLin.pendingFeedback.length, 2);

    const asXu = await view(xu, 'milestones/ms-1-1');
    assert.equal(asXu.submissions[0].review.grade, '需改进'); // 评审结论项目成员都看得到（v2.1 不变）
    assert.deepEqual([asXu.submissions[0].review.feedback, asXu.pendingFeedback, asXu.verbalFeedback], [[], [], []]);

    assert.equal((await view(zhou, 'milestones/ms-1-1')).pendingFeedback.length, 2);
  });

  test('演示故事：第 2 版等周颖评审，上次有 3 条约好验证（2 条评审里的 + 1 条口头的）', async () => {
    await seedStory(pool);
    const m = await view(zhou, 'milestones/ms-1-1');
    assert.equal(m.status, 'submitted');
    assert.deepEqual(m.submissions.map((s: Any) => [s.version, s.reviewState]), [[1, 'reviewed'], [2, 'pending']]);
    assert.equal(m.submissions[0].review.feedback.length, 4);
    assert.deepEqual(m.verbalFeedback.map((x: Any) => [x.source, x.verifyNext]), [['verbal', true]]);
    assert.equal(m.pendingFeedback.length, 3);
    assert.deepEqual(m.verifiableFeedbackIds, m.pendingFeedback.map((x: Any) => x.id)); // 三条都在第 2 版提交之前
    assert.deepEqual(m.submissions[0].review.feedback.map((x: Any) => x.content.slice(0, 4)), ['分类口径', '三类问题', '没有写这', '抽样听录']); // 按写的顺序
    assert.equal(m.mentor.id, 'u-zhou');
    // 周颖评第 2 版时三条都能验证
    await run(zhou, 'C08', { submissionId: m.submissions[1].id, grade: '达标', verifications: m.pendingFeedback.map((x: Any) => ({ feedbackId: x.id, result: 'improved' })) });
    assert.deepEqual((await view(lin, 'milestones/ms-1-1')).pendingFeedback, []);
  });
});
