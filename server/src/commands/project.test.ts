// 项目与节点命令的测试（issue #37）：C01–C05、C13 的状态变化、事件日志、PRD 4.5 前置条件的反例。
// 连真测试库，和其他后端测试用同一把测试锁；每个 describe 前用初始化脚本重置示例数据。
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

// 示例数据里的人（seed.ts）
const lin: Actor = { id: 'u-lin', name: '林夏', role: 'trainee', isAdmin: false };
const xu: Actor = { id: 'u-xu', name: '许诺', role: 'trainee', isAdmin: false };
const zhou: Actor = { id: 'u-zhou', name: '周颖', role: 'mentor', isAdmin: true };

const run = (actor: Actor | null, command: CommandId, input: Record<string, unknown>) => runCommand(pool, actor, command, input);
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0] as T;
const events = async () => Number((await one<{ n: string }>("select count(*) as n from event_log where source = 'web'")).n);

/** 失败时：抛出指定状态码的 CommandError，状态不变，不写事件。传函数而不是 Promise：先数完事件再执行，免得命令先失败成了未处理的拒绝 */
async function rejects(fn: () => Promise<unknown>, status: number, message: RegExp) {
  const before = await events();
  await assert.rejects(fn(), (e: unknown) => e instanceof CommandError && e.status === status && message.test(e.message));
  assert.equal(await events(), before, '失败的命令不应写事件');
}

const newProject = { name: '新项目', goal: '目标', acceptanceCriteria: '验收条件', leadTraineeId: 'u-lin', memberTraineeIds: ['u-xu'], stationIds: ['s-lin-3'] };

describe('C01 创建项目', () => {
  test('管培生建项目：草拟，成员与关联站写入，事件记所属项目', async () => {
    const r = await run(lin, 'C01', newProject) as { projectId: string; status: string };
    assert.equal(r.status, 'draft');
    const members = (await pool.query('select trainee_id, role from project_member where project_id = $1 order by role, trainee_id', [r.projectId])).rows;
    assert.deepEqual(members, [{ trainee_id: 'u-lin', role: 'lead' }, { trainee_id: 'u-xu', role: 'member' }]);
    assert.equal(Number((await one<{ n: string }>('select count(*) as n from project_station where project_id = $1', [r.projectId])).n), 1);
    const e = await one<{ type: string; project_id: string; actor_id: string }>("select type, project_id, actor_id from event_log where source = 'web'");
    assert.deepEqual(e, { type: 'C01', project_id: r.projectId, actor_id: 'u-lin' });
  });

  test('带教建项目可同时确认：推进中，连带记 C02', async () => {
    const r = await run(zhou, 'C01', { ...newProject, confirm: true }) as { projectId: string; status: string };
    assert.equal(r.status, 'active');
    const types = (await pool.query("select type from event_log where source = 'web' order by occurred_at, type")).rows.map(x => x.type);
    assert.deepEqual(types, ['C01', 'C02']);
  });

  test('反例：管培生不能替别人建项目、不能直接确认；缺字段、成员不是管培生、站不属于成员', async () => {
    await rejects(() => run(lin, 'C01', { ...newProject, leadTraineeId: 'u-xu', memberTraineeIds: [], stationIds: ['s-xu-3'] }), 403, /只能操作与自己相关的对象/);
    await rejects(() => run(lin, 'C01', { ...newProject, confirm: true }), 403, /只有带教能/);
    await rejects(() => run(lin, 'C01', { ...newProject, goal: ' ' }), 400, /缺少「项目目标」/);
    await rejects(() => run(zhou, 'C01', { ...newProject, memberTraineeIds: ['u-wu'] }), 400, /不是在培的管培生/);
    await rejects(() => run(zhou, 'C01', { ...newProject, stationIds: ['s-xu-9'] }), 400, /关联站/);
    await rejects(() => run(null, 'C01', newProject), 401, /未登录/);
  });
});

