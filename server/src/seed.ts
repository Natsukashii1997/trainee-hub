// 初始化脚本（PRD 4.1、issue #35）：清空本机库、从头迁移，再写入一套虚构的示例数据。
// 只在演示模式（环境变量 TRAINEE_HUB_DEMO=1）、且库在本机时运行，避免误写正式库。
// 数据全是虚构的：两名管培生、两位带教（其中一位有管理权限）、一条四阶段路径、两个示例项目、4+1 主线能力项。
// 用法：TRAINEE_HUB_DEMO=1 npm run db:seed
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import type { Actor } from './authorize.ts';
import { runCommand } from './commands/index.ts';
import { createPool } from './db.ts';
import { LOCK_KEY, migrate } from './migrate.ts';

/** 能不能运行初始化脚本：不能时返回中文原因，能时返回 null */
export function demoRefusal(env: Record<string, string | undefined>, url: string | undefined): string | null {
  if (env.TRAINEE_HUB_DEMO !== '1') return '初始化脚本只在演示模式下运行：设置 TRAINEE_HUB_DEMO=1 后再执行';
  if (!url) return '没有设置 DATABASE_URL';
  let host: string;
  try {
    const u = new URL(url);
    if (u.search) return '连接串不能带参数（参数可能改掉实际连到的地址）';
    host = u.hostname;
  } catch {
    return '连接串格式不对';
  }
  if (host !== '127.0.0.1' && host !== 'localhost') return `初始化脚本只写本机库，不写 ${host}`;
  return null;
}

// ---- 示例数据 ----

const COHORT_START = '2026-09-10';
const COHORT_END = '2027-03-19';
/** 北京时间 18:00 = UTC 10:00；开放时间取北京时间 09:00 = UTC 01:00 */
const dueOn = (date: string) => `${date}T10:00:00Z`;
const openOn = (date: string) => `${date}T01:00:00Z`;
/** 示例数据按这一天判断任务是否已开放（北京时间 2026-11-08） */
const DEMO_TODAY = '2026-11-08';

const USERS = [
  { id: 'u-lin', name: '林夏', role: 'trainee', isAdmin: false },
  { id: 'u-xu', name: '许诺', role: 'trainee', isAdmin: false },
  { id: 'u-zhou', name: '周颖', role: 'mentor', isAdmin: true },
  { id: 'u-wu', name: '吴桐', role: 'mentor', isAdmin: false },
] as const;

const STAGES = [
  { id: 'st-1', no: 1, name: '入职', days: 7 },
  { id: 'st-2', no: 2, name: '通识', days: 28 },
  { id: 'st-3', no: 3, name: '轮岗', days: 56 },
  { id: 'st-4', no: 4, name: '定岗', days: 100 },
];
const MODULES = [
  { id: 'md-1', stage: 'st-1', no: 1, name: '入职', line: null, days: 7 },
  { id: 'md-2', stage: 'st-2', no: 1, name: '通识', line: null, days: 28 },
  { id: 'md-3', stage: 'st-3', no: 1, name: '客服岗', line: '客户线', days: 28 },
  { id: 'md-4', stage: 'st-3', no: 2, name: '销售岗', line: '客户线', days: 28 },
  { id: 'md-5', stage: 'st-4', no: 1, name: '定岗', line: null, days: 100 },
];
const TEMPLATES = [
  { id: 'tt-1', module: 'md-1', no: 1, name: '公司与业务认知笔记', output: '文档', days: 3 },
  { id: 'tt-2', module: 'md-2', no: 1, name: '服务链路梳理', output: '文档', days: 7 },
  { id: 'tt-3', module: 'md-3', no: 1, name: '来电问题分类与归因', output: '复盘', days: 10 },
  { id: 'tt-4', module: 'md-3', no: 2, name: '客服岗小结', output: '文档', days: 3 },
  { id: 'tt-5', module: 'md-4', no: 1, name: '渠道转化现状分析', output: '文档', days: 10 },
  { id: 'tt-6', module: 'md-4', no: 2, name: '销售岗小结', output: '文档', days: 3 },
  { id: 'tt-7', module: 'md-5', no: 1, name: '定岗答辩材料', output: '路演', days: 10 },
];
/** 两人的站：许诺先去销售岗、再去客服岗 */
const STATIONS: Record<string, { no: number; module: string; start: string; end: string }[]> = {
  'u-lin': [
    { no: 1, module: 'md-1', start: '2026-09-10', end: '2026-09-16' },
    { no: 2, module: 'md-2', start: '2026-09-17', end: '2026-10-14' },
    { no: 3, module: 'md-3', start: '2026-10-15', end: '2026-11-11' },
    { no: 4, module: 'md-4', start: '2026-11-12', end: '2026-12-09' },
    { no: 5, module: 'md-5', start: '2026-12-10', end: COHORT_END },
  ],
  'u-xu': [
    { no: 1, module: 'md-1', start: '2026-09-10', end: '2026-09-16' },
    { no: 2, module: 'md-2', start: '2026-09-17', end: '2026-10-14' },
    { no: 3, module: 'md-4', start: '2026-10-15', end: '2026-11-11' },
    { no: 4, module: 'md-3', start: '2026-11-12', end: '2026-12-09' },
    { no: 5, module: 'md-5', start: '2026-12-10', end: COHORT_END },
  ],
};
const pathId = (user: string) => `p-${user.slice(2)}`;
const stationId = (user: string, no: number) => `s-${user.slice(2)}-${no}`;
const taskId = (user: string, template: string) => `k-${user.slice(2)}-${template.slice(3)}`;
/** 在项目中完成的任务：任务 → 项目、节点 */
const IN_PROJECT: Record<string, { project: string; milestone: string }> = {
  [taskId('u-lin', 'tt-3')]: { project: 'pj-1', milestone: 'ms-1-1' },
  [taskId('u-xu', 'tt-3')]: { project: 'pj-1', milestone: 'ms-1-1' },
  [taskId('u-xu', 'tt-5')]: { project: 'pj-2', milestone: 'ms-2-1' },
};

