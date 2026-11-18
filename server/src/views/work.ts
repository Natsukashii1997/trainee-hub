// 工作台的查询（PRD 10.2、第 11 节；页面清单 W1–W3）：首页（管培生、带教两种）、待办四类、决策看板两条基础信号。
import type { Actor } from '../authorize.ts';
import { actions, blockedSql, currentMilestone, currentStation, type Db, feedbackItems, menteeIds, need, q, relatedSubmissionSql, reviews, TODAY } from './shared.ts';

/** 待办四类（PRD 第 11 节）：都是对事实对象的查询，不存待办表 */
export async function todo(db: Db, actor: Actor) {
  need(actor, { traineeIds: actor.role === 'trainee' ? [actor.id] : undefined });
  const mentees = actor.role === 'mentor' ? await menteeIds(db, actor.id) : [];
  // 1. 待我评审：评审负责人是我、待评审的成果版本
  const toReview = await q(db,
    `select s.id as "submissionId", s.version, s.submitted_at as "submittedAt", s.submitter_id as "submitterId", su.name as "submitterName",
            s.milestone_id as "milestoneId", s.task_id as "taskId", coalesce(m.name, t.name) as "subjectName", m.project_id as "projectId", pj.name as "projectName"
     from submission s join app_user su on su.id = s.submitter_id
     left join milestone m on m.id = s.milestone_id left join project pj on pj.id = m.project_id left join task_instance t on t.id = s.task_id
     where s.reviewer_id = $1 and s.review_state = 'pending' order by s.submitted_at, s.id`, [actor.id]);
  // 2. 我的下一步行动：负责人是我、未完成的「修改再交」和「推进后续节点」
  const myActions = await actions(db, "a.owner_id = $1 and a.status = 'open' and a.kind in ('revise', 'advance')", [actor.id]);
  // 3. 受阻待响应：我带的人的节点上未响应的受阻记录
  const blockersToRespond = await q(db,
    `select b.id as "blockerId", b.reason, b.decider, b.created_at as "createdAt", b.created_by as "createdBy", cu.name as "createdByName",
            b.handler_id as "handlerId", m.id as "milestoneId", m.name as "milestoneName", p.id as "projectId", p.name as "projectName"
     from blocker b join milestone m on m.id = b.milestone_id join project p on p.id = m.project_id join app_user cu on cu.id = b.created_by
     where b.status = 'open' and exists (select 1 from project_member pm where pm.project_id = p.id and pm.trainee_id = any($1))
     order by b.created_at, b.id`, [mentees]);
  // 4. 待确认立项：我带的人的草拟项目
  const projectsToConfirm = await q(db,
    `select p.id as "projectId", p.name as "projectName", p.created_at as "createdAt", lm.trainee_id as "leadId", lu.name as "leadName"
     from project p join project_member lm on lm.project_id = p.id and lm.role = 'lead' join app_user lu on lu.id = lm.trainee_id
     where p.status = 'draft' and exists (select 1 from project_member pm where pm.project_id = p.id and pm.trainee_id = any($1))
     order by p.created_at, p.id`, [mentees]);
  return { toReview, myActions, blockersToRespond, projectsToConfirm };
}

/** 某位管培生正在推进的项目（主责优先），各带当前节点 */
async function activeProjects(db: Db, traineeId: string) {
  const rows = await q<{ id: string; name: string; status: string; role: string }>(db,
    `select p.id, p.name, p.status, pm.role from project p join project_member pm on pm.project_id = p.id
     where pm.trainee_id = $1 and p.status <> 'ended' order by (p.status = 'active') desc, (pm.role = 'lead') desc, p.created_at, p.id`, [traineeId]);
  return Promise.all(rows.map(async p => ({ ...p, currentMilestone: await currentMilestone(db, p.id) })));
}

/** 连续两次需改进的对象：最近两次评审都是需改进的节点或任务；where 用 x 指节点或任务 */
const twiceReviseSql = (col: 'milestone_id' | 'task_id', x: string) =>
  `(select array_agg(g) from (select r.grade as g from review r join submission s on s.id = r.submission_id where s.${col} = ${x} order by r.created_at desc limit 2) z) = array['需改进', '需改进']`;

