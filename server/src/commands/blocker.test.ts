// 受阻命令的测试（issue #39）：C10–C12；骨架验收第 4 项；PRD 4.5 前置条件的反例。
// 连真测试库，和其他后端测试用同一把测试锁；每个 test 前用初始化脚本重置示例数据。
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type pg from 'pg';
import type { Actor, CommandId } from '../authorize.ts';
import { createPool } from '../db.ts';
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
const wu: Actor = { id: 'u-wu', name: '吴桐', role: 'mentor', isAdmin: false };

const run = <T = Record<string, unknown>>(actor: Actor | null, command: CommandId, input: Record<string, unknown>) => runCommand(pool, actor, command, input) as Promise<T>;
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0] as T;
const count = async (sql: string, params: unknown[] = []) => Number((await one<{ n: string }>(sql, params)).n);
const events = () => count("select count(*) as n from event_log where source = 'web'");
/** 节点有没有受阻标记 = 有没有未解除的受阻记录 */
const blocked = async (milestoneId: string) => (await count("select count(*) as n from blocker where milestone_id = $1 and status <> 'resolved'", [milestoneId])) > 0;
const milestoneStatus = async (id: string) => (await one<{ status: string }>('select status from milestone where id = $1', [id])).status;

/** 失败时：抛出指定状态码的 CommandError，状态不变，不写事件。传函数而不是 Promise：先数完事件再执行 */
async function rejects(fn: () => Promise<unknown>, code: number, message: RegExp) {
  const before = await events();
  await assert.rejects(fn(), (e: unknown) => e instanceof CommandError && e.status === code && message.test(e.message));
  assert.equal(await events(), before, '失败的命令不应写事件');
}

type Blk = { blockerId: string; status: string; handlerId?: string };
const mark = (actor: Actor, milestoneId: string, extra: Record<string, unknown> = {}) => run<Blk>(actor, 'C10', { milestoneId, reason: '渠道数据要等销售部导出', decider: '销售主管', ...extra });

describe('骨架验收第 4 项：标记 → 响应（仍受阻）→ 解除', () => {
  test('三件事在受阻记录里分开可查；节点状态始终不变', async () => {
    // pj-2 主责许诺，项目带教吴桐 → 处理责任人默认吴桐
    const b = await mark(xu, 'ms-2-1');
    assert.deepEqual([b.status, b.handlerId], ['open', 'u-wu']);
    assert.ok(await blocked('ms-2-1'));
    assert.equal(await milestoneStatus('ms-2-1'), 'todo');

    // 带教响应两次：受阻记录变为已响应，但节点仍受阻
    await run(wu, 'C11', { blockerId: b.blockerId, content: '我去找销售主管要导出权限' });
    await run(zhou, 'C11', { blockerId: b.blockerId, content: '先用上月的样本推进' });
    assert.equal((await one<{ status: string }>('select status from blocker where id = $1', [b.blockerId])).status, 'responded');
    assert.ok(await blocked('ms-2-1'), '响应不等于解除');

    // 许诺解除：去掉受阻标记
    await run(xu, 'C12', { blockerId: b.blockerId, note: '已拿到导出数据' });
    assert.equal(await blocked('ms-2-1'), false);
    assert.equal(await milestoneStatus('ms-2-1'), 'todo');

    // 标记、响应、解除分开可查
    assert.deepEqual(await one('select reason, decider, handler_id, created_by, status, resolved_by, resolve_note from blocker where id = $1', [b.blockerId]), {
      reason: '渠道数据要等销售部导出', decider: '销售主管', handler_id: 'u-wu', created_by: 'u-xu', status: 'resolved', resolved_by: 'u-xu', resolve_note: '已拿到导出数据',
    });
    assert.deepEqual((await pool.query('select responder_id, content from blocker_response where blocker_id = $1 order by created_at', [b.blockerId])).rows, [
      { responder_id: 'u-wu', content: '我去找销售主管要导出权限' }, { responder_id: 'u-zhou', content: '先用上月的样本推进' },
    ]);
    const log = (await pool.query("select type, project_id from event_log where source = 'web' order by occurred_at, id")).rows;
    assert.deepEqual(log.map(x => x.type), ['C10', 'C11', 'C11', 'C12']);
    assert.ok(log.every(x => x.project_id === 'pj-2'));
  });

  test('处理责任人：没有项目带教时按 PRD 2.4 推（pj-1 → 林夏的默认带教周颖）；也可以指定', async () => {
    assert.equal((await mark(lin, 'ms-1-1')).handlerId, 'u-zhou');
    assert.equal((await mark(lin, 'ms-1-2', { handlerId: 'u-wu' })).handlerId, 'u-wu');
  });

  test('从未响应直接解除也可以', async () => {
    const b = await mark(lin, 'ms-1-1');
    await run(zhou, 'C12', { blockerId: b.blockerId });
    assert.deepEqual(await one('select status, resolved_by from blocker where id = $1', [b.blockerId]), { status: 'resolved', resolved_by: 'u-zhou' });
  });
});

