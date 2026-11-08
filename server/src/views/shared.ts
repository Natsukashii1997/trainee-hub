// 查询层共用的小工具（PRD 第 11 节：页面直接查事实对象，不存副本）。
// 时间字段：timestamptz 原样返回（JSON 里是 ISO UTC，前端按北京时间显示）；date 字段一律 to_char 成 YYYY-MM-DD，避免被当成本地零点。
import type pg from 'pg';
import { type Access, type Actor, authorize } from '../authorize.ts';
import { CommandError } from '../commands/kit.ts';

export type Db = pg.Pool | pg.PoolClient;

/** 北京时间的今天 */
export const TODAY = "(now() at time zone 'Asia/Shanghai')::date";

export async function q<T = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query(sql, params)).rows as T[];
}

/** 每个查询都先过统一授权入口 */
export function need(actor: Actor, access: Omit<Extract<Access, { kind: 'read' }>, 'kind'>) {
  const gate = authorize(actor, { kind: 'read', ...access });
  if (!gate.ok) throw new CommandError(gate.status, gate.reason);
}

export const notFound = (what: string) => new CommandError(404, `没有这个${what}`);

/** 节点有没有受阻标记（有未解除的受阻记录）；参数是节点 id 的 SQL 表达式 */
export const blockedSql = (milestone: string) => `exists (select 1 from blocker b where b.milestone_id = ${milestone} and b.status <> 'resolved')`;

/** 与某位管培生有关的成果版本：本人提交的、本人任务上的、本人参与项目里节点上的；s 是成果版本的别名，p 是管培生 id 参数 */
export const relatedSubmissionSql = (s: string, p: string) => `(
  ${s}.submitter_id = ${p}
  or exists (select 1 from task_instance t0 join personal_path pp0 on pp0.id = t0.path_id where t0.id = ${s}.task_id and pp0.user_id = ${p})
  or exists (select 1 from milestone m0 join project_member pm0 on pm0.project_id = m0.project_id where m0.id = ${s}.milestone_id and pm0.trainee_id = ${p}))`;

/** 我带的人：与我有生效中带教关系（任何范围）的管培生 */
export async function menteeIds(db: Db, mentorId: string): Promise<string[]> {
  const rows = await q<{ id: string }>(db,
    `select distinct trainee_id as id from mentorship where mentor_id = $1 and start_date <= ${TODAY} and (end_date is null or end_date >= ${TODAY}) order by 1`, [mentorId]);
  return rows.map(r => r.id);
}

export interface Station { id: string; no: number; startDate: string; endDate: string; module: string; line: string | null; stageNo: number; stage: string }

/** 今天所在的站（不在任何站的时段里时为空） */
export async function currentStation(db: Db, userId: string): Promise<Station | null> {
  const rows = await q<Station>(db,
    `select s.id, s.no, to_char(s.start_date, 'YYYY-MM-DD') as "startDate", to_char(s.end_date, 'YYYY-MM-DD') as "endDate",
            md.name as module, md.line, st.no as "stageNo", st.name as stage
     from personal_module s join personal_path p on p.id = s.path_id join module md on md.id = s.module_id join stage st on st.id = md.stage_id
     where p.user_id = $1 and s.start_date <= ${TODAY} and s.end_date >= ${TODAY} order by s.no limit 1`, [userId]);
  return rows[0] ?? null;
}

export interface MilestoneBrief { id: string; name: string; status: string; dueAt: Date; blocked: boolean }

/** 项目的当前节点：最早截止、还没通过也没取消的那个 */
export async function currentMilestone(db: Db, projectId: string): Promise<MilestoneBrief | null> {
  const rows = await q<MilestoneBrief>(db,
    `select m.id, m.name, m.status, m.due_at as "dueAt", ${blockedSql('m.id')} as blocked from milestone m
     where m.project_id = $1 and m.status not in ('passed', 'cancelled') order by m.due_at, m.id limit 1`, [projectId]);
  return rows[0] ?? null;
}

