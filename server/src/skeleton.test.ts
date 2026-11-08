// 骨架业务表（0003）与初始化脚本的测试（issue #35）。连真测试库，和 server.test.ts 用同一把测试锁，不会同时清库。
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type pg from 'pg';
import { createPool } from './db.ts';
import { migrate } from './migrate.ts';
import { demoRefusal, resetDemo } from './seed.ts';
import { checkConnectedTestDb, checkTestUrl } from './testdb.ts';

const url = process.env.TEST_DATABASE_URL;
const refused = checkTestUrl(url);
if (refused) throw new Error(`不清库，停止测试：${refused}`);

const TEST_LOCK = 5_320_002; // 与 server.test.ts 相同
let pool: pg.Pool;
let lockClient: pg.PoolClient;

before(async () => {
  pool = createPool(url);
  lockClient = await pool.connect();
  const wrong = await checkConnectedTestDb(lockClient);
  if (wrong) throw new Error(`不清库，停止测试：${wrong}`);
  await lockClient.query('select pg_advisory_lock($1)', [TEST_LOCK]);
  await lockClient.query('drop schema public cascade; create schema public');
  await migrate(pool);
});
after(async () => {
  await lockClient.query('select pg_advisory_unlock($1)', [TEST_LOCK]);
  lockClient.release();
  await pool.end();
});

