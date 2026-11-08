// 项目结论与结项命令的测试（issue #40）：C14、C15、C19；骨架验收第 1 项（全程到能力证据，走 HTTP 接口）、第 5 项；PRD 4.5 前置条件的反例。
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

const run = <T = Record<string, unknown>>(actor: Actor | null, command: CommandId, input: Record<string, unknown>) => runCommand(pool, actor, command, input) as Promise<T>;
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0] as T;
const count = async (sql: string, params: unknown[] = []) => Number((await one<{ n: string }>(sql, params)).n);
const events = () => count("select count(*) as n from event_log where source = 'web'");

/** 失败时：抛出指定状态码的 CommandError，状态不变，不写事件。传函数而不是 Promise：先数完事件再执行 */
async function rejects(fn: () => Promise<unknown>, code: number, message: RegExp) {
  const before = await events();
  await assert.rejects(fn(), (e: unknown) => e instanceof CommandError && e.status === code && message.test(e.message));
  assert.equal(await events(), before, '失败的命令不应写事件');
}


const projectStatus = async (id: string) => one<{ status: string; end_type: string | null; abort_reason: string | null }>('select status, end_type, abort_reason from project where id = $1', [id]);
const conclude = (actor: Actor, projectId: string, extra: Record<string, unknown> = {}) => run(actor, 'C14', { projectId, delivery: 'met', lessons: '先对齐口径再取数', ...extra });
const verified = { verificationStatus: 'verified', verificationResult: 'met', verificationSource: '业务负责人反馈', verificationConfirmer: '销售主管（示例）', verificationConfirmedAt: '2026-12-01T10:00:00+08:00' };

