// 项目实践的查询（PRD 第 5 节；页面清单 P1–P3）：项目列表、项目详情、节点详情。
import { type Actor, readScope } from '../authorize.ts';
import { projectMentor } from '../mentor.ts';
import {
  actions, blockedSql, currentMilestone, type Db, deadlineChanges, feedbackItems, need, notFound, q, reviews, submissionTimeline, userName,
} from './shared.ts';

async function members(db: Db, projectId: string) {
  return q<{ id: string; name: string; role: string }>(db,
    `select u.id, u.name, pm.role from project_member pm join app_user u on u.id = pm.trainee_id where pm.project_id = $1 order by (pm.role = 'lead') desc, u.id`, [projectId]);
}

/** 项目列表（P1）：管培生只看自己参与的（草拟的也看得到），带教看全部 */
export async function projectList(db: Db, actor: Actor) {
  const scope = readScope(actor);
  need(actor, { traineeIds: scope ? [scope] : undefined });
  const rows = await q<{ id: string; name: string; status: string; leadId: string; leadName: string; createdAt: Date }>(db,
    `select p.id, p.name, p.status, lm.trainee_id as "leadId", lu.name as "leadName", p.created_at as "createdAt"
     from project p join project_member lm on lm.project_id = p.id and lm.role = 'lead' join app_user lu on lu.id = lm.trainee_id
     where $1::text is null or exists (select 1 from project_member pm where pm.project_id = p.id and pm.trainee_id = $1)
     order by case p.status when 'active' then 0 when 'draft' then 1 else 2 end, p.created_at, p.id`, [scope]);
  return Promise.all(rows.map(async p => {
    const [b] = await q<{ blocked: boolean }>(db, `select exists (select 1 from milestone m where m.project_id = $1 and ${blockedSql('m.id')}) as blocked`, [p.id]);
    return { ...p, currentMilestone: await currentMilestone(db, p.id), blocked: b.blocked, mentor: await userName(db, await projectMentor(db, p.id)) };
  }));
}

/** 项目详情（P2） */
export async function projectDetail(db: Db, actor: Actor, id: string) {
  const [p] = await q<Record<string, unknown>>(db,
    `select p.id, p.name, p.goal, p.acceptance_criteria as "acceptanceCriteria", p.acceptor_name as "acceptorName", p.doc_url as "docUrl", p.status,
            p.created_by as "createdBy", p.created_at as "createdAt", p.confirmed_by as "confirmedBy", p.confirmed_at as "confirmedAt",
            p.end_type as "endType", p.abort_reason as "abortReason", p.closed_by as "closedBy", p.closed_at as "closedAt"
     from project p where p.id = $1`, [id]);
  if (!p) throw notFound('项目');
  const team = await members(db, id);
  need(actor, { traineeIds: team.map(m => m.id) });
  const milestones = await q(db,
    `select m.id, m.name, m.goal, m.status, m.due_at as "dueAt", m.original_due_at as "originalDueAt", ${blockedSql('m.id')} as blocked,
            (select json_build_object('id', s.id, 'version', s.version, 'reviewState', s.review_state) from submission s where s.milestone_id = m.id order by s.version desc limit 1) as "latestSubmission"
     from milestone m where m.project_id = $1 order by m.due_at, m.id`, [id]);
  const tasks = await q(db,
    `select t.id, t.name, t.status, pp.user_id as "ownerId", u.name as "ownerName",
            coalesce((select array_agg(mt.milestone_id order by mt.milestone_id) from milestone_task mt where mt.task_id = t.id), '{}') as "milestoneIds",
            exists (select 1 from submission_credit c where c.task_id = t.id and c.status = 'credited') as credited
     from task_instance t join personal_path pp on pp.id = t.path_id join app_user u on u.id = pp.user_id
     where t.project_id = $1 order by u.id, t.id`, [id]);
  const stations = await q(db,
    `select s.id, s.no, md.name as module, pp.user_id as "traineeId" from project_station ps join personal_module s on s.id = ps.station_id
     join personal_path pp on pp.id = s.path_id join module md on md.id = s.module_id where ps.project_id = $1 order by pp.user_id, s.no`, [id]);
  const [conclusion] = await q(db,
    `select c.delivery, c.delivery_evidence as "deliveryEvidence", c.verification_status as "verificationStatus", c.verification_result as "verificationResult",
            c.verification_source as "verificationSource", c.verification_evidence_url as "verificationEvidenceUrl", c.verification_confirmer as "verificationConfirmer",
            c.verification_confirmed_at as "verificationConfirmedAt", c.verification_updated_by as "verificationUpdatedBy", vu.name as "verificationUpdatedByName",
            c.verification_updated_at as "verificationUpdatedAt", c.lessons, c.suggestions, c.written_by as "writtenBy", wu.name as "writtenByName", c.updated_at as "updatedAt"
     from project_conclusion c join app_user wu on wu.id = c.written_by left join app_user vu on vu.id = c.verification_updated_by where c.project_id = $1`, [id]);
  return {
    ...p,
    members: team,
    stations,
    mentor: await userName(db, await projectMentor(db, id)),
    milestones,
    tasks,
    recentReviews: await reviews(db, 'm.project_id = $1', [id], 5),
    openActions: await actions(db, "m.project_id = $1 and a.status = 'open'", [id]),
    conclusion: conclusion ?? null,
  };
}