const exists = async (table: string) => (await pool.query<{ ok: boolean }>('select to_regclass($1) is not null as ok', [table])).rows[0].ok;
const count = async (table: string) => (await pool.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n;

// PRD 第 13 节 A 级的 26 张表
const A_TABLES = [
  'app_user', 'mentorship', 'cohort', 'path_template', 'stage', 'module', 'task_template', 'personal_path', 'personal_module',
  'task_instance', 'project', 'project_member', 'project_station', 'project_conclusion', 'milestone', 'milestone_task',
  'blocker', 'blocker_response', 'deadline_change', 'submission', 'review', 'next_action', 'submission_credit',
  'competency_item', 'competency_evidence', 'event_log',
];

describe('骨架表（0003）', () => {
  test('A 级 26 张表都在；v1.1 的待办表已去掉', async () => {
    assert.equal(A_TABLES.length, 26);
    for (const t of A_TABLES) assert.equal(await exists(t), true, `缺表 ${t}`);
    assert.equal(await exists('todo'), false);
  });

  describe('约束', () => {
    before(async () => {
      await pool.query(`
        insert into app_user (id, name, role, is_admin) values ('ta', '甲', 'trainee', false), ('tb', '乙', 'trainee', false), ('ma', '带教 A', 'mentor', true), ('mb', '带教 B', 'mentor', false);
        insert into project (id, name, goal, acceptance_criteria, created_by) values ('pj', '项目', '目标', '验收条件', 'ta');
        insert into milestone (id, project_id, name, acceptance_criteria, original_due_at, due_at, created_by) values ('ms', 'pj', '节点', '验收标准', '2026-11-13T10:00Z', '2026-11-13T10:00Z', 'ta');
      `);
    });

    test('角色只有管培生、带教；管理权限只能给带教', async () => {
      await assert.rejects(pool.query("insert into app_user (id, name, role) values ('x1', '管理员', 'admin')"), /app_user_role_check/);
      await assert.rejects(pool.query("insert into app_user (id, name, role, is_admin) values ('x2', '某人', 'trainee', true)"), /app_user_admin_is_mentor/);
    });

    test('项目主责只能一位；推进中的项目必须记了立项确认', async () => {
      await pool.query("insert into project_member (project_id, trainee_id, role) values ('pj', 'ta', 'lead')");
      await assert.rejects(pool.query("insert into project_member (project_id, trainee_id, role) values ('pj', 'tb', 'lead')"), /project_one_lead/);
      await assert.rejects(pool.query("update project set status = 'active' where id = 'pj'"), /project_check/);
      await pool.query("update project set status = 'active', confirmed_by = 'ma', confirmed_at = now() where id = 'pj'");
    });

    test('带教关系：范围与范围对象一致', async () => {
      await assert.rejects(pool.query("insert into mentorship (mentor_id, trainee_id, scope, start_date) values ('mb', 'ta', 'project', '2026-11-01')"), /mentorship_check/);
      await pool.query("insert into mentorship (mentor_id, trainee_id, scope, project_id, start_date) values ('mb', 'ta', 'project', 'pj', '2026-11-01')");
      await assert.rejects(pool.query("insert into mentorship (mentor_id, trainee_id, scope, project_id, start_date) values ('mb', 'ta', 'all', 'pj', '2026-11-01')"), /mentorship_check/);
    });

    test('成果版本：只挂一个对象；第 2 版起必须写修改说明并关联上一版评审', async () => {
      await assert.rejects(pool.query("insert into submission (version, url, submitter_id, reviewer_id) values (1, 'https://x', 'ta', 'ma')"), /submission_check/);
      await pool.query("insert into submission (id, milestone_id, version, url, submitter_id, reviewer_id) values ('sv1', 'ms', 1, 'https://x/1', 'ta', 'ma')");
      await pool.query("insert into review (id, submission_id, reviewer_id, grade, level, key_issue, judgment) values ('rv1', 'sv1', 'ma', '需改进', 'deep', '缺样本', '口径不清')");
      await assert.rejects(pool.query("insert into review (submission_id, reviewer_id, grade) values ('sv1', 'ma', '达标')"), /review_submission_id_key/);
      await assert.rejects(pool.query("insert into submission (milestone_id, version, url, submitter_id, reviewer_id, prev_review_id) values ('ms', 2, 'https://x/2', 'ta', 'ma', 'rv1')"), /submission_check/);
      await assert.rejects(pool.query("insert into submission (milestone_id, version, url, change_note, submitter_id, reviewer_id) values ('ms', 2, 'https://x/2', '补了样本', 'ta', 'ma')"), /submission_check/);
      await pool.query("insert into submission (id, milestone_id, version, url, change_note, submitter_id, reviewer_id, prev_review_id) values ('sv2', 'ms', 2, 'https://x/2', '补了样本', 'ta', 'ma', 'rv1')");
    });

    test('下一步行动：修改再交和推进后续节点必须有负责人；完成时间与状态一致', async () => {
      await assert.rejects(pool.query("insert into next_action (review_id, kind, content) values ('rv1', 'revise', '补样本')"), /next_action_check/);
      await pool.query("insert into next_action (review_id, kind, content) values ('rv1', 'suggest', '可以参考上一期的分类')");
      await assert.rejects(pool.query("insert into next_action (review_id, kind, content, owner_id, status) values ('rv1', 'revise', '补样本', 'ta', 'done')"), /next_action_check/);
      await pool.query("insert into next_action (review_id, kind, content, owner_id) values ('rv1', 'revise', '补样本', 'ta')");
    });

    test('认定：同一个培养任务最多一条已认定', async () => {
      await pool.query(`
        insert into path_template (id, name, version) values ('pt', '路径', 'v1');
        insert into stage (id, template_id, no, name, days) values ('st', 'pt', 1, '阶段', 30);
        insert into module (id, stage_id, no, name, days) values ('md', 'st', 1, '岗位', 30);
        insert into task_template (id, module_id, no, name, output, days, deadline_anchor, deadline_time) values ('tt', 'md', 1, '任务', '文档', 3, 'station_end', '18:00');
        insert into cohort (id, name, template_id, start_date, end_date) values ('c', '期次', 'pt', '2026-09-01', '2027-03-01');
        insert into personal_path (id, user_id, cohort_id, start_date, end_date) values ('pa', 'ta', 'c', '2026-09-01', '2027-03-01');
        insert into personal_module (id, path_id, module_id, no, start_date, end_date) values ('sa', 'pa', 'md', 1, '2026-09-01', '2026-09-30');
        insert into task_instance (id, path_id, station_id, source, task_template_id, name, output, open_at, due_at, in_project, project_id)
          values ('ka', 'pa', 'sa', 'template', 'tt', '任务', '文档', '2026-09-01T01:00Z', '2026-09-30T10:00Z', true, 'pj');
      `);
      await pool.query("insert into submission_credit (submission_id, task_id, credited_by, credited_at) values ('sv1', 'ka', 'ma', now())");
      await assert.rejects(pool.query("insert into submission_credit (submission_id, task_id, credited_by, credited_at) values ('sv2', 'ka', 'ma', now())"), /submission_credit_one_per_task/);
      await assert.rejects(pool.query("update task_instance set project_id = null where id = 'ka'"), /task_instance_in_project_has_project/);
    });

    test('受阻：一个节点同时最多一条未解除；解除要记人和时间', async () => {
      await pool.query("insert into blocker (id, milestone_id, reason, created_by) values ('bk1', 'ms', '等业务部门给数据', 'ta')");
      await assert.rejects(pool.query("insert into blocker (milestone_id, reason, created_by) values ('ms', '另一个原因', 'ta')"), /blocker_one_unresolved/);
      await pool.query("insert into blocker_response (blocker_id, content, responder_id) values ('bk1', '我去协调', 'ma')");
      await pool.query("update blocker set status = 'responded' where id = 'bk1'"); // 响应后仍未解除
      await assert.rejects(pool.query("insert into blocker (milestone_id, reason, created_by) values ('ms', '另一个原因', 'ta')"), /blocker_one_unresolved/);
      await assert.rejects(pool.query("update blocker set status = 'resolved' where id = 'bk1'"), /blocker_check/);
      await pool.query("update blocker set status = 'resolved', resolved_by = 'ta', resolved_at = now() where id = 'bk1'");
      await pool.query("insert into blocker (milestone_id, reason, created_by) values ('ms', '新的阻碍', 'ta')"); // 解除后可以再标
    });

    test('项目结论：业务验证为已验证时必须有验证结论；中止要写原因', async () => {
      await assert.rejects(pool.query("insert into project_conclusion (project_id, delivery, verification_status, written_by) values ('pj', 'met', 'verified', 'ta')"), /project_conclusion_check/);
      await pool.query("insert into project_conclusion (project_id, delivery, written_by) values ('pj', 'met', 'ta')"); // 交付达成、业务未验证
      await pool.query("update project_conclusion set verification_status = 'verified', verification_result = 'met', verification_updated_by = 'ta', verification_updated_at = now() where project_id = 'pj'");
      await assert.rejects(pool.query("update project set status = 'ended', end_type = 'aborted', closed_at = now() where id = 'pj'"), /project_check/);
    });

    test('节点取消必须写原因', async () => {
      await assert.rejects(pool.query("update milestone set status = 'cancelled' where id = 'ms'"), /milestone_check/);
    });

    test('事件日志：可记所属项目，来源可以是初始化脚本或调试；仍然只追加', async () => {
      const { rows } = await pool.query("insert into event_log (type, subject_type, subject_id, source, project_id) values ('C01', 'project', 'pj', 'script', 'pj') returning id");
      await pool.query("insert into event_log (type, subject_type, subject_id, source) values ('debug.setStatus', 'milestone', 'ms', 'debug')");
      await assert.rejects(pool.query("update event_log set type = 'x' where id = $1", [rows[0].id]), /只追加/);
    });
  });
});

describe('初始化脚本', () => {
  const local = 'postgres://u:p@127.0.0.1:5433/trainee_hub';

  test('只在演示模式、且库在本机时运行', () => {
    assert.match(String(demoRefusal({}, local)), /演示模式/);
    assert.match(String(demoRefusal({ TRAINEE_HUB_DEMO: 'true' }, local)), /演示模式/);
    assert.match(String(demoRefusal({ TRAINEE_HUB_DEMO: '1' }, 'postgres://u:p@db.example.com:5432/trainee_hub')), /只写本机库/);
    assert.match(String(demoRefusal({ TRAINEE_HUB_DEMO: '1' }, `${local}?host=10.0.0.1`)), /不能带参数/);
    assert.equal(demoRefusal({ TRAINEE_HUB_DEMO: '1' }, local), null);
  });

  test('非演示模式下拒绝，库里什么都不动', async () => {
    const before = await count('app_user');
    await assert.rejects(resetDemo(pool, {}, url), /演示模式/);
    assert.equal(await count('app_user'), before);
  });

  test('重置后生成示例数据；再重置一次结果一致', async () => {
    const snapshot = async () => {
      const out: Record<string, number> = {};
      for (const t of A_TABLES) out[t] = await count(t);
      return out;
    };
    await resetDemo(pool, { TRAINEE_HUB_DEMO: '1' }, url);
    const first = await snapshot();
    await resetDemo(pool, { TRAINEE_HUB_DEMO: '1' }, url);
    assert.deepEqual(await snapshot(), first);

    assert.equal(first.app_user, 4);
    assert.equal(first.project, 2);
    assert.equal(first.competency_item, 5);
    assert.equal(first.submission, 0); // 成果和评审只能经业务命令产生（#37 起）
    const admins = await pool.query("select id from app_user where is_admin");
    assert.deepEqual(admins.rows.map(r => r.id), ['u-zhou']);
    // 每个项目都有且只有一位主责
    const leads = await pool.query("select p.id, count(m.*)::int as n from project p left join project_member m on m.project_id = p.id and m.role = 'lead' group by p.id order by p.id");
    assert.deepEqual(leads.rows, [{ id: 'pj-1', n: 1 }, { id: 'pj-2', n: 1 }]);
    // 在项目中完成的任务都关联了项目的节点
    const loose = await pool.query("select t.id from task_instance t where t.in_project and not exists (select 1 from milestone_task mt join milestone m on m.id = mt.milestone_id where mt.task_id = t.id and m.project_id = t.project_id)");
    assert.equal(loose.rowCount, 0);
    // 没有经评审就「已通过」的节点或任务（PRD 4.4）
    const passed = await pool.query("select (select count(*) from milestone where status = 'passed') + (select count(*) from task_instance where status = 'passed') as n");
    assert.equal(Number(passed.rows[0].n), 0);
    // 路径模板已冻结
    assert.equal((await pool.query("select frozen from path_template where id = 'pt-demo'")).rows[0].frozen, true);
  });
});