describe('骨架验收第 1 项：立项 → 节点 → 提交 → 需修改 → 再交 → 通过 → 结论 → 结项 → 能力证据（走 HTTP 接口）', () => {
  test('每一步的状态与 PRD 4.3 一致', async () => {
    const server = createApp(pool, { demo: true });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const post = async <T = Record<string, unknown>>(command: CommandId, userId: string, body: unknown) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/commands/${command}`, {
        method: 'POST', headers: { 'content-type': 'application/json', cookie: `${DEMO_COOKIE}=${userId}` }, body: JSON.stringify(body),
      });
      const json = (await res.json()) as { result: T; error?: string };
      assert.equal(res.status, 200, `${command}：${json.error}`);
      return json.result;
    };
    const ms = async (id: string) => (await one<{ status: string }>('select status from milestone where id = $1', [id])).status;
    try {
      const { projectId } = await post<{ projectId: string }>('C01', 'u-lin', { name: '工单回访提效', goal: '缩短回访周期', acceptanceCriteria: '回访周期缩短三成', leadTraineeId: 'u-lin' });
      assert.equal((await projectStatus(projectId)).status, 'draft');
      await post('C02', 'u-zhou', { projectId });
      assert.equal((await projectStatus(projectId)).status, 'active');
      const { milestoneId } = await post<{ milestoneId: string }>('C03', 'u-lin', { projectId, name: '现状测量', acceptanceCriteria: '有四周基线数据', dueAt: '2026-12-11T18:00:00+08:00' });
      assert.equal(await ms(milestoneId), 'todo');
      await post('C04', 'u-lin', { milestoneId });
      assert.equal(await ms(milestoneId), 'doing');
      const v1 = await post<{ submissionId: string }>('C06', 'u-lin', { milestoneId, url: 'https://feishu.cn/docx/a1' });
      assert.equal(await ms(milestoneId), 'submitted');
      const r1 = await post<{ reviewId: string }>('C08', 'u-zhou', { submissionId: v1.submissionId, grade: '需改进', keyIssue: '基线只有两周', judgment: '不够判断', actions: [{ kind: 'revise', content: '补齐四周数据' }] });
      assert.equal(await ms(milestoneId), 'revise');
      const v2 = await post<{ submissionId: string; closedActionIds: string[] }>('C07', 'u-lin', { prevReviewId: r1.reviewId, url: 'https://feishu.cn/docx/a2', changeNote: '补齐四周' });
      assert.equal(await ms(milestoneId), 'submitted');
      assert.equal(v2.closedActionIds.length, 1);
      assert.equal(await count("select count(*) as n from next_action where review_id = $1 and status = 'open'", [r1.reviewId]), 0);
      await post('C08', 'u-zhou', { submissionId: v2.submissionId, grade: '优秀' });
      assert.equal(await ms(milestoneId), 'passed');
      await post('C14', 'u-lin', { projectId, delivery: 'met', deliveryEvidence: [v2.submissionId], lessons: '基线先于方案' });
      assert.equal((await projectStatus(projectId)).status, 'active'); // 填结论不改项目状态
      const closed = await post<{ status: string; openMilestones: unknown[] }>('C15', 'u-zhou', { projectId, endType: 'done' });
      assert.deepEqual([closed.status, closed.openMilestones], ['ended', []]);
      assert.deepEqual(await projectStatus(projectId), { status: 'ended', end_type: 'done', abort_reason: null });
      assert.deepEqual(await one('select delivery, delivery_evidence, verification_status from project_conclusion where project_id = $1', [projectId]),
        { delivery: 'met', delivery_evidence: [v2.submissionId], verification_status: 'unverified' });
      // 从通过的版本为林夏提炼一条能力证据，能点回来源节点和版本
      const { evidenceId } = await post<{ evidenceId: string }>('C16', 'u-zhou', { traineeId: 'u-lin', itemId: 'ci-3', sourceType: 'submission', sourceId: v2.submissionId, summary: '补齐四周基线后再定方案', judgment: 'guided' });
      assert.deepEqual(await one('select s.milestone_id, s.version from competency_evidence e join submission s on s.id = e.source_id where e.id = $1', [evidenceId]), { milestone_id: milestoneId, version: 2 });
      const types = (await pool.query("select type from event_log where source = 'web' order by occurred_at, id")).rows.map(x => x.type);
      assert.deepEqual(types, ['C01', 'C02', 'C03', 'C04', 'C06', 'C08', 'C07', 'C08', 'C14', 'C15', 'C16']);
    } finally {
      server.close();
    }
  });
});

describe('骨架验收第 5 项：交付达成、业务未验证 → 结项后补记为已验证', () => {
  test('两次的值和补记人都可查；结项时列出未结的节点', async () => {
    await run(zhou, 'C02', { projectId: 'pj-2' });
    await conclude(xu, 'pj-2'); // 不传验证状态 → 未验证
    const closed = await run<{ openMilestones: { id: string; status: string }[] }>(zhou, 'C15', { projectId: 'pj-2', endType: 'done' });
    assert.deepEqual(closed.openMilestones.map(x => [x.id, x.status]), [['ms-2-1', 'todo']]);
    assert.deepEqual(await one("select delivery, verification_status, written_by from project_conclusion where project_id = 'pj-2'"), { delivery: 'met', verification_status: 'unverified', written_by: 'u-xu' });

    // 结项后许诺补记业务验证
    await run(xu, 'C19', { projectId: 'pj-2', ...verified });
    const c = await one<Record<string, unknown>>("select delivery, verification_status, verification_result, verification_source, verification_confirmer, verification_updated_by, verification_updated_at from project_conclusion where project_id = 'pj-2'");
    assert.deepEqual({ ...c, verification_updated_at: Boolean(c.verification_updated_at) }, {
      delivery: 'met', verification_status: 'verified', verification_result: 'met', verification_source: '业务负责人反馈',
      verification_confirmer: '销售主管（示例）', verification_updated_by: 'u-xu', verification_updated_at: true,
    });
    // 两次的值都在事件日志里：结项时的未验证，补记时的改前、改后与补记人
    const c14 = await one<{ payload: { verification: { status: string } } }>("select payload from event_log where type = 'C14' and project_id = 'pj-2'");
    assert.equal(c14.payload.verification.status, 'unverified');
    const c19 = await one<{ actor_id: string; payload: { from: { status: string }; to: { status: string; result: string } } }>("select actor_id, payload from event_log where type = 'C19'");
    assert.deepEqual([c19.actor_id, c19.payload.from.status, c19.payload.to.status, c19.payload.to.result], ['u-xu', 'unverified', 'verified', 'met']);
    // 带教也能补记
    await run(zhou, 'C19', { projectId: 'pj-2', verificationStatus: 'na' });
    assert.equal((await one<{ verification_updated_by: string }>("select verification_updated_by from project_conclusion where project_id = 'pj-2'")).verification_updated_by, 'u-zhou');
  });

  test('再次保存结论时不传验证状态，保留已补记的业务验证', async () => {
    await conclude(lin, 'pj-1');
    await run(zhou, 'C19', { projectId: 'pj-1', ...verified });
    await conclude(lin, 'pj-1', { delivery: 'partial' });
    assert.deepEqual(await one("select delivery, verification_status from project_conclusion where project_id = 'pj-1'"), { delivery: 'partial', verification_status: 'verified' });
    await conclude(lin, 'pj-1', { verificationStatus: 'na' });
    assert.equal((await one<{ verification_status: string }>("select verification_status from project_conclusion where project_id = 'pj-1'")).verification_status, 'na');
  });
});

describe('前置条件与输入反例', () => {
  test('C15：完成要已有结论且推进中；中止要写原因，草拟也能中止；已结束不能再结', async () => {
    await rejects(() => run(zhou, 'C15', { projectId: 'pj-1', endType: 'done' }), 409, /先填写项目结论/);
    await rejects(() => run(zhou, 'C15', { projectId: 'pj-1', endType: 'aborted' }), 400, /缺少「中止原因」/);
    await rejects(() => run(zhou, 'C15', { projectId: 'pj-1', endType: 'paused' }), 400, /结束类型/);
    await rejects(() => run(lin, 'C15', { projectId: 'pj-1', endType: 'aborted', abortReason: 'x' }), 403, /管培生不能执行「确认结项」/);
    await conclude(xu, 'pj-2');
    await rejects(() => run(zhou, 'C15', { projectId: 'pj-2', endType: 'done' }), 409, /只有推进中的项目能完成结项/);
    await run(zhou, 'C15', { projectId: 'pj-2', endType: 'aborted', abortReason: '业务方取消' });
    assert.deepEqual(await projectStatus('pj-2'), { status: 'ended', end_type: 'aborted', abort_reason: '业务方取消' });
    await rejects(() => run(zhou, 'C15', { projectId: 'pj-2', endType: 'aborted', abortReason: '再来' }), 409, /已经结束/);
    await rejects(() => run(zhou, 'C15', { projectId: 'pj-2', endType: 'done' }), 409, /只有推进中/);
    await rejects(() => run(zhou, 'C15', { projectId: 'pj-x', endType: 'done' }), 404, /没有这个项目/);
  });

  test('C14：只有主责（和带教）能填；交付证据只能是本项目的成果；取值校验；结项后不能再改结论', async () => {
    await rejects(() => conclude(xu, 'pj-1'), 403, /只能操作与自己相关的对象/); // 许诺只是 pj-1 的参与者
    await rejects(() => conclude(lin, 'pj-1', { delivery: 'good' }), 400, /交付结论/);
    await rejects(() => conclude(lin, 'pj-1', { verificationStatus: 'verified' }), 400, /要填验证结论/);
    await rejects(() => conclude(lin, 'pj-1', { verificationStatus: 'unverified', verificationResult: 'met' }), 400, /只有已验证时/);
    await run(zhou, 'C02', { projectId: 'pj-2' });
    const other = await run<{ submissionId: string }>(xu, 'C06', { milestoneId: 'ms-2-1', url: 'https://feishu.cn/docx/x' });
    await rejects(() => conclude(lin, 'pj-1', { deliveryEvidence: [other.submissionId] }), 400, /本项目节点的成果/);
    await conclude(zhou, 'pj-1');
    await run(zhou, 'C15', { projectId: 'pj-1', endType: 'done' });
    await rejects(() => conclude(lin, 'pj-1'), 409, /项目已结束/);
  });

  test('C19：要已有结论；只有主责（和带教）能补记；验证结论与状态要对得上', async () => {
    await rejects(() => run(lin, 'C19', { projectId: 'pj-1', ...verified }), 409, /还没有项目结论/);
    await conclude(lin, 'pj-1');
    await rejects(() => run(xu, 'C19', { projectId: 'pj-1', ...verified }), 403, /只能操作与自己相关的对象/);
    await rejects(() => run(lin, 'C19', { projectId: 'pj-1' }), 400, /缺少「验证状态」/);
    await rejects(() => run(lin, 'C19', { projectId: 'pj-1', ...verified, verificationResult: undefined }), 400, /要填验证结论/);
    await rejects(() => run(lin, 'C19', { projectId: 'pj-1', ...verified, verificationConfirmedAt: '2026-12-01' }), 400, /带时区的时间/);
  });
});