/** 写入示例数据（假定库是刚迁移好的空库），在一个事务里 */
export async function seedDemo(client: pg.PoolClient, inTransaction = false): Promise<void> {
  const q = (sql: string, params: unknown[] = []) => client.query(sql, params);
  if (!inTransaction) await q('begin');
  try {
    // 路径模板（先写阶段、模块、任务模板，最后冻结：被期次绑定后只读）
    await q("insert into path_template (id, name, version) values ('pt-demo', '标准培养路径（示例）', 'v1.0')");
    for (const s of STAGES) await q('insert into stage (id, template_id, no, name, days) values ($1, $2, $3, $4, $5)', [s.id, 'pt-demo', s.no, s.name, s.days]);
    for (const m of MODULES) await q('insert into module (id, stage_id, no, name, line, days) values ($1, $2, $3, $4, $5, $6)', [m.id, m.stage, m.no, m.name, m.line, m.days]);
    for (const t of TEMPLATES)
      await q("insert into task_template (id, module_id, no, name, output, days, deadline_anchor, deadline_time) values ($1, $2, $3, $4, $5, $6, 'station_end', '18:00')", [t.id, t.module, t.no, t.name, t.output, t.days]);
    await q("insert into cohort (id, name, template_id, start_date, end_date, status) values ('c-demo', '2026 秋季班（示例）', 'pt-demo', $1, $2, 'running')", [COHORT_START, COHORT_END]);
    await q("update path_template set frozen = true where id = 'pt-demo'");

    // 人员
    for (const u of USERS)
      await q("insert into app_user (id, name, role, is_admin, cohort_id, joined_on) values ($1, $2, $3, $4, case when $3 = 'trainee' then 'c-demo' end, $5)", [u.id, u.name, u.role, u.isAdmin, COHORT_START]);

    // 个人路径、站、培养任务
    for (const [user, stations] of Object.entries(STATIONS)) {
      await q("insert into personal_path (id, user_id, cohort_id, start_date, end_date, status) values ($1, $2, 'c-demo', $3, $4, 'running')", [pathId(user), user, COHORT_START, COHORT_END]);
      for (const s of stations) {
        await q('insert into personal_module (id, path_id, module_id, no, start_date, end_date) values ($1, $2, $3, $4, $5, $6)', [stationId(user, s.no), pathId(user), s.module, s.no, s.start, s.end]);
      }
    }

    // 项目（任务要引用项目，先建项目）
    await q("insert into project (id, name, goal, acceptance_criteria, acceptor_name, status, created_by, confirmed_by, confirmed_at) values ('pj-1', '来电归因优化', '找出来电量最高的三类问题的根因，提出可落地的分流方案', '问题分类覆盖近四周 90% 以上来电；方案经客服主管试用一周并给出反馈', '客服主管（示例）', 'active', 'u-lin', 'u-zhou', '2026-10-20T02:00:00Z')");
    await q("insert into project (id, name, goal, acceptance_criteria, acceptor_name, status, created_by) values ('pj-2', '渠道转化复盘', '梳理三个获客渠道的转化漏斗，找到流失最大的环节', '漏斗数据核对无误；给出一条可验证的改进假设', '销售主管（示例）', 'draft', 'u-xu')");
    await q("insert into project_member (project_id, trainee_id, role) values ('pj-1', 'u-lin', 'lead'), ('pj-1', 'u-xu', 'member'), ('pj-2', 'u-xu', 'lead')");
    await q('insert into project_station (project_id, station_id) values ($1, $2), ($3, $4)', ['pj-1', stationId('u-lin', 3), 'pj-2', stationId('u-xu', 3)]);

    for (const [user, stations] of Object.entries(STATIONS)) {
      for (const s of stations) {
        for (const t of TEMPLATES.filter(x => x.module === s.module)) {
          const id = taskId(user, t.id);
          const link = IN_PROJECT[id];
          const status = s.start <= DEMO_TODAY ? 'doing' : 'todo';
          await q(
            "insert into task_instance (id, path_id, station_id, source, task_template_id, name, output, open_at, due_at, status, in_project, project_id) values ($1, $2, $3, 'template', $4, $5, $6, $7, $8, $9, $10, $11)",
            [id, pathId(user), stationId(user, s.no), t.id, t.name, t.output, openOn(s.start), dueOn(s.end), status, Boolean(link), link?.project ?? null],
          );
        }
      }
    }

    // 关键节点与关联的培养任务
    await q("insert into milestone (id, project_id, name, goal, acceptance_criteria, original_due_at, due_at, status, created_by) values ('ms-1-1', 'pj-1', '问题定义', '把近四周来电按问题分类，找出量最大的三类', '分类口径经带教确认；三类问题各有样本和占比', $1, $1, 'doing', 'u-lin')", [dueOn('2026-11-13')]);
    await q("insert into milestone (id, project_id, name, goal, acceptance_criteria, original_due_at, due_at, status, created_by) values ('ms-1-2', 'pj-1', '分流方案验证', '在一个班组试用分流方案一周', '有试用前后的对比数据和客服主管反馈', $1, $1, 'todo', 'u-lin')", [dueOn('2026-12-04')]);
    await q("insert into milestone (id, project_id, name, goal, acceptance_criteria, original_due_at, due_at, status, created_by) values ('ms-2-1', 'pj-2', '现状梳理', '画出三个渠道的转化漏斗', '每个渠道的各环节数据有出处', $1, $1, 'todo', 'u-xu')", [dueOn('2026-11-20')]);
    for (const [task, link] of Object.entries(IN_PROJECT)) await q('insert into milestone_task (milestone_id, task_id) values ($1, $2)', [link.milestone, task]);
    // 任务标准的三项（PRD v3.0 总纲 6.1）
    await q("update milestone set common_mistakes = $2, escalation = $3, sample_links = $4 where id = $1", ['ms-1-1',
      '先想好分流方案，再倒推问题\n把来电现象当成原因\n样本只取了一个班组',
      '工单系统的来电标签一天内导不出来；客服主管对分类口径有不同意见',
      JSON.stringify([{ title: '上一期：退费工单分类（通过版，示例）', url: 'https://example.feishu.cn/docx/sample-refund' }])]);

    // 带教关系：周颖是两人的默认带教；吴桐带许诺的销售站，也是许诺在渠道转化复盘里的项目带教
    await q("insert into mentorship (id, mentor_id, trainee_id, scope, start_date) values ('mt-1', 'u-zhou', 'u-lin', 'all', $1), ('mt-2', 'u-zhou', 'u-xu', 'all', $1)", [COHORT_START]);
    await q("insert into mentorship (id, mentor_id, trainee_id, scope, station_id, start_date, end_date) values ('mt-3', 'u-wu', 'u-xu', 'station', $1, '2026-10-15', '2026-11-11')", [stationId('u-xu', 3)]);
    await q("insert into mentorship (id, mentor_id, trainee_id, scope, project_id, start_date) values ('mt-4', 'u-wu', 'u-xu', 'project', 'pj-2', '2026-11-01')");

    // 能力项：季度答辩的「4+1 主线」（起始框架，可增删）
    const items = ['公司、行业与导师侧认知', '用户与服务链路认知', '实际项目推进与交付', '营销线', 'AI 使用与人机协同'];
    for (const [i, name] of items.entries()) await q('insert into competency_item (id, no, name) values ($1, $2, $3)', [`ci-${i + 1}`, i + 1, name]);

    // 事件日志：示例数据本身也留痕，来源记为初始化脚本
    await q("insert into event_log (type, subject_type, subject_id, actor_id, source, project_id, occurred_at) values ('C01', 'project', 'pj-1', 'u-lin', 'script', 'pj-1', '2026-10-19T02:00:00Z'), ('C02', 'project', 'pj-1', 'u-zhou', 'script', 'pj-1', '2026-10-20T02:00:00Z'), ('C01', 'project', 'pj-2', 'u-xu', 'script', 'pj-2', '2026-11-06T02:00:00Z')");

    if (!inTransaction) await q('commit');
  } catch (e) {
    if (!inTransaction) await q('rollback');
    throw e;
  }
}