/** 节点详情（P3，PRD v3.0 第 1 页）：任务标准、截止调整、成果版本时间线（评审与反馈条目、下一步行动、认定、验证）、
 *  挂在这个里程碑上的口头反馈、成员待验证的反馈、受阻记录与响应、关联的培养任务。
 *  反馈只给本人和带教看（PRD 2.3）：管培生只拿到自己的反馈条目和验证 */
export async function milestoneDetail(db: Db, actor: Actor, id: string) {
  const [m] = await q<Record<string, unknown> & { projectId: string }>(db,
    `select m.id, m.name, m.goal, m.acceptance_criteria as "acceptanceCriteria", m.status, m.due_at as "dueAt", m.original_due_at as "originalDueAt",
            m.common_mistakes as "commonMistakes", m.escalation, m.sample_links as "sampleLinks", m.created_by as "createdBy", mu.name as "createdByName", m.created_at as "createdAt",
            m.cancel_reason as "cancelReason", ${blockedSql('m.id')} as blocked, m.project_id as "projectId", p.name as "projectName", p.goal as "projectGoal", p.status as "projectStatus"
     from milestone m join project p on p.id = m.project_id join app_user mu on mu.id = m.created_by where m.id = $1`, [id]);
  if (!m) throw notFound('关键节点');
  const team = await members(db, m.projectId);
  need(actor, { traineeIds: team.map(x => x.id) });
  const scope = readScope(actor);
  const people = scope ? [scope] : team.map(x => x.id);
  const blockers = await q<Record<string, unknown> & { id: string }>(db,
    `select b.id, b.reason, b.decider, b.status, b.handler_id as "handlerId", hu.name as "handlerName", b.created_by as "createdBy", cu.name as "createdByName",
            b.created_at as "createdAt", b.resolved_by as "resolvedBy", ru.name as "resolvedByName", b.resolved_at as "resolvedAt", b.resolve_note as "resolveNote"
     from blocker b join app_user cu on cu.id = b.created_by left join app_user hu on hu.id = b.handler_id left join app_user ru on ru.id = b.resolved_by
     where b.milestone_id = $1 order by b.created_at, b.id`, [id]);
  const responses = await q<Record<string, unknown> & { blockerId: string }>(db,
    `select r.id, r.blocker_id as "blockerId", r.content, r.responder_id as "responderId", u.name as "responderName", r.created_at as "createdAt"
     from blocker_response r join app_user u on u.id = r.responder_id where r.blocker_id = any($1) order by r.created_at, r.id`, [blockers.map(b => b.id)]);
  const tasks = await q(db,
    `select t.id, t.name, t.status, pp.user_id as "ownerId", u.name as "ownerName",
            (select json_build_object('submissionId', c.submission_id, 'creditedBy', c.credited_by, 'creditedAt', c.credited_at) from submission_credit c where c.task_id = t.id and c.status = 'credited') as credit
     from milestone_task mt join task_instance t on t.id = mt.task_id join personal_path pp on pp.id = t.path_id join app_user u on u.id = pp.user_id
     where mt.milestone_id = $1 order by u.id, t.id`, [id]);
  return {
    ...m,
    members: team,
    mentor: await userName(db, await projectMentor(db, m.projectId)),
    deadlineChanges: await deadlineChanges(db, 'milestone', id),
    submissions: await submissionTimeline(db, { milestoneId: id }, scope),
    verbalFeedback: await feedbackItems(db, "f.source = 'verbal' and f.milestone_id = $1 and f.trainee_id = any($2)", [id, people]),
    pendingFeedback: (await feedbackItems(db, 'f.trainee_id = any($1) and f.verify_next', [people])).filter(f => f.pending),
    // 最新一版待评审时，评审这一版能顺手验证的反馈：提交人在这一版提交之前收到的、还待验证的（与 C08、C40 的前置条件一致，在库里按精确时间比）
    verifiableFeedbackIds: (await q<{ id: string }>(db,
      `select f.id from submission s join feedback_item f on f.trainee_id = s.submitter_id and f.created_at < s.submitted_at and f.verify_next
       where s.milestone_id = $1 and s.review_state = 'pending' and ($2::text is null or f.trainee_id = $2)
         and not exists (select 1 from feedback_verification v where v.feedback_id = f.id and (v.result = 'improved' or v.submission_id = s.id))
       order by f.created_at, f.no, f.id`, [id, scope])).map(r => r.id),
    blockers: blockers.map(b => ({ ...b, responses: responses.filter(r => r.blockerId === b.id) })),
    tasks,
  };
}
