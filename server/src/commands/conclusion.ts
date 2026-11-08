// 项目结论与结项的命令（PRD 4.2、4.5、5.3；issue #40）：C14 填写项目结论、C15 确认结项、C19 补记业务验证。
// 交付结论与业务验证分开记：交付完成 ≠ 业务效果已验证（PRD 4.4）；结项后仍可补记业务验证。
import type pg from 'pg';
import type { CommandId } from '../authorize.ts';
import { CommandError, type Handler, ids, text, time } from './kit.ts';
import { STATUS_CN } from './project.ts';

const DELIVERY = ['met', 'partial', 'unmet'];
const VERIFY_STATUS = ['unverified', 'verified', 'na'];
const VERIFY_RESULT = ['met', 'partial', 'unmet', 'unknown'];

interface Verification { status: string; result: string | null; source: string | null; evidenceUrl: string | null; confirmer: string | null; confirmedAt: string | null }

function oneOf(input: Record<string, unknown>, key: string, label: string, allowed: string[], required: boolean): string | null {
  const v = text(input, key, label, required);
  if (v !== null && !allowed.includes(v)) throw new CommandError(400, `「${label}」只能是 ${allowed.join(' / ')}`);
  return v;
}

/** 业务验证四个字段（验证状态、验证结论、验证来源、验证证据）；验证结论只在「已验证」时填 */
function parseVerification(input: Record<string, unknown>): Verification {
  const status = oneOf(input, 'verificationStatus', '验证状态', VERIFY_STATUS, true) as string;
  const result = oneOf(input, 'verificationResult', '验证结论', VERIFY_RESULT, false);
  if (status === 'verified' && !result) throw new CommandError(400, '验证状态为已验证时要填验证结论');
  if (status !== 'verified' && result) throw new CommandError(400, '只有已验证时才填验证结论');
  return {
    status, result,
    source: text(input, 'verificationSource', '验证来源', false),
    evidenceUrl: text(input, 'verificationEvidenceUrl', '验证证据链接', false),
    confirmer: text(input, 'verificationConfirmer', '确认人', false),
    confirmedAt: input.verificationConfirmedAt == null ? null : time(input, 'verificationConfirmedAt', '确认时间'),
  };
}

/** 锁住项目，取出状态、主责与已有的结论 */
async function lockProject(tx: pg.PoolClient, projectId: string) {
  const p = await tx.query<{ status: string }>('select status from project where id = $1 for update', [projectId]);
  if (!p.rows[0]) throw new CommandError(404, '没有这个项目');
  const lead = await tx.query<{ trainee_id: string }>("select trainee_id from project_member where project_id = $1 and role = 'lead'", [projectId]);
  const c = await tx.query<Record<string, unknown>>(
    `select verification_status, verification_result, verification_source, verification_evidence_url, verification_confirmer, verification_confirmed_at
     from project_conclusion where project_id = $1 for update`, [projectId]);
  return { status: p.rows[0].status, lead: lead.rows.map(x => x.trainee_id), conclusion: c.rows[0] ?? null };
}

const verificationOf = (row: Record<string, unknown>): Verification => ({
  status: row.verification_status as string, result: row.verification_result as string | null, source: row.verification_source as string | null,
  evidenceUrl: row.verification_evidence_url as string | null, confirmer: row.verification_confirmer as string | null,
  confirmedAt: row.verification_confirmed_at ? (row.verification_confirmed_at as Date).toISOString() : null,
});