/** 管培生首页（W1） */
async function traineeHome(db: Db, me: string) {
  const projects = await activeProjects(db, me);
  const focus = projects.find(p => p.status === 'active') ?? null;
  const blocked = await q(db,
    `select m.id as "milestoneId", m.name as "milestoneName", p.id as "projectId", p.name as "projectName", b.id as "blockerId", b.reason, b.status
     from blocker b join milestone m on m.id = b.milestone_id join project p on p.id = m.project_id join project_member pm on pm.project_id = p.id
     where pm.trainee_id = $1 and b.status <> 'resolved' order by b.created_at`, [me]);
  const pending = await q(db,
    `select s.id as "submissionId", s.version, s.submitted_at as "submittedAt", s.reviewer_id as "reviewerId", rv.name as "reviewerName",
            s.milestone_id as "milestoneId", s.task_id as "taskId", coalesce(m.name, t.name) as "subjectName", m.project_id as "projectId"
     from submission s join app_user rv on rv.id = s.reviewer_id left join milestone m on m.id = s.milestone_id left join task_instance t on t.id = s.task_id
     where s.review_state = 'pending' and ${relatedSubmissionSql('s', '$1')} order by s.submitted_at`, [me]);
  const [coverage] = await q<{ itemsTotal: number; itemsCovered: number; evidenceTotal: number }>(db,
    `select (select count(*)::int from competency_item where active) as "itemsTotal",
            (select count(distinct ci.no)::int from competency_evidence e join competency_item ci on ci.id = e.item_id
              where e.trainee_id = $1 and e.status = 'confirmed' and ci.no in (select no from competency_item where active)) as "itemsCovered",
            (select count(*)::int from competency_evidence where trainee_id = $1 and status = 'confirmed') as "evidenceTotal"`, [me]);
  const nextActions = await actions(db, "a.owner_id = $1 and a.status = 'open' and a.kind in ('revise', 'advance')", [me]);
  return {
    role: 'trainee' as const,
    station: await currentStation(db, me),
    focus,
    projects,
    // 最重要的下一步：未完成的「修改再交」「推进后续节点」
    nextActions,
    // 需要协调的事：受阻节点、待评审的成果
    blocked,
    pending,
    latestFeedback: await reviews(db, relatedSubmissionSql('s', '$1'), [me], 3),
    progress: coverage,
    ...(await traineeHomeV3(db, me, { pending, nextActions, focus })),
  };
}

/**
 * 管培生首页 v3.0 第一阶段要的数据（总纲 6.4；页面清单第 5 页 A 版）：
 * - waiting：在等带教的——等评审的成果（同 pending）、还没响应的受阻，前端按时间算「等了多久」
 * - toFix：这次要改的——待验证的反馈，最新的最多 3 条，另给总数
 * - week：本周（北京时间周一到周日）截止的里程碑与培养任务，加上本周和下周的换站
 * - growth：进度卡——培养第几天、路径任务应完成与已通过、阶段、轮岗各站、当前站与下一站
 * - next：深色「下一步」卡——main 是现在最该做的一件事（未完成的下一步行动；没有时是主推项目的当前里程碑），
 *   then 是「做完接着做」（第二条行动；只有一条行动时是另一个里程碑上的当前里程碑）
 */
