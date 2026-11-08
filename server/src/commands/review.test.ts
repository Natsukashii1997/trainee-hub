// 成果、评审、下一步行动、认定命令的测试（issue #38）：C06–C09；骨架验收第 1、2、3 项；PRD 4.5 前置条件的反例。
// 连真测试库，和其他后端测试用同一把测试锁；每个 test 前用初始化脚本重置示例数据。
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, test } from 'node:test';
import type pg from 'pg';
import { createApp } from '../app.ts';
import type { Actor, CommandId } from '../authorize.ts';
import { createPool } from '../db.ts';
import { DEMO_COOKIE } from '../demo.ts';
import { resetDemo } from '../seed.ts';
import { checkConnectedTestDb, checkTestUrl } from '../testdb.ts';
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

// 示例数据里的人（seed.ts）：林夏、许诺是管培生；周颖是两人的默认带教，有管理权限；吴桐（u-wu）是许诺销售站和 pj-2 的带教
const lin: Actor = { id: 'u-lin', name: '林夏', role: 'trainee', isAdmin: false };
const xu: Actor = { id: 'u-xu', name: '许诺', role: 'trainee', isAdmin: false };
const zhou: Actor = { id: 'u-zhou', name: '周颖', role: 'mentor', isAdmin: true };

/** 北京时间的今天（带教关系按这天判断是否生效） */
const TODAY = "(now() at time zone 'Asia/Shanghai')::date";

const run = <T = Record<string, unknown>>(actor: Actor | null, command: CommandId, input: Record<string, unknown>) => runCommand(pool, actor, command, input) as Promise<T>;
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0] as T;
const count = async (sql: string, params: unknown[] = []) => Number((await one<{ n: string }>(sql, params)).n);
const events = () => count("select count(*) as n from event_log where source = 'web'");
const status = async (table: 'milestone' | 'task_instance', id: string) => (await one<{ status: string }>(`select status from ${table} where id = $1`, [id])).status;

/** 失败时：抛出指定状态码的 CommandError，状态不变，不写事件。传函数而不是 Promise：先数完事件再执行 */
async function rejects(fn: () => Promise<unknown>, code: number, message: RegExp) {
  const before = await events();
  await assert.rejects(fn(), (e: unknown) => e instanceof CommandError && e.status === code && message.test(e.message));
  assert.equal(await events(), before, '失败的命令不应写事件');
}

type Sub = { submissionId: string; version: number; reviewerId: string; closedActionIds?: string[] };
type Rev = { reviewId: string; status: string; actionIds: string[] };
const submit = (actor: Actor, target: Record<string, string>) => run<Sub>(actor, 'C06', { ...target, url: 'https://feishu.cn/docx/v1' });
const revise = { kind: 'revise', content: '补齐样本出处' };

/** 在 pj-2 里建一个推进中的新节点（pj-2 默认草拟，先确认立项） */
async function pj2Milestone(name: string) {
  if ((await one<{ status: string }>("select status from project where id = 'pj-2'")).status === 'draft') await run(zhou, 'C02', { projectId: 'pj-2' });
  return (await run<{ milestoneId: string }>(zhou, 'C03', { projectId: 'pj-2', name, acceptanceCriteria: '标准', dueAt: '2026-12-31T18:00:00+08:00' })).milestoneId;
}