describe('前置条件反例', () => {
  test('一个节点同时最多一条未解除的受阻记录；解除后可以再标', async () => {
    const b = await mark(lin, 'ms-1-1');
    await rejects(() => mark(xu, 'ms-1-1'), 409, /已经有一条未解除的受阻记录/);
    await run(zhou, 'C11', { blockerId: b.blockerId, content: '在看' });
    await rejects(() => mark(lin, 'ms-1-1'), 409, /已经有一条未解除的受阻记录/); // 已响应也算未解除
    await run(lin, 'C12', { blockerId: b.blockerId });
    await mark(lin, 'ms-1-1');
    assert.equal(await count("select count(*) as n from blocker where milestone_id = 'ms-1-1'"), 2);
  });

  test('已通过或已取消的节点不能标受阻', async () => {
    const v = await run<{ submissionId: string }>(lin, 'C06', { milestoneId: 'ms-1-1', url: 'https://feishu.cn/docx/v1' });
    await run(zhou, 'C08', { submissionId: v.submissionId, grade: '达标' });
    await rejects(() => mark(lin, 'ms-1-1'), 409, /已经「已通过」/);
    await run(zhou, 'C13', { milestoneId: 'ms-1-2', reason: '不做了' });
    await rejects(() => mark(lin, 'ms-1-2'), 409, /已经「已取消」/);
    assert.equal(await count('select count(*) as n from blocker'), 0);
  });

  test('输入与授权：缺原因、处理人不存在、不是成员、管培生不能响应；已解除的不能再响应或解除', async () => {
    await rejects(() => run(lin, 'C10', { milestoneId: 'ms-1-1' }), 400, /缺少「受阻原因」/);
    await rejects(() => mark(lin, 'ms-1-1', { handlerId: 'u-x' }), 400, /处理责任人不存在/);
    await rejects(() => mark(lin, 'ms-2-1'), 403, /只能操作与自己相关的对象/);
    await rejects(() => mark(lin, 'ms-x'), 404, /没有这个关键节点/);
    const b = await mark(lin, 'ms-1-1');
    await rejects(() => run(lin, 'C11', { blockerId: b.blockerId, content: '自己回' }), 403, /管培生不能执行「响应受阻」/);
    await rejects(() => run(zhou, 'C11', { blockerId: b.blockerId }), 400, /缺少「响应内容」/);
    await rejects(() => run(zhou, 'C11', { blockerId: 'bk-x', content: 'x' }), 404, /没有这条受阻记录/);
    await run(xu, 'C12', { blockerId: b.blockerId }); // 参与者也能解除
    await rejects(() => run(zhou, 'C11', { blockerId: b.blockerId, content: 'x' }), 409, /已经解除/);
    await rejects(() => run(lin, 'C12', { blockerId: b.blockerId }), 409, /已经解除/);
  });
});