async function traineeHomeV3(db: Db, me: string, base: { pending: unknown[]; nextActions: Record<string, unknown>[]; focus: Awaited<ReturnType<typeof activeProjects>>[number] | null }) {
  const { pending, nextActions, focus } = base;
  const blockers = await q(db,
    `select b.id as "blockerId", b.reason, b.created_at as "createdAt", b.handler_id as "handlerId", hu.name as "handlerName",
            m.id as "milestoneId", m.name as "milestoneName", p.id as "projectId", p.name as "projectName"
     from blocker b join milestone m on m.id = b.milestone_id join project p on p.id = m.project_id left join app_user hu on hu.id = b.handler_id
     where b.status = 'open' and exists (select 1 from project_member pm where pm.project_id = p.id and pm.trainee_id = $1)
     order by b.created_at, b.id`, [me]);
  const pendingFeedback = (await feedbackItems(db, 'f.trainee_id = $1 and f.verify_next', [me])).filter(f => f.pending);

  const WEEK0 = `(date_trunc('week', now() at time zone 'Asia/Shanghai'))::date`;
  const at = (days: number) => `((${WEEK0} + ${days})::timestamp at time zone 'Asia/Shanghai')`;
  const weekItems = await q(db,
    `select 'milestone' as kind, m.id, m.name as title, m.due_at as "dueAt", m.status, m.status in ('submitted', 'passed') as done,
            m.id as "milestoneId", p.id as "projectId", null as "taskId"
     from milestone m join project p on p.id = m.project_id
     where p.status <> 'ended' and m.status <> 'cancelled' and m.due_at >= ${at(0)} and m.due_at < ${at(7)}
       and exists (select 1 from project_member pm where pm.project_id = p.id and pm.trainee_id = $1)
     union all
     select 'task', t.id, t.name, t.due_at, t.status, t.status in ('submitted', 'passed'), null, t.project_id, t.id
     from task_instance t join personal_path pp on pp.id = t.path_id
     where pp.user_id = $1 and t.status <> 'cancelled' and t.due_at >= ${at(0)} and t.due_at < ${at(7)}
     order by 4, 2`, [me]);
  const switches = await q(db,
    `select s.id, md.name as module, to_char(s.start_date, 'YYYY-MM-DD') as "startDate"
     from personal_module s join personal_path pp on pp.id = s.path_id join module md on md.id = s.module_id
     where pp.user_id = $1 and s.start_date > ${WEEK0} and s.start_date < ${WEEK0} + 14 order by s.start_date`, [me]);
  const [w] = await q<{ start: string }>(db, `select to_char(${WEEK0}, 'YYYY-MM-DD') as start`);

  // 行动所在里程碑的截止与状态，深色卡上显示倒计时
  const msIds = nextActions.map(a => a.milestoneId).filter(Boolean);
  const ms = await q<{ id: string; dueAt: Date; status: string }>(db, 'select id, due_at as "dueAt", status from milestone where id = any($1)', [msIds]);
  const steps: Record<string, unknown>[] = nextActions.map(a => {
    const m = ms.find(x => x.id === a.milestoneId);
    return { kind: 'action', actionId: a.id, actionKind: a.kind, content: a.content, reviewedAt: a.reviewedAt, version: a.version,
      milestoneId: a.milestoneId, taskId: a.taskId, subjectName: a.subjectName, projectId: a.projectId, projectName: a.projectName,
      dueAt: m?.dueAt ?? null, milestoneStatus: m?.status ?? null };
  });
  const cm = focus?.currentMilestone;
  if (cm && steps.length < 2 && !steps.some(x => x.milestoneId === cm.id)) {
    steps.push({ kind: 'milestone', milestoneId: cm.id, subjectName: cm.name, milestoneStatus: cm.status, blocked: cm.blocked,
      projectId: focus.id, projectName: focus.name, dueAt: cm.dueAt, reviewerName: (pending as { milestoneId?: string; reviewerName?: string }[]).find(x => x.milestoneId === cm.id)?.reviewerName ?? null });
  }

  return {
    next: { main: steps[0] ?? null, then: steps[1] ?? null },
    waiting: { reviews: pending, blockers },
    toFix: { total: pendingFeedback.length, items: await withProject(db, pendingFeedback.slice(-3).reverse()) },
    week: { start: w.start, items: weekItems, switches },
    growth: await growthSummary(db, me),
  };
}

/** 反馈条目补上所在里程碑的项目，前端拼里程碑页的链接 */
async function withProject<T extends Record<string, unknown>>(db: Db, items: T[]) {
  const ids = items.map(f => f.milestoneId).filter(Boolean);
  const rows = ids.length ? await q<{ id: string; projectId: string }>(db, 'select id, project_id as "projectId" from milestone where id = any($1)', [ids]) : [];
  return items.map(f => ({ ...f, projectId: rows.find(r => r.id === f.milestoneId)?.projectId ?? null }));
}

/** 进度卡：路径的时间与完成情况、阶段、轮岗各站（一个阶段有两站以上的算轮岗）、当前站与下一站；没有个人路径时为空 */
async function growthSummary(db: Db, me: string) {
  const [p] = await q<{ id: string; day: number; totalDays: number }>(db,
    `select p.id, (${TODAY} - p.start_date + 1)::int as day, (p.end_date - p.start_date + 1)::int as "totalDays"
     from personal_path p join cohort c on c.id = p.cohort_id where p.user_id = $1 order by c.start_date desc limit 1`, [me]);
  if (!p) return null;
  const [tasks] = await q<{ total: number; due: number; passed: number }>(db,
    `select count(*) filter (where status <> 'cancelled')::int as total,
            count(*) filter (where status <> 'cancelled' and due_at <= now())::int as due,
            count(*) filter (where status = 'passed')::int as passed
     from task_instance where path_id = $1`, [p.id]);
  const stations = await q<{ id: string; no: number; module: string; stageNo: number; stage: string; startDate: string; endDate: string;
    days: number; dayNo: number; pos: 'past' | 'current' | 'future'; settled: boolean }>(db,
    `select s.id, s.no, md.name as module, st.no as "stageNo", st.name as stage,
            to_char(s.start_date, 'YYYY-MM-DD') as "startDate", to_char(s.end_date, 'YYYY-MM-DD') as "endDate",
            (s.end_date - s.start_date + 1)::int as days, (${TODAY} - s.start_date + 1)::int as "dayNo",
            case when s.end_date < ${TODAY} then 'past' when s.start_date <= ${TODAY} then 'current' else 'future' end as pos,
            not exists (select 1 from task_instance t where t.station_id = s.id and t.status not in ('passed', 'cancelled')) as settled
     from personal_module s join module md on md.id = s.module_id join stage st on st.id = md.stage_id
     where s.path_id = $1 order by s.no`, [p.id]);
  const stageNos = [...new Set(stations.map(s => s.stageNo))];
  const stages = stageNos.map(no => {
    const ss = stations.filter(s => s.stageNo === no);
    return { no, name: ss[0].stage, state: ss.every(s => s.pos === 'past') ? 'done' : ss.some(s => s.pos === 'current') ? 'cur' : 'todo' };
  });
  const rotationStage = stageNos.find(no => stations.filter(s => s.stageNo === no).length > 1);
  const station = (s: (typeof stations)[number]) => ({ id: s.id, module: s.module, startDate: s.startDate, endDate: s.endDate, pos: s.pos, settled: s.settled });
  const cur = stations.find(s => s.pos === 'current');
  const next = stations.find(s => s.pos === 'future');
  return {
    day: p.day, totalDays: p.totalDays,
    tasks,
    stages,
    rotation: stations.filter(s => s.stageNo === rotationStage).map(station),
    current: cur ? { ...station(cur), days: cur.days, dayNo: cur.dayNo } : null,
    next: next ? station(next) : null,
  };
}

