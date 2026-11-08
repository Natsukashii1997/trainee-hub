// 能力证据、带教关系、能力项命令的测试（issue #41）：C16–C18；骨架验收第 6 项；PRD 4.5 前置条件的反例。
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

/** 北京时间的今天 */
const TODAY = "(now() at time zone 'Asia/Shanghai')::date";
const submitAndPass = async (actor: Actor, target: Record<string, string>) => {
  const v = await run<{ submissionId: string; reviewerId: string }>(actor, 'C06', { ...target, url: 'https://feishu.cn/docx/v1' });
  const r = await run<{ reviewId: string }>(zhou, 'C08', { submissionId: v.submissionId, grade: '达标' });
  return { ...v, reviewId: r.reviewId };
};
const evidence = (traineeId: string, sourceType: string, sourceId: string | null, extra: Record<string, unknown> = {}) =>
  run<{ evidenceId: string }>(zhou, 'C16', { traineeId, itemId: 'ci-3', sourceType, sourceId, summary: '把来电按问题归类并找到三类主因', judgment: 'guided', ...extra });

describe('骨架验收第 6 项：从已评审的成果提炼能力证据，来源可追溯', () => {
  test('多人项目分别为每人提炼；成长档案按能力项列出，并能点回来源节点和版本', async () => {
    const s = await submitAndPass(lin, { milestoneId: 'ms-1-1' });
    const detail = { situation: '近四周来电 1.2 万通', basis: '按问题而不是按渠道分类', revision: '' };
    await evidence('u-lin', 'review', s.reviewId, { detail });
    await evidence('u-xu', 'submission', s.submissionId, { itemId: 'ci-2', judgment: 'insufficient' }); // 许诺是参与者，也可以用
    await evidence('u-lin', 'observation', null, { itemId: 'ci-5', judgment: 'independent' });

    // 成长档案（林夏）按能力项列出；来自成果或评审的证据能点回节点和版本
    const rows = (await pool.query(
      `select i.name, e.judgment, e.confirmed_by, e.detail, s.milestone_id, s.version
       from competency_evidence e join competency_item i on i.id = e.item_id
       left join review r on e.source_type = 'review' and r.id = e.source_id
       left join submission s on s.id = coalesce(r.submission_id, case when e.source_type = 'submission' then e.source_id end)
       where e.trainee_id = 'u-lin' order by i.no`)).rows;
    assert.deepEqual(rows, [
      { name: '实际项目推进与交付', judgment: 'guided', confirmed_by: 'u-zhou', detail: { situation: '近四周来电 1.2 万通', basis: '按问题而不是按渠道分类' }, milestone_id: 'ms-1-1', version: 1 },
      { name: 'AI 使用与人机协同', judgment: 'independent', confirmed_by: 'u-zhou', detail: {}, milestone_id: null, version: null },
    ]);
    assert.equal(await count("select count(*) as n from competency_evidence where trainee_id = 'u-xu' and status = 'confirmed'"), 1);
    assert.deepEqual(await one("select person_id, project_id from event_log where type = 'C16' and person_id = 'u-xu'"), { person_id: 'u-xu', project_id: 'pj-1' });
  });

  test('反例：来源与这位管培生无关被拒绝；输入与授权校验', async () => {
    // 许诺自己销售站任务的成果：与林夏无关
    const s = await submitAndPass(xu, { taskId: 'k-xu-6' });
    await rejects(() => evidence('u-lin', 'submission', s.submissionId), 409, /来源与这位管培生无关/);
    await rejects(() => evidence('u-lin', 'review', s.reviewId), 409, /来源与这位管培生无关/);
    await evidence('u-xu', 'review', s.reviewId); // 对本人成果的评审可以
    await rejects(() => evidence('u-lin', 'submission', null), 400, /缺少「来源对象」/);
    await rejects(() => evidence('u-lin', 'submission', 'sb-x'), 404, /没有这个成果版本/);
    await rejects(() => evidence('u-lin', 'meeting', null), 400, /来源类型/);
    await rejects(() => evidence('u-lin', 'observation', null, { judgment: '良好' }), 400, /判断只能是/);
    await rejects(() => evidence('u-lin', 'observation', null, { detail: { story: 'x' } }), 400, /证据链/);
    await rejects(() => evidence('u-zhou', 'observation', null), 400, /不是在培的管培生/);
    await rejects(() => run(lin, 'C16', { traineeId: 'u-lin', itemId: 'ci-3', sourceType: 'observation', summary: 'x', judgment: 'guided' }), 403, /管培生不能执行「提炼能力证据」/);
  });
});