describe('C02 确认立项', () => {
  test('带教确认草拟项目：推进中，记确认人', async () => {
    await run(zhou, 'C02', { projectId: 'pj-2' });
    assert.deepEqual(await one('select status, confirmed_by from project where id = $1', ['pj-2']), { status: 'active', confirmed_by: 'u-zhou' });
  });
  test('反例：管培生不能确认；已推进的不能再确认；项目不存在', async () => {
    await rejects(() => run(xu, 'C02', { projectId: 'pj-2' }), 403, /管培生不能执行「确认立项」/);
    await rejects(() => run(zhou, 'C02', { projectId: 'pj-1' }), 409, /只有草拟的项目能确认立项/);
    await rejects(() => run(zhou, 'C02', { projectId: 'pj-x' }), 404, /没有这个项目/);
    assert.equal((await one<{ status: string }>('select status from project where id = $1', ['pj-1'])).status, 'active');
  });
});

describe('C03 新建关键节点、C04 开始节点', () => {
  test('项目成员在草拟项目里建节点并关联本项目的任务；开始节点', async () => {
    const r = await run(xu, 'C03', { projectId: 'pj-2', name: '漏斗核对', acceptanceCriteria: '数据有出处', dueAt: '2026-11-27T18:00:00+08:00', taskIds: ['k-xu-5'] }) as { milestoneId: string };
    const m = await one<{ status: string; due_at: Date; original_due_at: Date }>('select status, due_at, original_due_at from milestone where id = $1', [r.milestoneId]);
    assert.equal(m.status, 'todo');
    assert.equal(m.due_at.toISOString(), '2026-11-27T10:00:00.000Z');
    assert.equal(m.original_due_at.toISOString(), m.due_at.toISOString());
    assert.equal(Number((await one<{ n: string }>('select count(*) as n from milestone_task where milestone_id = $1', [r.milestoneId])).n), 1);
    await run(xu, 'C04', { milestoneId: r.milestoneId });
    assert.equal((await one<{ status: string }>('select status from milestone where id = $1', [r.milestoneId])).status, 'doing');
  });

  test('反例：不是成员、已结束的项目、关联别的项目的任务、截止不带时区、重复开始', async () => {
    const input = { projectId: 'pj-2', name: '节点', acceptanceCriteria: '标准', dueAt: '2026-11-27T10:00:00Z' };
    await rejects(() => run(lin, 'C03', input), 403, /只能操作与自己相关的对象/);
    await rejects(() => run(xu, 'C03', { ...input, taskIds: ['k-lin-3'] }), 400, /属于本项目的培养任务/);
    await rejects(() => run(xu, 'C03', { ...input, dueAt: '2026-11-27 18:00' }), 400, /带时区的时间/);
    await pool.query("update project set status = 'ended', end_type = 'aborted', abort_reason = '测试', closed_at = now() where id = 'pj-2'");
    await rejects(() => run(zhou, 'C03', input), 409, /项目已结束/);
    await rejects(() => run(lin, 'C04', { milestoneId: 'ms-1-1' }), 409, /只有未开始的节点能开始/); // ms-1-1 已是进行中
  });
});