/** 决策看板的两条基础信号（PRD 10.2；口径见下篇 R7，这里只做标注清楚的计数） */
export async function dashboard(db: Db, actor: Actor) {
  need(actor, { mentorOnly: true });
  const repeatedRevise = await q(db,
    `select m.id as "milestoneId", m.name as "milestoneName", p.id as "projectId", p.name as "projectName"
     from milestone m join project p on p.id = m.project_id where ${twiceReviseSql('milestone_id', 'm.id')} order by p.name, m.name`);
  const pendingByMentor = await q(db,
    `select u.id as "mentorId", u.name as "mentorName", count(s.id)::int as pending
     from app_user u left join submission s on s.reviewer_id = u.id and s.review_state = 'pending'
     where u.role = 'mentor' and u.stopped_at is null group by u.id, u.name order by u.id`);
  return {
    signals: [
      { key: 'repeated-revise', label: '某项目连续两次未通过同一节点', note: '同一节点最近两次评审都是需改进', items: repeatedRevise },
      { key: 'pending-by-mentor', label: '每位带教当前待评审的数量', note: '评审负责人是该带教、状态为待评审的成果版本数', items: pendingByMentor },
    ],
  };
}

/** 带教首页（W2）：待我判断、我带的人；有管理权限时加决策看板 */
async function mentorHome(db: Db, actor: Actor) {
  const t = await todo(db, actor);
  const mentees = await menteeIds(db, actor.id);
  const people = await Promise.all(mentees.map(async id => {
    const [user] = await q<{ id: string; name: string }>(db, 'select id, name from app_user where id = $1', [id]);
    const projects = await activeProjects(db, id);
    const [risk] = await q<{ blocked: boolean; repeatedRevise: boolean }>(db,
      `select exists (select 1 from project_member pm join milestone m on m.project_id = pm.project_id where pm.trainee_id = $1 and ${blockedSql('m.id')}) as blocked,
              exists (select 1 from project_member pm join milestone m on m.project_id = pm.project_id where pm.trainee_id = $1 and ${twiceReviseSql('milestone_id', 'm.id')})
              or exists (select 1 from task_instance t join personal_path pp on pp.id = t.path_id where pp.user_id = $1 and ${twiceReviseSql('task_id', 't.id')}) as "repeatedRevise"`, [id]);
    return {
      ...user,
      station: await currentStation(db, id),
      focus: projects.find(p => p.status === 'active') ?? null,
      lastFeedback: (await reviews(db, relatedSubmissionSql('s', '$1'), [id], 1))[0] ?? null,
      risks: risk,
    };
  }));
  return {
    role: 'mentor' as const,
    // 待我判断：我是评审负责人的待评审成果、待确认立项、未响应的受阻
    awaiting: { toReview: t.toReview, projectsToConfirm: t.projectsToConfirm, blockersToRespond: t.blockersToRespond },
    mentees: people,
    dashboard: actor.isAdmin ? await dashboard(db, actor) : null,
  };
}

/** 首页：按登录身份给管培生版或带教版 */
export async function home(db: Db, actor: Actor) {
  if (actor.role === 'trainee') {
    need(actor, { traineeIds: [actor.id] });
    return traineeHome(db, actor.id);
  }
  need(actor, {});
  return mentorHome(db, actor);
}