describe('C17 指定或更换带教', () => {
  test('更换默认带教：旧关系写结束日；之前提交的快照不变，之后提交按新关系推出', async () => {
    const before = await run<{ submissionId: string; reviewerId: string }>(lin, 'C06', { taskId: 'k-lin-4', url: 'https://feishu.cn/docx/t1' });
    assert.equal(before.reviewerId, 'u-zhou');
    const r = await run<{ mentorshipId: string; endedIds: string[] }>(zhou, 'C17', { mentorId: 'u-wu', traineeId: 'u-lin', scope: 'all' });
    assert.deepEqual(r.endedIds, ['mt-1']);
    assert.equal((await one<{ same: boolean }>(`select end_date = ${TODAY} as same from mentorship where id = 'mt-1'`)).same, true);
    assert.equal((await one<{ same: boolean }>(`select start_date = ${TODAY} and end_date is null as same from mentorship where id = $1`, [r.mentorshipId])).same, true);
    assert.equal((await one<{ reviewer_id: string }>('select reviewer_id from submission where id = $1', [before.submissionId])).reviewer_id, 'u-zhou');
    const after = await run<{ reviewerId: string }>(lin, 'C06', { milestoneId: 'ms-1-1', url: 'https://feishu.cn/docx/m1' });
    assert.equal(after.reviewerId, 'u-wu'); // pj-1 没有项目带教 → 主责林夏的默认带教，现在是吴桐
    assert.deepEqual(await one("select type, person_id, actor_id from event_log where type = 'C17'"), { type: 'C17', person_id: 'u-lin', actor_id: 'u-zhou' });
  });

  test('指定新的项目带教（之前没有）：不结束任何关系', async () => {
    const r = await run<{ endedIds: string[] }>(zhou, 'C17', { mentorId: 'u-wu', traineeId: 'u-lin', scope: 'project', projectId: 'pj-1', startDate: '2026-11-01' });
    assert.deepEqual(r.endedIds, []);
    assert.equal((await run<{ reviewerId: string }>(lin, 'C06', { milestoneId: 'ms-1-1', url: 'https://feishu.cn/docx/m1' })).reviewerId, 'u-wu');
  });

  test('反例：同一带教重复指定；已有更晚开始的关系；站与项目要对得上；角色不对；日期格式；管培生不能执行', async () => {
    await rejects(() => run(zhou, 'C17', { mentorId: 'u-zhou', traineeId: 'u-lin', scope: 'all' }), 409, /已经在这个范围/);
    await run(zhou, 'C17', { mentorId: 'u-wu', traineeId: 'u-lin', scope: 'all', startDate: '2030-01-01' });
    await rejects(() => run(zhou, 'C17', { mentorId: 'u-zhou', traineeId: 'u-lin', scope: 'all' }), 409, /更晚开始/);
    await rejects(() => run(zhou, 'C17', { mentorId: 'u-wu', traineeId: 'u-lin', scope: 'station', stationId: 's-xu-3' }), 400, /路径上的站/);
    await rejects(() => run(zhou, 'C17', { mentorId: 'u-wu', traineeId: 'u-lin', scope: 'project', projectId: 'pj-2' }), 400, /不是该项目的成员/);
    await rejects(() => run(zhou, 'C17', { mentorId: 'u-wu', traineeId: 'u-lin', scope: 'station' }), 400, /缺少「站」/);
    await rejects(() => run(zhou, 'C17', { mentorId: 'u-lin', traineeId: 'u-xu', scope: 'all' }), 400, /不是带教/);
    await rejects(() => run(zhou, 'C17', { mentorId: 'u-wu', traineeId: 'u-zhou', scope: 'all' }), 400, /不是在培的管培生/);
    await rejects(() => run(zhou, 'C17', { mentorId: 'u-wu', traineeId: 'u-xu', scope: 'all', startDate: '11/12' }), 400, /应为日期/);
    await rejects(() => run(zhou, 'C17', { mentorId: 'u-wu', traineeId: 'u-xu', scope: 'team' }), 400, /范围只能是/);
    await rejects(() => run(lin, 'C17', { mentorId: 'u-wu', traineeId: 'u-lin', scope: 'all' }), 403, /管培生不能执行/);
  });
});

describe('C18 维护能力项', () => {
  test('新增是版本 1；修改另存新版本、旧版本停用，已有证据仍指向旧版本；停用', async () => {
    const added = await run<{ itemId: string; no: number; version: number }>(zhou, 'C18', { name: '数据分析', description: '会取数、会核对' });
    assert.deepEqual([added.no, added.version], [6, 1]);

    const ev = await evidence('u-lin', 'observation', null, { itemId: 'ci-1' });
    const edited = await run<{ itemId: string; no: number; version: number }>(zhou, 'C18', { itemId: 'ci-1', name: '公司、行业与导师侧认知', description: '补充说明' });
    assert.deepEqual([edited.no, edited.version], [1, 2]);
    assert.equal((await one<{ active: boolean }>("select active from competency_item where id = 'ci-1'")).active, false);
    assert.equal((await one<{ item_id: string }>('select item_id from competency_evidence where id = $1', [ev.evidenceId])).item_id, 'ci-1');
    assert.equal(await count('select count(*) as n from competency_item where active'), 6);

    await run(zhou, 'C18', { itemId: added.itemId, retire: true });
    assert.equal((await one<{ active: boolean }>('select active from competency_item where id = $1', [added.itemId])).active, false);
    await rejects(() => evidence('u-lin', 'observation', null, { itemId: added.itemId }), 400, /已停用/);
  });

  test('反例：改已停用的旧版本；同名；缺名称；不存在；管培生不能执行', async () => {
    await run(zhou, 'C18', { itemId: 'ci-1', name: '认知', description: '' });
    await rejects(() => run(zhou, 'C18', { itemId: 'ci-1', name: '再改' }), 409, /已停用/);
    await rejects(() => run(zhou, 'C18', { name: '营销线' }), 409, /同名/);
    await rejects(() => run(zhou, 'C18', { description: 'x' }), 400, /缺少「能力项名称」/);
    await rejects(() => run(zhou, 'C18', { retire: true }), 400, /停用时要指定/);
    await rejects(() => run(zhou, 'C18', { itemId: 'ci-x', name: 'x' }), 404, /没有这个能力项/);
    await rejects(() => run(lin, 'C18', { name: '新能力' }), 403, /管培生不能执行「维护能力项」/);
  });
});
