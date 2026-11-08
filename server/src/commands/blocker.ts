// 受阻的命令（PRD 4.2、4.4、4.5、5.2；issue #39）：C10 标记受阻、C11 响应受阻、C12 解除受阻。
// 受阻记录与响应是挂在节点上的独立对象；节点的「受阻」是标记（有未解除的受阻记录），不改节点状态。
// 响应 ≠ 解除：响应后仍受阻，只有解除才去掉标记。
import type pg from 'pg';
import type { CommandId } from '../authorize.ts';
import { projectMentor } from '../mentor.ts';
import { CommandError, type Handler, text } from './kit.ts';
import { lockMilestone, STATUS_CN } from './project.ts';

/** 锁住受阻记录，连带取出所属项目与成员 */
async function lockBlocker(tx: pg.PoolClient, blockerId: string) {
  const r = await tx.query<{ status: string; milestone_id: string; project_id: string }>(
    'select b.status, b.milestone_id, m.project_id from blocker b join milestone m on m.id = b.milestone_id where b.id = $1 for update of b', [blockerId]);
  if (!r.rows[0]) throw new CommandError(404, '没有这条受阻记录');
  const m = await tx.query<{ trainee_id: string }>('select trainee_id from project_member where project_id = $1', [r.rows[0].project_id]);
  return { ...r.rows[0], members: m.rows.map(x => x.trainee_id) };
}

const unresolved = (status: string) => (status === 'resolved' ? '这条受阻记录已经解除' : null);

const C10: Handler = async (tx, actor, input) => {
  const milestoneId = text(input, 'milestoneId', '关键节点') as string;
  const reason = text(input, 'reason', '受阻原因') as string;
  const decider = text(input, 'decider', '需要谁决定', false);
  const handlerInput = text(input, 'handlerId', '处理责任人', false);
  const m = await lockMilestone(tx, milestoneId);
  if (handlerInput && !(await tx.query('select 1 from app_user where id = $1', [handlerInput])).rows[0]) throw new CommandError(400, '处理责任人不存在');
  const open = await tx.query('select 1 from blocker where milestone_id = $1 and status <> $2', [milestoneId, 'resolved']);
  return {
    traineeIds: m.members,
    precondition: () => {
      if (m.status === 'passed' || m.status === 'cancelled') return `节点已经「${STATUS_CN[m.status]}」，不能标记受阻`;
      if (open.rows[0]) return '这个节点已经有一条未解除的受阻记录';
      return null;
    },
    apply: async () => {
      // 处理责任人默认是项目带教（PRD 5.2，按 2.4 推出）
      const handlerId = handlerInput ?? (await projectMentor(tx, m.project_id));
      const { rows } = await tx.query<{ id: string }>(
        'insert into blocker (milestone_id, reason, decider, handler_id, created_by) values ($1, $2, $3, $4, $5) returning id', [milestoneId, reason, decider, handlerId, actor.id]);
      const id = rows[0].id;
      return { result: { blockerId: id, status: 'open', handlerId }, events: [{ subjectType: 'blocker', subjectId: id, projectId: m.project_id, payload: { milestoneId, reason, decider, handlerId } }] };
    },
  };
};

const C11: Handler = async (tx, actor, input) => {
  const blockerId = text(input, 'blockerId', '受阻记录') as string;
  const content = text(input, 'content', '响应内容') as string;
  const b = await lockBlocker(tx, blockerId);
  return {
    traineeIds: b.members,
    precondition: () => unresolved(b.status),
    apply: async () => {
      const { rows } = await tx.query<{ id: string }>('insert into blocker_response (blocker_id, content, responder_id) values ($1, $2, $3) returning id', [blockerId, content, actor.id]);
      await tx.query("update blocker set status = 'responded' where id = $1", [blockerId]);
      return {
        result: { blockerId, responseId: rows[0].id, status: 'responded' },
        events: [{ subjectType: 'blocker', subjectId: blockerId, projectId: b.project_id, payload: { milestoneId: b.milestone_id, responseId: rows[0].id } }],
      };
    },
  };
};

const C12: Handler = async (tx, actor, input) => {
  const blockerId = text(input, 'blockerId', '受阻记录') as string;
  const note = text(input, 'note', '解除说明', false);
  const b = await lockBlocker(tx, blockerId);
  return {
    traineeIds: b.members,
    precondition: () => unresolved(b.status),
    apply: async () => {
      await tx.query("update blocker set status = 'resolved', resolved_by = $2, resolved_at = now(), resolve_note = $3 where id = $1", [blockerId, actor.id, note]);
      return { result: { blockerId, status: 'resolved' }, events: [{ subjectType: 'blocker', subjectId: blockerId, projectId: b.project_id, payload: { milestoneId: b.milestone_id, note } }] };
    },
  };
};

export const blockerHandlers: Partial<Record<CommandId, Handler>> = { C10, C11, C12 };