const C14: Handler = async (tx, actor, input) => {
  const projectId = text(input, 'projectId', '项目') as string;
  const delivery = oneOf(input, 'delivery', '交付结论', DELIVERY, true) as string;
  const evidence = ids(input, 'deliveryEvidence', '交付证据');
  const lessons = text(input, 'lessons', '可复用的经验', false) ?? '';
  const suggestions = text(input, 'suggestions', '后续建议', false) ?? '';
  // 不传验证状态时保留已有的业务验证（避免再次保存结论时冲掉补记的验证）
  const verification = input.verificationStatus === undefined ? null : parseVerification(input);
  const p = await lockProject(tx, projectId);
  if (evidence.length) {
    const { rows } = await tx.query('select s.id from submission s join milestone m on m.id = s.milestone_id where s.id = any($1) and m.project_id = $2', [evidence, projectId]);
    if (rows.length !== evidence.length) throw new CommandError(400, '交付证据只能选本项目节点的成果版本');
  }
  return {
    traineeIds: p.lead,
    precondition: () => (p.status === 'ended' ? '项目已结束，结论不能再改；业务验证请用「补记业务验证」' : null),
    apply: async () => {
      const v = verification ?? (p.conclusion ? verificationOf(p.conclusion) : { status: 'unverified', result: null, source: null, evidenceUrl: null, confirmer: null, confirmedAt: null });
      await tx.query(
        `insert into project_conclusion (project_id, delivery, delivery_evidence, verification_status, verification_result, verification_source,
           verification_evidence_url, verification_confirmer, verification_confirmed_at, lessons, suggestions, written_by, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
         on conflict (project_id) do update set delivery = excluded.delivery, delivery_evidence = excluded.delivery_evidence,
           verification_status = excluded.verification_status, verification_result = excluded.verification_result, verification_source = excluded.verification_source,
           verification_evidence_url = excluded.verification_evidence_url, verification_confirmer = excluded.verification_confirmer,
           verification_confirmed_at = excluded.verification_confirmed_at, lessons = excluded.lessons, suggestions = excluded.suggestions,
           written_by = excluded.written_by, updated_at = now()`,
        [projectId, delivery, evidence, v.status, v.result, v.source, v.evidenceUrl, v.confirmer, v.confirmedAt, lessons, suggestions, actor.id]);
      return {
        result: { projectId, delivery, verificationStatus: v.status },
        events: [{ subjectType: 'project', subjectId: projectId, projectId, payload: { delivery, deliveryEvidence: evidence, verification: v } }],
      };
    },
  };
};

const C15: Handler = async (tx, actor, input) => {
  const projectId = text(input, 'projectId', '项目') as string;
  const endType = oneOf(input, 'endType', '结束类型', ['done', 'aborted'], true) as 'done' | 'aborted';
  const abortReason = text(input, 'abortReason', '中止原因', endType === 'aborted');
  const p = await lockProject(tx, projectId);
  return {
    traineeIds: p.lead,
    precondition: () => {
      if (endType === 'done') {
        if (p.status !== 'active') return `项目现在是「${STATUS_CN[p.status]}」，只有推进中的项目能完成结项`;
        if (!p.conclusion) return '还没有项目结论，先填写项目结论再结项';
      } else if (p.status === 'ended') return '项目已经结束';
      return null;
    },
    apply: async () => {
      await tx.query("update project set status = 'ended', end_type = $2, abort_reason = $3, closed_by = $4, closed_at = now() where id = $1",
        [projectId, endType, endType === 'aborted' ? abortReason : null, actor.id]);
      // 确认时列出未结的节点（不拦结项，只提示）
      const { rows } = await tx.query<{ id: string; name: string; status: string }>(
        "select id, name, status from milestone where project_id = $1 and status not in ('passed', 'cancelled') order by original_due_at, id", [projectId]);
      return {
        result: { projectId, status: 'ended', endType, openMilestones: rows },
        events: [{ subjectType: 'project', subjectId: projectId, projectId, payload: { endType, abortReason, openMilestones: rows.map(x => x.id) } }],
      };
    },
  };
};

const C19: Handler = async (tx, actor, input) => {
  const projectId = text(input, 'projectId', '项目') as string;
  const v = parseVerification(input);
  const p = await lockProject(tx, projectId);
  return {
    traineeIds: p.lead,
    precondition: () => (p.conclusion ? null : '还没有项目结论，先填写项目结论'),
    apply: async () => {
      const before = verificationOf(p.conclusion as Record<string, unknown>);
      await tx.query(
        `update project_conclusion set verification_status = $2, verification_result = $3, verification_source = $4, verification_evidence_url = $5,
           verification_confirmer = $6, verification_confirmed_at = $7, verification_updated_by = $8, verification_updated_at = now() where project_id = $1`,
        [projectId, v.status, v.result, v.source, v.evidenceUrl, v.confirmer, v.confirmedAt, actor.id]);
      return {
        result: { projectId, verificationStatus: v.status },
        events: [{ subjectType: 'project', subjectId: projectId, projectId, payload: { from: before, to: v } }],
      };
    },
  };
};

export const conclusionHandlers: Partial<Record<CommandId, Handler>> = { C14, C15, C19 };