describe('骨架验收第 1、2 项：项目与成果闭环、成果复用（走 HTTP 接口）', () => {
  test('提交 V1 → 需改进（含修改再交）→ V2（行动自动完成）→ 通过并逐条认定 → 处理推进行动', async () => {
    // 节点 ms-1-1 关联林夏、许诺各自的任务；再关联一条林夏的任务 k-lin-4，用来验证「没被勾选的任务不变」
    await pool.query("update task_instance set in_project = true, project_id = 'pj-1' where id = 'k-lin-4'");
    await pool.query("insert into milestone_task (milestone_id, task_id) values ('ms-1-1', 'k-lin-4')");
    const before = { linTask: await status('task_instance', 'k-lin-4') };

    const server = createApp(pool, { demo: true });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const post = async <T>(command: CommandId, userId: string, body: unknown) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/commands/${command}`, {
        method: 'POST', headers: { 'content-type': 'application/json', cookie: `${DEMO_COOKIE}=${userId}` }, body: JSON.stringify(body),
      });
      const json = (await res.json()) as { result: T; error?: string };
      assert.equal(res.status, 200, `${command}：${json.error}`);
      return json.result;
    };
    try {
      // 1. 林夏（主责）提交 V1：节点待评审；评审负责人 = 林夏的默认带教周颖（pj-1 没有项目范围带教）
      const v1 = await post<Sub>('C06', 'u-lin', { milestoneId: 'ms-1-1', url: 'https://feishu.cn/docx/v1', note: '初稿' });
      assert.deepEqual([v1.version, v1.reviewerId], [1, 'u-zhou']);
      assert.equal(await status('milestone', 'ms-1-1'), 'submitted');
      assert.deepEqual(await one('select review_state, submitter_id from submission where id = $1', [v1.submissionId]), { review_state: 'pending', submitter_id: 'u-lin' });

      // 2. 周颖评需改进：节点需修改；「修改再交」负责人默认 = 提交人；建议不指定负责人
      const r1 = await post<Rev>('C08', 'u-zhou', { submissionId: v1.submissionId, grade: '需改进', keyIssue: '口径未定', judgment: '还缺样本', actions: [revise, { kind: 'suggest', content: '可以参考上一期的分类' }] });
      assert.equal(r1.status, 'revise');
      assert.equal(await status('milestone', 'ms-1-1'), 'revise');
      assert.equal((await one<{ review_state: string }>('select review_state from submission where id = $1', [v1.submissionId])).review_state, 'reviewed');
      assert.deepEqual((await pool.query('select kind, owner_id, status from next_action where review_id = $1 order by kind', [r1.reviewId])).rows,
        [{ kind: 'revise', owner_id: 'u-lin', status: 'open' }, { kind: 'suggest', owner_id: null, status: 'open' }]);
      assert.equal((await one<{ level: string }>('select level from review where id = $1', [r1.reviewId])).level, 'deep'); // 节点成果默认深反馈

      // 3. 林夏修改再交 V2：节点待评审；上一版评审下的「修改再交」行动自动完成，依据 = V2；建议不受影响
      const v2 = await post<Sub>('C07', 'u-lin', { prevReviewId: r1.reviewId, url: 'https://feishu.cn/docx/v2', changeNote: '补了样本出处' });
      assert.equal(v2.version, 2);
      assert.equal(await status('milestone', 'ms-1-1'), 'submitted');
      assert.equal((await one<{ prev_review_id: string }>('select prev_review_id from submission where id = $1', [v2.submissionId])).prev_review_id, r1.reviewId);
      assert.deepEqual(await one("select status, done_submission_id from next_action where review_id = $1 and kind = 'revise'", [r1.reviewId]), { status: 'done', done_submission_id: v2.submissionId });
      assert.equal((await one<{ status: string }>("select status from next_action where review_id = $1 and kind = 'suggest'", [r1.reviewId])).status, 'open');
      assert.deepEqual(v2.closedActionIds?.length, 1);

      // 4. 周颖评达标：节点已通过；逐条认定两位的任务，各一条认定记录并变为已通过；k-lin-4 没被勾选，不变
      const r2 = await post<Rev>('C08', 'u-zhou', {
        submissionId: v2.submissionId, grade: '达标', creditTaskIds: ['k-lin-3', 'k-xu-3'],
        actions: [{ kind: 'advance', content: '进入分流方案验证', targetMilestoneId: 'ms-1-2' }],
      });
      assert.equal(r2.status, 'passed');
      assert.equal(await status('milestone', 'ms-1-1'), 'passed');
      assert.deepEqual((await pool.query("select task_id, status, credited_by from submission_credit where submission_id = $1 order by task_id", [v2.submissionId])).rows,
        [{ task_id: 'k-lin-3', status: 'credited', credited_by: 'u-zhou' }, { task_id: 'k-xu-3', status: 'credited', credited_by: 'u-zhou' }]);
      assert.equal(await status('task_instance', 'k-lin-3'), 'passed');
      assert.equal(await status('task_instance', 'k-xu-3'), 'passed');
      assert.equal(await status('task_instance', 'k-lin-4'), before.linTask);
      assert.equal(await count('select count(*) as n from submission_credit where task_id = $1', ['k-lin-4']), 0);
      // 任何时候都只有这一份成果：两个版本都挂在节点上，任务上没有成果
      assert.equal(await count("select count(*) as n from submission where milestone_id = 'ms-1-1'"), 2);
      assert.equal(await count('select count(*) as n from submission where task_id is not null'), 0);

      // 5. 「推进后续节点」负责人默认 = 项目主责林夏；林夏处理完成
      const adv = await one<{ id: string; owner_id: string; target_milestone_id: string }>('select id, owner_id, target_milestone_id from next_action where review_id = $1', [r2.reviewId]);
      assert.deepEqual([adv.owner_id, adv.target_milestone_id], ['u-lin', 'ms-1-2']);
      await post('C09', 'u-lin', { actionId: adv.id, result: 'done', resolution: '已开始节点二' });
      assert.equal((await one<{ status: string }>('select status from next_action where id = $1', [adv.id])).status, 'done');

      // 每一步都写了事件，节点事件记所属项目
      const types = (await pool.query("select type, project_id from event_log where source = 'web' order by occurred_at, id")).rows;
      assert.deepEqual(types.map(x => x.type), ['C06', 'C08', 'C07', 'C08', 'C09']);
      assert.ok(types.every(x => x.project_id === 'pj-1'));
    } finally {
      server.close();
    }
  });

  test('培养任务自己的成果：评审负责人按站推出；通过后任务已通过，默认轻反馈', async () => {
    const v1 = await submit(lin, { taskId: 'k-lin-4' }); // 林夏客服站没有站带教 → 默认带教周颖
    assert.equal(v1.reviewerId, 'u-zhou');
    assert.equal(await status('task_instance', 'k-lin-4'), 'submitted');
    const r = await run<Rev>(zhou, 'C08', { submissionId: v1.submissionId, grade: '优秀', comment: '结构清楚' });
    assert.equal(r.status, 'passed');
    assert.equal(await status('task_instance', 'k-lin-4'), 'passed');
    assert.equal((await one<{ level: string }>('select level from review where id = $1', [r.reviewId])).level, 'light');
    assert.deepEqual(await one("select person_id, project_id from event_log where type = 'C08'"), { person_id: 'u-lin', project_id: null });
  });
});

describe('骨架验收第 3 项：评审负责人推导与快照', () => {
  test('节点成果：主责在该项目的带教 → 主责的默认带教 → 管理者', async () => {
    // pj-2 主责许诺，有项目范围带教吴桐（mt-4）
    assert.equal((await submit(xu, { milestoneId: await pj2Milestone('a') })).reviewerId, 'u-wu');
    // 项目带教关系结束 → 默认带教（先把许诺的默认带教换成吴桐，和管理者周颖区分开）
    await pool.query(`update mentorship set end_date = ${TODAY} - 1, start_date = ${TODAY} - 10 where id = 'mt-4'`);
    await pool.query("update mentorship set mentor_id = 'u-wu' where id = 'mt-2'");
    assert.equal((await submit(xu, { milestoneId: await pj2Milestone('b') })).reviewerId, 'u-wu');
    // 默认带教也没有 → 管理者周颖
    await pool.query("delete from mentorship where id = 'mt-2'");
    assert.equal((await submit(xu, { milestoneId: await pj2Milestone('c') })).reviewerId, 'u-zhou');
    // 参与者的带教关系不算：多人项目以主责为准（pj-1 主责林夏，许诺是参与者）
    await pool.query("insert into mentorship (mentor_id, trainee_id, scope, project_id, start_date) values ('u-wu', 'u-xu', 'project', 'pj-1', '2026-10-01')");
    assert.equal((await submit(xu, { milestoneId: 'ms-1-1' })).reviewerId, 'u-zhou');
  });

  test('培养任务成果：所属站的带教 → 默认带教 → 管理者', async () => {
    // 许诺销售站 s-xu-3 的站带教吴桐（mt-3）；k-xu-6 是该站的任务
    await pool.query(`update mentorship set start_date = ${TODAY} - 7, end_date = null where id = 'mt-3'`);
    assert.equal((await submit(xu, { taskId: 'k-xu-6' })).reviewerId, 'u-wu');
    // 站带教结束 → 默认带教（换成吴桐以便区分）→ 管理者
    await pool.query(`update mentorship set end_date = ${TODAY} - 1 where id = 'mt-3'`);
    await pool.query("update mentorship set mentor_id = 'u-wu' where id = 'mt-2'");
    assert.equal((await submit(xu, { taskId: 'k-xu-4' })).reviewerId, 'u-wu');
    await pool.query("delete from mentorship where id = 'mt-2'");
    assert.equal((await submit(xu, { taskId: 'k-xu-1' })).reviewerId, 'u-zhou');
  });

  test('提交后更换带教：已提交版本的快照不变，之后再交按新关系推出；换带教当天取开始日较晚的关系', async () => {
    const ms = await pj2Milestone('快照');
    const v1 = await submit(xu, { milestoneId: ms });
    assert.equal(v1.reviewerId, 'u-wu');
    // 换带教：吴桐的项目带教关系今天结束，周颖今天开始（同一天两条都生效）
    await pool.query(`update mentorship set end_date = ${TODAY} where id = 'mt-4'`);
    await pool.query(`insert into mentorship (mentor_id, trainee_id, scope, project_id, start_date) values ('u-zhou', 'u-xu', 'project', 'pj-2', ${TODAY})`);
    assert.equal((await one<{ reviewer_id: string }>('select reviewer_id from submission where id = $1', [v1.submissionId])).reviewer_id, 'u-wu');
    // 骨架期任一带教都能评审；评审记录记实际评审人，快照不变
    const r = await run<Rev>(zhou, 'C08', { submissionId: v1.submissionId, grade: '需改进', actions: [revise] });
    assert.equal((await one<{ reviewer_id: string }>('select reviewer_id from review where id = $1', [r.reviewId])).reviewer_id, 'u-zhou');
    const v2 = await run<Sub>(xu, 'C07', { prevReviewId: r.reviewId, url: 'https://feishu.cn/docx/v2', changeNote: '改了' });
    assert.equal(v2.reviewerId, 'u-zhou');
    assert.equal((await one<{ reviewer_id: string }>('select reviewer_id from submission where id = $1', [v1.submissionId])).reviewer_id, 'u-wu');
  });
});

describe('C06 提交成果：前置条件反例', () => {
  test('只能挂一个对象；项目要推进中；在项目中完成的任务不单独交；已提交的不能再用 C06；不是成员', async () => {
    await rejects(() => run(lin, 'C06', { url: 'x' }), 400, /只能挂一个/);
    await rejects(() => run(lin, 'C06', { milestoneId: 'ms-1-1', taskId: 'k-lin-4', url: 'x' }), 400, /只能挂一个/);
    await rejects(() => run(lin, 'C06', { milestoneId: 'ms-1-1' }), 400, /缺少「飞书链接」/);
    await rejects(() => submit(xu, { milestoneId: 'ms-2-1' }), 409, /只有推进中的项目/); // pj-2 草拟
    await rejects(() => submit(lin, { taskId: 'k-lin-3' }), 409, /在项目中完成/);
    await rejects(() => submit(lin, { milestoneId: 'ms-2-1' }), 403, /只能操作与自己相关的对象/);
    await rejects(() => submit(xu, { taskId: 'k-lin-4' }), 403, /只能操作与自己相关的对象/);
    await submit(lin, { milestoneId: 'ms-1-1' });
    await rejects(() => submit(lin, { milestoneId: 'ms-1-1' }), 409, /只有未开始或进行中/);
    await run(zhou, 'C13', { milestoneId: 'ms-1-2', reason: '不做了' });
    await rejects(() => submit(lin, { milestoneId: 'ms-1-2' }), 409, /已取消/);
    await rejects(() => submit(lin, { milestoneId: 'ms-x' }), 404, /没有这个关键节点/);
  });
});

describe('C07 修改再交：前置条件反例', () => {
  test('对象要是需修改；只能针对最新一版的评审；修改说明必填', async () => {
    const v1 = await submit(lin, { milestoneId: 'ms-1-1' });
    const r1 = await run<Rev>(zhou, 'C08', { submissionId: v1.submissionId, grade: '需改进', actions: [revise] });
    await rejects(() => run(lin, 'C07', { prevReviewId: r1.reviewId, url: 'x' }), 400, /缺少「修改说明」/);
    await rejects(() => run(lin, 'C07', { prevReviewId: 'rv-x', url: 'x', changeNote: 'y' }), 404, /没有这条评审/);
    const v2 = await run<Sub>(lin, 'C07', { prevReviewId: r1.reviewId, url: 'x', changeNote: '一改' });
    // V2 待评审：节点不是需修改
    await rejects(() => run(lin, 'C07', { prevReviewId: r1.reviewId, url: 'x', changeNote: '再改' }), 409, /只有需修改的对象/);
    await run(zhou, 'C08', { submissionId: v2.submissionId, grade: '需改进', actions: [revise] });
    // 节点需修改，但 r1 已不是最新一版的评审
    await rejects(() => run(lin, 'C07', { prevReviewId: r1.reviewId, url: 'x', changeNote: '再改' }), 409, /最新一版的评审/);
  });
});

describe('C08 评审：前置条件反例', () => {
  test('需改进必须有修改再交；修改再交只用在需改进；认定只在通过时、只认关联且未认定的任务；不能重复评审；管培生不能评审', async () => {
    const v1 = await submit(lin, { milestoneId: 'ms-1-1' });
    const id = v1.submissionId;
    await rejects(() => run(zhou, 'C08', { submissionId: id, grade: '一般' }), 400, /优秀、达标或需改进/);
    await rejects(() => run(zhou, 'C08', { submissionId: id, grade: '需改进', actions: [{ kind: 'suggest', content: '建议' }] }), 409, /至少要有一条「修改再交」/);
    await rejects(() => run(zhou, 'C08', { submissionId: id, grade: '达标', actions: [revise] }), 409, /只用在需改进/);
    await rejects(() => run(zhou, 'C08', { submissionId: id, grade: '需改进', actions: [revise], creditTaskIds: ['k-lin-3'] }), 409, /认定只能出现在通过/);
    await rejects(() => run(zhou, 'C08', { submissionId: id, grade: '达标', creditTaskIds: ['k-xu-5'] }), 409, /不能认定.*k-xu-5/); // 关联的是 ms-2-1
    await rejects(() => run(zhou, 'C08', { submissionId: id, grade: '达标', actions: [{ kind: 'advance', content: 'x', targetMilestoneId: 'ms-2-1' }] }), 400, /本项目的节点/);
    await rejects(() => run(zhou, 'C08', { submissionId: id, grade: '达标', actions: [{ kind: 'other', content: 'x' }] }), 400, /类型只能是/);
    await rejects(() => run(lin, 'C08', { submissionId: id, grade: '达标' }), 403, /管培生不能执行「评审」/);
    assert.equal(await status('milestone', 'ms-1-1'), 'submitted');
    assert.equal(await count('select count(*) as n from review'), 0);

    await run(zhou, 'C08', { submissionId: id, grade: '达标', creditTaskIds: ['k-lin-3'] });
    await rejects(() => run(zhou, 'C08', { submissionId: id, grade: '达标' }), 409, /已经评审过/);
    // 同一任务不能重复认定：k-lin-3 再关联到 pj-1 的新节点，通过时再认定被拒绝
    const ms = (await run<{ milestoneId: string }>(zhou, 'C03', { projectId: 'pj-1', name: '新节点', acceptanceCriteria: '标准', dueAt: '2026-12-31T18:00:00+08:00', taskIds: ['k-lin-3'] })).milestoneId;
    const v = await submit(lin, { milestoneId: ms });
    await rejects(() => run(zhou, 'C08', { submissionId: v.submissionId, grade: '优秀', creditTaskIds: ['k-lin-3'] }), 409, /已经认定过/);
    assert.equal(await count("select count(*) as n from submission_credit where task_id = 'k-lin-3'"), 1);
  });

  test('培养任务成果的评审不能认定其他任务', async () => {
    const v = await submit(lin, { taskId: 'k-lin-4' });
    await rejects(() => run(zhou, 'C08', { submissionId: v.submissionId, grade: '达标', creditTaskIds: ['k-lin-3'] }), 409, /只有节点成果的评审能认定/);
  });
});

describe('C09 处理下一步行动', () => {
  test('负责人处理；不再需要要写原因；处理过的不能再处理；别人的行动管培生不能处理', async () => {
    const v1 = await submit(lin, { milestoneId: 'ms-1-1' });
    const r = await run<Rev>(zhou, 'C08', { submissionId: v1.submissionId, grade: '需改进', actions: [revise, { kind: 'advance', content: '同步主管', ownerId: 'u-xu' }] });
    const [reviseId, advanceId] = r.actionIds;
    await rejects(() => run(lin, 'C09', { actionId: advanceId, result: 'done' }), 403, /只能操作与自己相关的对象/);
    await rejects(() => run(xu, 'C09', { actionId: advanceId, result: 'dropped' }), 400, /缺少「不再需要的原因」/);
    await rejects(() => run(xu, 'C09', { actionId: advanceId, result: 'later' }), 400, /已完成或不再需要/);
    await run(xu, 'C09', { actionId: advanceId, result: 'dropped', resolution: '主管已知道' });
    assert.deepEqual(await one('select status, resolution from next_action where id = $1', [advanceId]), { status: 'dropped', resolution: '主管已知道' });
    await rejects(() => run(zhou, 'C09', { actionId: advanceId, result: 'done' }), 409, /已经处理过/);
    // 带教也能处理；事件记负责人和所属项目
    await run(zhou, 'C09', { actionId: reviseId, result: 'done', resolution: '线下已改' });
    assert.deepEqual(await one("select person_id, project_id from event_log where type = 'C09' and subject_id = $1", [reviseId]), { person_id: 'u-lin', project_id: 'pj-1' });
  });
});