/**
 * 演示故事（PRD v3.0 第 1 页验收用，只在 npm run db:seed 时写，后端测试不写）：
 * 林夏交「问题定义」第 1 版 → 周颖评「需改进」，分条写 4 条反馈（2 条下次验证、1 条这一版就要补）→ 周颖记一条口头反馈（下次验证）
 * → 林夏修改再交第 2 版，等周颖评审。全部经业务命令写入，和真实操作留下的数据一样。
 */
export async function seedStory(pool: pg.Pool): Promise<void> {
  const lin: Actor = { id: 'u-lin', name: '林夏', role: 'trainee', isAdmin: false };
  const zhou: Actor = { id: 'u-zhou', name: '周颖', role: 'mentor', isAdmin: true };
  // 每步之间隔一点时间：页面上的时间精确到毫秒，同一毫秒里的几步分不出先后
  const pause = () => new Promise(resolve => setTimeout(resolve, 20));
  const run = async <T>(actor: Actor, command: Parameters<typeof runCommand>[2], input: Record<string, unknown>) => {
    await pause();
    return runCommand(pool, actor, command, input, 'web') as Promise<T>;
  };
  const v1 = await run<{ submissionId: string }>(lin, 'C06', { milestoneId: 'ms-1-1', url: 'https://example.feishu.cn/docx/call-problem-v1', note: '第一版问题定义，分类按工单标签做的' });
  const r1 = await run<{ reviewId: string }>(zhou, 'C08', {
    submissionId: v1.submissionId, grade: '需改进',
    keyIssue: '分类口径没说清楚，占比只来自一个班组', judgment: '方向对，证据还撑不起「量最大的三类」这个结论',
    actions: [{ kind: 'revise', content: '按下面几条改完再交' }],
    feedback: [
      { content: '分类口径直接用了工单系统的标签，没有说明为什么这样分。先写清楚分类口径和依据，再分。', tags: ['分类口径'], nature: 'standard', verifyNext: true },
      { content: '三类问题的占比只有一个班组的数据，补上另外两个班组再下判断。', tags: ['证据来源'], nature: 'standard', verifyNext: true },
      { content: '没有写这次不处理哪些来电（比如投诉升级件）。', tags: ['范围'], needsAction: true },
      { content: '抽样听录音核对标签的做法很好，保留。', tags: ['做得好'] },
    ],
  });
  // 口头反馈的入口（C29）在第 6 页做；这里先直接写一条，挂在这个里程碑上
  await pause();
  const client = await pool.connect();
  try {
    await client.query(
      "insert into feedback_item (trainee_id, source, milestone_id, content, tags, verify_next, created_by) values ('u-lin', 'verbal', 'ms-1-1', $1, $2, true, 'u-zhou')",
      ['周会上汇报时先说结论，再说过程。', ['结论先行']]);
  } finally {
    client.release();
  }
  await run(lin, 'C07', { prevReviewId: r1.reviewId, url: 'https://example.feishu.cn/docx/call-problem-v2', changeNote: '写清了分类口径和依据；三个班组的数据都补上了；加了「不处理哪些来电」一节。' });
}

/** 清空库、从头迁移、写入示例数据。不满足演示模式或库不在本机时直接拒绝，什么都不做 */
export async function resetDemo(pool: pg.Pool, env: Record<string, string | undefined>, url: string | undefined): Promise<void> {
  const refused = demoRefusal(env, url);
  if (refused) throw new Error(refused);
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('begin');
    // 与独立迁移互斥，先拿锁再清库；事务结束自动释放。
    await client.query('select pg_advisory_xact_lock($1)', [LOCK_KEY]);
    await client.query('drop schema public cascade; create schema public');
    await migrate(pool, undefined, client);
    await seedDemo(client, true);
    await client.query('commit');
  } catch (e) {
    try {
      await client.query('rollback');
    } catch {
      discard = true;
    }
    throw e;
  } finally {
    client.release(discard);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  const refused = demoRefusal(process.env, url);
  if (refused) {
    console.error(refused);
    process.exitCode = 1;
  } else {
    const pool = createPool(url);
    try {
      await resetDemo(pool, process.env, url);
      await seedStory(pool);
      console.log('已重置本机库并写入示例数据（全部虚构），含第 1 页的演示故事');
    } catch (e) {
      console.error(`初始化失败：${(e as Error).message}`);
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  }
}
