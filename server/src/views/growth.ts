// 培养成长的查询（PRD 第 6、8 节；页面清单 T1–T3）：我的路径、任务详情、成长档案、成长时间线。
import { type Actor, COMMANDS } from '../authorize.ts';
import { currentStation, type Db, deadlineChanges, need, notFound, q, submissionTimeline } from './shared.ts';

async function trainee(db: Db, userId: string) {
  const [u] = await q<{ id: string; name: string; cohortId: string | null; cohortName: string | null }>(db,
    `select u.id, u.name, u.cohort_id as "cohortId", c.name as "cohortName" from app_user u left join cohort c on c.id = u.cohort_id where u.id = $1 and u.role = 'trainee'`, [userId]);
  if (!u) throw notFound('管培生');
  return u;
}

/** 我的路径（T1）：期次、各站（当前站标出）、每站的培养任务 */
export async function path(db: Db, actor: Actor, userId: string) {
  need(actor, { traineeIds: [userId] });
  const u = await trainee(db, userId);
  const [p] = await q<{ id: string; startDate: string; endDate: string; status: string; cohort: Record<string, unknown> }>(db,
    `select p.id, to_char(p.start_date, 'YYYY-MM-DD') as "startDate", to_char(p.end_date, 'YYYY-MM-DD') as "endDate", p.status,
            json_build_object('id', c.id, 'name', c.name, 'startDate', to_char(c.start_date, 'YYYY-MM-DD'), 'endDate', to_char(c.end_date, 'YYYY-MM-DD'), 'status', c.status) as cohort
     from personal_path p join cohort c on c.id = p.cohort_id where p.user_id = $1 order by c.start_date desc limit 1`, [userId]);
  if (!p) throw notFound('个人路径');
  const current = await currentStation(db, userId);
  const stations = await q<Record<string, unknown> & { id: string }>(db,
    `select s.id, s.no, to_char(s.start_date, 'YYYY-MM-DD') as "startDate", to_char(s.end_date, 'YYYY-MM-DD') as "endDate",
            md.name as module, md.line, st.no as "stageNo", st.name as stage
     from personal_module s join module md on md.id = s.module_id join stage st on st.id = md.stage_id where s.path_id = $1 order by s.no`, [p.id]);
  const tasks = await q<Record<string, unknown> & { stationId: string }>(db,
    `select t.id, t.station_id as "stationId", t.name, t.output, t.status, t.open_at as "openAt", t.due_at as "dueAt", t.in_project as "inProject",
            t.project_id as "projectId", pj.name as "projectName"
     from task_instance t left join project pj on pj.id = t.project_id where t.path_id = $1 order by t.due_at, t.id`, [p.id]);
  return {
    trainee: u,
    cohort: p.cohort,
    path: { id: p.id, startDate: p.startDate, endDate: p.endDate, status: p.status },
    stations: stations.map(s => ({ ...s, current: s.id === current?.id, tasks: tasks.filter(t => t.stationId === s.id) })),
  };
}

/** 任务详情（T2）：要求、截止与调整；自己提交的成果与评审，或在项目中完成的认定记录 */
export async function taskDetail(db: Db, actor: Actor, id: string) {
  const [t] = await q<Record<string, unknown> & { ownerId: string }>(db,
    `select t.id, t.name, t.note, t.output, t.status, t.open_at as "openAt", t.due_at as "dueAt", t.original_due_at as "originalDueAt",
            t.in_project as "inProject", t.project_id as "projectId", pj.name as "projectName",
            pp.user_id as "ownerId", u.name as "ownerName", t.station_id as "stationId", s.no as "stationNo", md.name as "stationModule"
     from task_instance t join personal_path pp on pp.id = t.path_id join app_user u on u.id = pp.user_id
     left join project pj on pj.id = t.project_id left join personal_module s on s.id = t.station_id left join module md on md.id = s.module_id
     where t.id = $1`, [id]);
  if (!t) throw notFound('培养任务');
  need(actor, { traineeIds: [t.ownerId] });
  const milestones = await q(db,
    `select m.id, m.name, m.status, m.project_id as "projectId", p.name as "projectName"
     from milestone_task mt join milestone m on m.id = mt.milestone_id join project p on p.id = m.project_id where mt.task_id = $1 order by m.due_at, m.id`, [id]);
  const credits = await q(db,
    `select c.id, c.status, c.credited_by as "creditedBy", cu.name as "creditedByName", c.credited_at as "creditedAt",
            s.id as "submissionId", s.version, s.milestone_id as "milestoneId", m.name as "milestoneName", m.project_id as "projectId", p.name as "projectName"
     from submission_credit c join submission s on s.id = c.submission_id left join milestone m on m.id = s.milestone_id
     left join project p on p.id = m.project_id left join app_user cu on cu.id = c.credited_by where c.task_id = $1 order by c.credited_at`, [id]);
  return {
    ...t,
    deadlineChanges: await deadlineChanges(db, 'task', id),
    submissions: await submissionTimeline(db, { taskId: id }),
    milestones,
    credits,
  };
}