/** 下一步行动（含来源成果与所属对象）；where 里用 a 指行动 */
export async function actions(db: Db, where: string, params: unknown[]) {
  return q(db,
    `select a.id, a.kind, a.content, a.status, a.resolution, a.done_at as "doneAt", a.owner_id as "ownerId", ow.name as "ownerName",
            a.target_milestone_id as "targetMilestoneId", r.id as "reviewId", r.created_at as "reviewedAt",
            s.id as "submissionId", s.version, s.milestone_id as "milestoneId", s.task_id as "taskId",
            coalesce(m.name, t.name) as "subjectName", m.project_id as "projectId", pj.name as "projectName"
     from next_action a join review r on r.id = a.review_id join submission s on s.id = r.submission_id
     left join milestone m on m.id = s.milestone_id left join project pj on pj.id = m.project_id
     left join task_instance t on t.id = s.task_id left join app_user ow on ow.id = a.owner_id
     where ${where} order by r.created_at, a.id`, params);
}

/** 评审（含成果与所属对象）；where 里用 r 指评审、s 指成果版本 */
export async function reviews(db: Db, where: string, params: unknown[], limit = 50) {
  return q(db,
    `select r.id, r.grade, r.comment, r.key_issue as "keyIssue", r.judgment, r.level, r.created_at as "createdAt",
            r.reviewer_id as "reviewerId", rv.name as "reviewerName",
            s.id as "submissionId", s.version, s.milestone_id as "milestoneId", s.task_id as "taskId",
            coalesce(m.name, t.name) as "subjectName", m.project_id as "projectId", pj.name as "projectName"
     from review r join submission s on s.id = r.submission_id join app_user rv on rv.id = r.reviewer_id
     left join milestone m on m.id = s.milestone_id left join project pj on pj.id = m.project_id
     left join task_instance t on t.id = s.task_id
     where ${where} order by r.created_at desc, r.id limit ${limit}`, params);
}

/** 成果版本时间线（节点详情、任务详情用）：每版带评审、下一步行动、认定 */
export async function submissionTimeline(db: Db, subject: { milestoneId?: string; taskId?: string }) {
  const [col, id] = subject.milestoneId ? ['milestone_id', subject.milestoneId] : ['task_id', subject.taskId];
  const subs = await q<Record<string, unknown> & { id: string }>(db,
    `select s.id, s.version, s.url, s.note, s.change_note as "changeNote", s.channel, s.submitted_at as "submittedAt",
            s.submitter_id as "submitterId", su.name as "submitterName", s.reviewer_id as "reviewerId", rv.name as "reviewerName",
            s.review_state as "reviewState", s.prev_review_id as "prevReviewId"
     from submission s join app_user su on su.id = s.submitter_id join app_user rv on rv.id = s.reviewer_id
     where s.${col} = $1 order by s.version`, [id]);
  if (!subs.length) return [];
  const ids = subs.map(s => s.id);
  const revs = await reviews(db, 's.id = any($1)', [ids]);
  const acts = await actions(db, 's.id = any($1)', [ids]);
  const credits = await q<Record<string, unknown> & { submissionId: string }>(db,
    `select c.submission_id as "submissionId", c.task_id as "taskId", t.name as "taskName", pp.user_id as "traineeId", u.name as "traineeName",
            c.status, c.credited_by as "creditedBy", c.credited_at as "creditedAt"
     from submission_credit c join task_instance t on t.id = c.task_id join personal_path pp on pp.id = t.path_id join app_user u on u.id = pp.user_id
     where c.submission_id = any($1) order by u.id, t.id`, [ids]);
  return subs.map(s => {
    const review = revs.find(r => r.submissionId === s.id) ?? null;
    return {
      ...s,
      review: review && { ...review, actions: acts.filter(a => a.reviewId === review.id) },
      credits: credits.filter(c => c.submissionId === s.id),
    };
  });
}

/** 截止调整记录 */
export const deadlineChanges = (db: Db, type: 'milestone' | 'task', id: string) => q(db,
  `select d.id, d.old_due_at as "oldDueAt", d.new_due_at as "newDueAt", d.reason, d.actor_id as "actorId", u.name as "actorName", d.created_at as "createdAt"
   from deadline_change d join app_user u on u.id = d.actor_id where d.subject_type = $1 and d.subject_id = $2 order by d.created_at`, [type, id]);

export async function userName(db: Db, id: string | null): Promise<{ id: string; name: string } | null> {
  if (!id) return null;
  return (await q<{ id: string; name: string }>(db, 'select id, name from app_user where id = $1', [id]))[0] ?? null;
}