describe('C05 调整截止', () => {
  test('节点：改当前截止，原截止不变，写调整记录', async () => {
    await run(zhou, 'C05', { subjectType: 'milestone', subjectId: 'ms-1-1', dueAt: '2026-11-18T10:00:00Z', reason: '业务部门数据晚到' });
    const m = await one<{ due_at: Date; original_due_at: Date }>('select due_at, original_due_at from milestone where id = $1', ['ms-1-1']);
    assert.equal(m.due_at.toISOString(), '2026-11-18T10:00:00.000Z');
    assert.equal(m.original_due_at.toISOString(), '2026-11-13T10:00:00.000Z');
    const c = await one<{ reason: string; actor_id: string }>('select reason, actor_id from deadline_change where subject_id = $1', ['ms-1-1']);
    assert.deepEqual(c, { reason: '业务部门数据晚到', actor_id: 'u-zhou' });
  });

  test('培养任务：第一次调整记下原截止；再调整原截止不变；事件记所属管培生', async () => {
    await run(zhou, 'C05', { subjectType: 'task', subjectId: 'k-lin-4', dueAt: '2026-11-13T10:00:00Z', reason: '一' });
    await run(zhou, 'C05', { subjectType: 'task', subjectId: 'k-lin-4', dueAt: '2026-11-16T10:00:00Z', reason: '二' });
    const t = await one<{ due_at: Date; original_due_at: Date }>('select due_at, original_due_at from task_instance where id = $1', ['k-lin-4']);
    assert.equal(t.original_due_at.toISOString(), '2026-11-11T10:00:00.000Z');
    assert.equal(t.due_at.toISOString(), '2026-11-16T10:00:00.000Z');
    assert.equal(Number((await one<{ n: string }>("select count(*) as n from event_log where type = 'C05' and person_id = 'u-lin'")).n), 2);
  });

  test('反例：管培生不能调；没写原因；截止没变；对象类型不对', async () => {
    const input = { subjectType: 'milestone', subjectId: 'ms-1-1', dueAt: '2026-11-18T10:00:00Z', reason: '原因' };
    await rejects(() => run(lin, 'C05', input), 403, /管培生不能执行「调整截止」/);
    await rejects(() => run(zhou, 'C05', { ...input, reason: '' }), 400, /缺少「调整原因」/);
    await rejects(() => run(zhou, 'C05', { ...input, dueAt: '2026-11-13T18:00:00+08:00' }), 409, /和现在的截止相同/);
    await rejects(() => run(zhou, 'C05', { ...input, subjectType: 'project' }), 400, /调整对象类型/);
  });
});

describe('C13 取消节点', () => {
  test('带教取消节点并写原因', async () => {
    await run(zhou, 'C13', { milestoneId: 'ms-1-2', reason: '方案改为下期验证' });
    assert.deepEqual(await one('select status, cancel_reason from milestone where id = $1', ['ms-1-2']), { status: 'cancelled', cancel_reason: '方案改为下期验证' });
  });
  test('反例：没写原因；已通过的不能取消；已取消的不能再取消；管培生不能取消', async () => {
    await rejects(() => run(zhou, 'C13', { milestoneId: 'ms-1-2' }), 400, /缺少「取消原因」/);
    await rejects(() => run(lin, 'C13', { milestoneId: 'ms-1-2', reason: 'x' }), 403, /管培生不能执行「取消节点」/);
    await pool.query("update milestone set status = 'passed' where id = 'ms-1-1'"); // 测试里直接置状态；业务上「已通过」只能来自评审（#38）
    await rejects(() => run(zhou, 'C13', { milestoneId: 'ms-1-1', reason: 'x' }), 409, /已通过/);
    await run(zhou, 'C13', { milestoneId: 'ms-1-2', reason: '第一次' });
    await rejects(() => run(zhou, 'C13', { milestoneId: 'ms-1-2', reason: '第二次' }), 409, /已取消/);
  });
});

describe('HTTP：POST /api/commands/:id', () => {
  async function post(path: string, body: unknown, userId?: string, demo = true) {
    const server = createApp(pool, { demo });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (userId) headers.cookie = `${DEMO_COOKIE}=${userId}`;
      const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    } finally {
      server.close();
    }
  }

  test('带教确认立项 200；管培生 403；没登录 401；非演示模式 401', async () => {
    assert.equal((await post('/api/commands/C02', { projectId: 'pj-2' }, 'u-xu')).status, 403);
    assert.equal((await post('/api/commands/C02', { projectId: 'pj-2' })).status, 401);
    assert.equal((await post('/api/commands/C02', { projectId: 'pj-2' }, 'u-zhou', false)).status, 401);
    const ok = await post('/api/commands/C02', { projectId: 'pj-2' }, 'u-zhou');
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.result, { projectId: 'pj-2', status: 'active' });
  });

  test('前置条件不满足 409；没有这个命令 404；还没实现的命令 404；坏请求体 400', async () => {
    assert.equal((await post('/api/commands/C02', { projectId: 'pj-1' }, 'u-zhou')).status, 409);
    assert.equal((await post('/api/commands/C99', {}, 'u-zhou')).status, 404);
    assert.match(String((await post('/api/commands/C16', {}, 'u-zhou')).body.error), /还没有实现/);
    assert.equal((await post('/api/commands/C02', ['pj-2'], 'u-zhou')).status, 400);
  });
});