/** 成长档案（T3 的 A 级部分）：当前阶段与站、项目经历、通过的成果、能力证据（按能力项，点回来源） */
export async function profile(db: Db, actor: Actor, userId: string) {
  need(actor, { traineeIds: [userId] });
  const u = await trainee(db, userId);
  const projects = await q(db,
    `select p.id, p.name, p.goal, p.status, p.end_type as "endType", pm.role, c.delivery, c.verification_status as "verificationStatus", c.verification_result as "verificationResult"
     from project_member pm join project p on p.id = pm.project_id left join project_conclusion c on c.project_id = p.id
     where pm.trainee_id = $1 order by p.created_at, p.id`, [userId]);
  // 通过的成果（PRD 8.4）= 本人提交且已通过的成果版本 + 对本人培养任务的认定记录
  const passedSubmissions = await q(db,
    `select 'submission' as kind, s.id as "submissionId", s.version, r.grade, r.created_at as "at",
            s.milestone_id as "milestoneId", s.task_id as "taskId", coalesce(m.name, t.name) as "subjectName", m.project_id as "projectId", pj.name as "projectName"
     from submission s join review r on r.submission_id = s.id left join milestone m on m.id = s.milestone_id
     left join project pj on pj.id = m.project_id left join task_instance t on t.id = s.task_id
     where s.submitter_id = $1 and r.grade in ('优秀', '达标')`, [userId]);
  const credits = await q(db,
    `select 'credit' as kind, s.id as "submissionId", s.version, c.credited_at as "at", c.task_id as "taskId", t.name as "taskName",
            s.milestone_id as "milestoneId", m.name as "subjectName", m.project_id as "projectId", pj.name as "projectName"
     from submission_credit c join task_instance t on t.id = c.task_id join personal_path pp on pp.id = t.path_id
     join submission s on s.id = c.submission_id left join milestone m on m.id = s.milestone_id left join project pj on pj.id = m.project_id
     where pp.user_id = $1 and c.status = 'credited'`, [userId]);
  const passed = [...passedSubmissions, ...credits].sort((a, b) => (b.at as Date).getTime() - (a.at as Date).getTime());
  // 能力证据：按能力项（同一编号的各版本归在一起，名称取当前版本），每条点回来源节点或任务与版本
  const items = await q<{ no: number; name: string; active: boolean }>(db,
    'select distinct on (no) no, name, active from competency_item order by no, active desc, version desc');
  const evidence = await q<Record<string, unknown> & { no: number }>(db,
    `select e.id, ci.no, ci.version as "itemVersion", e.summary, e.detail, e.judgment, e.status, e.confirmed_by as "confirmedBy", cu.name as "confirmedByName",
            e.confirmed_at as "confirmedAt", e.source_type as "sourceType", e.source_id as "sourceId",
            s.id as "submissionId", s.version, s.milestone_id as "milestoneId", s.task_id as "taskId", coalesce(m.name, t.name) as "subjectName",
            m.project_id as "projectId", pj.name as "projectName"
     from competency_evidence e join competency_item ci on ci.id = e.item_id left join app_user cu on cu.id = e.confirmed_by
     left join review r on e.source_type = 'review' and r.id = e.source_id
     left join submission s on s.id = case e.source_type when 'review' then r.submission_id when 'submission' then e.source_id end
     left join milestone m on m.id = s.milestone_id left join project pj on pj.id = m.project_id left join task_instance t on t.id = s.task_id
     where e.trainee_id = $1 and e.status = 'confirmed' order by e.confirmed_at, e.id`, [userId]);
  return {
    trainee: u,
    station: await currentStation(db, userId),
    projects,
    passed,
    competencies: items
      .map(i => ({ ...i, evidence: evidence.filter(e => e.no === i.no) }))
      .filter(i => i.active || i.evidence.length),
  };
}

/** 成长时间线（T3）：本人相关的事件，加上本人参与项目的项目事件；从事件日志投影 */
export async function timeline(db: Db, actor: Actor, userId: string) {
  need(actor, { traineeIds: [userId] });
  await trainee(db, userId);
  const rows = await q<Record<string, unknown> & { type: string }>(db,
    `select e.id, e.type, e.subject_type as "subjectType", e.subject_id as "subjectId", e.person_id as "personId",
            e.project_id as "projectId", p.name as "projectName", e.actor_id as "actorId", u.name as "actorName", e.source, e.occurred_at as "occurredAt"
     from event_log e left join project p on p.id = e.project_id left join app_user u on u.id = e.actor_id
     where e.person_id = $1 or e.project_id in (select project_id from project_member where trainee_id = $1)
     order by e.occurred_at desc, e.id limit 200`, [userId]);
  return rows.map(r => ({ ...r, label: (COMMANDS as Record<string, string>)[r.type] ?? r.type }));
}
