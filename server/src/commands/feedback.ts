// 反馈条目与验证（PRD v3.0 总纲 6.2、7.1–7.3；issue #45）：C08 评审时分条写反馈、C40 验证反馈共用的校验与写入。
// 命令本身登记在 review.ts（要用那里的主挂靠对象）。
import type pg from 'pg';
import { CommandError, type EventInfo, text } from './kit.ts';

export const NATURES = { standard: '通用标准问题', personal: '个人发展问题', situational: '情境性判断' } as const;
export const RESULTS = { improved: '已改善', persisting: '仍存在', not_covered: '这次没涉及' } as const;
export type VerifyResult = keyof typeof RESULTS;

export interface FeedbackInput { content: string; tags: string[]; nature: string | null; needsAction: boolean; verifyNext: boolean }
export interface VerificationInput { feedbackId: string; result: VerifyResult }

function list(input: Record<string, unknown>, key: string, label: string): Record<string, unknown>[] {
  const v = input[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some(x => !x || typeof x !== 'object')) throw new CommandError(400, `「${label}」应为列表`);
  return v as Record<string, unknown>[];
}

function flag(o: Record<string, unknown>, key: string, label: string): boolean {
  const v = o[key];
  if (v === undefined || v === null) return false;
  if (typeof v !== 'boolean') throw new CommandError(400, `「${label}」应为是或否`);
  return v;
}

/** 评审里的反馈条目：0 到多条；每条一句内容，最多两个自由标签，性质可空 */
export function parseFeedback(input: Record<string, unknown>): FeedbackInput[] {
  return list(input, 'feedback', '反馈').map((o, i) => {
    const n = `第 ${i + 1} 条反馈`;
    const tags = o.tags ?? [];
    if (!Array.isArray(tags) || tags.some(t => typeof t !== 'string')) throw new CommandError(400, `${n}的标签应为文字列表`);
    const clean = [...new Set((tags as string[]).map(t => t.trim()).filter(Boolean))];
    if (clean.length > 2) throw new CommandError(400, `${n}最多写两个标签`);
    const nature = text(o, 'nature', `${n}的性质`, false);
    if (nature && !Object.hasOwn(NATURES, nature)) throw new CommandError(400, `${n}的性质只能是通用标准问题、个人发展问题或情境性判断`);
    return { content: text(o, 'content', `${n}的内容`) as string, tags: clean, nature, needsAction: flag(o, 'needsAction', `${n}的「需要行动」`), verifyNext: flag(o, 'verifyNext', `${n}的「下次验证」`) };
  });
}

export function parseResult(o: Record<string, unknown>): VerifyResult {
  const result = text(o, 'result', '验证结果') as string;
  if (!Object.hasOwn(RESULTS, result)) throw new CommandError(400, '验证结果只能是已改善、仍存在或这次没涉及');
  return result as VerifyResult;
}

/** 评审时顺手验证的上次反馈：每条反馈一个结果 */
export function parseVerifications(input: Record<string, unknown>): VerificationInput[] {
  const items = list(input, 'verifications', '验证结果').map(o => ({ feedbackId: text(o, 'feedbackId', '反馈') as string, result: parseResult(o) }));
  if (new Set(items.map(v => v.feedbackId)).size !== items.length) throw new CommandError(400, '同一条反馈只能给一个验证结果');
  return items;
}

/** 写入一次评审的反馈条目，返回编号 */
export async function insertFeedback(tx: pg.PoolClient, items: FeedbackInput[], at: { traineeId: string; reviewId: string; submissionId: string; milestoneId: string | null; actorId: string }): Promise<string[]> {
  const ids: string[] = [];
  for (const [i, f] of items.entries()) {
    const { rows } = await tx.query<{ id: string }>(
      `insert into feedback_item (trainee_id, source, review_id, submission_id, milestone_id, no, content, tags, nature, needs_action, verify_next, created_by)
       values ($1, 'review', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
      [at.traineeId, at.reviewId, at.submissionId, at.milestoneId, i + 1, f.content, f.tags, f.nature, f.needsAction, f.verifyNext, at.actorId]);
    ids.push(rows[0].id);
  }
  return ids;
}

/** 在哪份成果上验证 */
export interface VerifyTarget { id: string; version: number; submittedAt: Date; submitterId: string; projectId: string | null; traineeIds: string[] }

/**
 * 准备一组验证：锁住反馈并读出判断要用的信息。
 * problem() 返回不能验证的中文原因（都能验证时为 null）；apply() 写验证记录，返回每条验证各自的事件（事件类型 C40）。
 */
export async function prepareVerifications(tx: pg.PoolClient, items: VerificationInput[], target: VerifyTarget, actorId: string) {
  const { rows } = await tx.query<{ id: string; trainee_id: string; verify_next: boolean; submission_id: string | null; created_at: Date; improved: boolean; here: boolean }>(
    `select f.id, f.trainee_id, f.verify_next, f.submission_id, f.created_at,
            exists (select 1 from feedback_verification v where v.feedback_id = f.id and v.result = 'improved') as improved,
            exists (select 1 from feedback_verification v where v.feedback_id = f.id and v.submission_id = $2) as here
     from feedback_item f where f.id = any($1) for update of f`, [items.map(v => v.feedbackId), target.id]);
  if (rows.length !== items.length) throw new CommandError(404, '没有这条反馈');
  const related = new Set([target.submitterId, ...target.traineeIds]);
  return {
    traineeIds: [...new Set(rows.map(f => f.trainee_id))],
    problem: (): string | null => {
      for (const f of rows) {
        if (!f.verify_next) return '这条反馈没有标「下次验证」';
        if (f.improved) return '这条反馈已经验证为已改善';
        if (f.submission_id === target.id || target.submittedAt <= f.created_at) return '反馈只能在它之后提交的成果上验证';
        if (!related.has(f.trainee_id)) return '这份成果和这条反馈所属的管培生无关';
        if (f.here) return '这条反馈在这一版成果上已经验证过';
      }
      return null;
    },
    apply: async (): Promise<(EventInfo & { type: 'C40' })[]> => {
      const events: (EventInfo & { type: 'C40' })[] = [];
      for (const v of items) {
        await tx.query('insert into feedback_verification (feedback_id, submission_id, result, verified_by) values ($1, $2, $3, $4)', [v.feedbackId, target.id, v.result, actorId]);
        const f = rows.find(x => x.id === v.feedbackId) as (typeof rows)[number];
        events.push({ type: 'C40', subjectType: 'feedback_item', subjectId: v.feedbackId, personId: f.trainee_id, projectId: target.projectId, payload: { submissionId: target.id, version: target.version, result: v.result } });
      }
      return events;
    },
  };
}
