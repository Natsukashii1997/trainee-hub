// 项目与关键节点的命令（PRD 4.2、4.5、第 5 节；issue #37）：C01 创建项目、C02 确认立项、C03 新建关键节点、
// C04 开始节点、C05 调整截止、C13 取消节点。
import type pg from 'pg';
import type { CommandId } from '../authorize.ts';
import { CommandError, type Handler, ids, text, time } from './kit.ts';

const STATUS_CN: Record<string, string> = {
  draft: '草拟', active: '推进中', ended: '已结束',
  todo: '未开始', doing: '进行中', submitted: '待评审', revise: '需修改', passed: '已通过', cancelled: '已取消',
};

/** 锁住项目并取出状态与成员 */
async function lockProject(tx: pg.PoolClient, projectId: string) {
  const p = await tx.query<{ id: string; status: string }>('select id, status from project where id = $1 for update', [projectId]);
  if (!p.rows[0]) throw new CommandError(404, '没有这个项目');
  const m = await tx.query<{ trainee_id: string }>('select trainee_id from project_member where project_id = $1', [projectId]);
  return { ...p.rows[0], members: m.rows.map(r => r.trainee_id) };
}

/** 锁住节点，连带取出所属项目的成员 */
async function lockMilestone(tx: pg.PoolClient, milestoneId: string) {
  const r = await tx.query<{ id: string; project_id: string; status: string; due_at: Date }>(
    'select id, project_id, status, due_at from milestone where id = $1 for update', [milestoneId]);
  if (!r.rows[0]) throw new CommandError(404, '没有这个关键节点');
  const m = await tx.query<{ trainee_id: string }>('select trainee_id from project_member where project_id = $1', [r.rows[0].project_id]);
  return { ...r.rows[0], members: m.rows.map(x => x.trainee_id) };
}

async function assertTrainees(tx: pg.PoolClient, userIds: string[]) {
  if (!userIds.length) return;
  const { rows } = await tx.query<{ id: string }>("select id from app_user where id = any($1) and role = 'trainee' and stopped_at is null", [userIds]);
  const found = new Set(rows.map(r => r.id));
  const missing = userIds.filter(id => !found.has(id));
  if (missing.length) throw new CommandError(400, `这些人不是在培的管培生：${missing.join('、')}`);
}

const C01: Handler = async (tx, actor, input) => {
  const name = text(input, 'name', '项目名称') as string;
  const goal = text(input, 'goal', '项目目标') as string;
  const acceptance = text(input, 'acceptanceCriteria', '验收条件') as string;
  const acceptor = text(input, 'acceptorName', '业务验收人', false);
  const docUrl = text(input, 'docUrl', '项目文档链接', false);
  const lead = text(input, 'leadTraineeId', '主责管培生') as string;
  const members = ids(input, 'memberTraineeIds', '参与管培生').filter(id => id !== lead);
  const stations = ids(input, 'stationIds', '关联站');
  const confirm = input.confirm === true;
  if (confirm && actor.role !== 'mentor') throw new CommandError(403, '只有带教能在创建时直接确认立项');
  await assertTrainees(tx, [lead, ...members]);
  if (stations.length) {
    // 关联站必须是项目成员自己路径上的站
    const { rows } = await tx.query<{ id: string }>(
      'select s.id from personal_module s join personal_path p on p.id = s.path_id where s.id = any($1) and p.user_id = any($2)', [stations, [lead, ...members]]);
    if (rows.length !== stations.length) throw new CommandError(400, '关联站必须是项目成员路径上的站');
  }
  return {
    traineeIds: [lead, ...members],
    apply: async () => {
      const { rows } = await tx.query<{ id: string }>(
        `insert into project (name, goal, acceptance_criteria, acceptor_name, doc_url, status, created_by, confirmed_by, confirmed_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
        [name, goal, acceptance, acceptor, docUrl, confirm ? 'active' : 'draft', actor.id, confirm ? actor.id : null, confirm ? new Date() : null]);
      const id = rows[0].id;
      await tx.query("insert into project_member (project_id, trainee_id, role) select $1, x, case when x = $2 then 'lead' else 'member' end from unnest($3::text[]) as x", [id, lead, [lead, ...members]]);
      if (stations.length) await tx.query('insert into project_station (project_id, station_id) select $1, unnest($2::text[])', [id, stations]);
      const event = { subjectType: 'project', subjectId: id, projectId: id };
      return {
        result: { projectId: id, status: confirm ? 'active' : 'draft' },
        events: [{ ...event, payload: { name, lead, members } }, ...(confirm ? [{ ...event, type: 'C02' as CommandId }] : [])],
      };
    },
  };
};

const C02: Handler = async (tx, actor, input) => {
  const projectId = text(input, 'projectId', '项目') as string;
  const p = await lockProject(tx, projectId);
  return {
    traineeIds: p.members,
    precondition: () => (p.status === 'draft' ? null : `项目现在是「${STATUS_CN[p.status]}」，只有草拟的项目能确认立项`),
    apply: async () => {
      await tx.query("update project set status = 'active', confirmed_by = $2, confirmed_at = now() where id = $1", [projectId, actor.id]);
      return { result: { projectId, status: 'active' }, events: [{ subjectType: 'project', subjectId: projectId, projectId }] };
    },
  };
};

const C03: Handler = async (tx, actor, input) => {
  const projectId = text(input, 'projectId', '项目') as string;
  const name = text(input, 'name', '节点名称') as string;
  const goal = text(input, 'goal', '节点目标', false) ?? '';
  const acceptance = text(input, 'acceptanceCriteria', '验收标准') as string;
  const due = time(input, 'dueAt', '截止');
  const taskIds = ids(input, 'taskIds', '关联的培养任务');
  const p = await lockProject(tx, projectId);
  if (taskIds.length) {
    // 只能关联「在项目中完成」且挂在本项目上的培养任务（PRD 3.3）
    const { rows } = await tx.query<{ id: string }>('select id from task_instance where id = any($1) and in_project and project_id = $2', [taskIds, projectId]);
    if (rows.length !== taskIds.length) throw new CommandError(400, '只能关联设为「在项目中完成」且属于本项目的培养任务');
  }
  return {
    traineeIds: p.members,
    precondition: () => (p.status === 'ended' ? '项目已结束，不能再新建节点' : null),
    apply: async () => {
      const { rows } = await tx.query<{ id: string }>(
        'insert into milestone (project_id, name, goal, acceptance_criteria, original_due_at, due_at, created_by) values ($1, $2, $3, $4, $5, $5, $6) returning id',
        [projectId, name, goal, acceptance, due, actor.id]);
      const id = rows[0].id;
      if (taskIds.length) await tx.query('insert into milestone_task (milestone_id, task_id) select $1, unnest($2::text[])', [id, taskIds]);
      return { result: { milestoneId: id, status: 'todo' }, events: [{ subjectType: 'milestone', subjectId: id, projectId, payload: { name, dueAt: due, taskIds } }] };
    },
  };
};

const C04: Handler = async (tx, _actor, input) => {
  const milestoneId = text(input, 'milestoneId', '关键节点') as string;
  const m = await lockMilestone(tx, milestoneId);
  return {
    traineeIds: m.members,
    precondition: () => (m.status === 'todo' ? null : `节点现在是「${STATUS_CN[m.status]}」，只有未开始的节点能开始`),
    apply: async () => {
      await tx.query("update milestone set status = 'doing' where id = $1", [milestoneId]);
      return { result: { milestoneId, status: 'doing' }, events: [{ subjectType: 'milestone', subjectId: milestoneId, projectId: m.project_id }] };
    },
  };
};

const C05: Handler = async (tx, actor, input) => {
  const subjectType = text(input, 'subjectType', '调整对象类型');
  if (subjectType !== 'milestone' && subjectType !== 'task') throw new CommandError(400, '调整对象类型只能是关键节点或培养任务');
  const subjectId = text(input, 'subjectId', '调整对象') as string;
  const due = time(input, 'dueAt', '新截止');
  const reason = text(input, 'reason', '调整原因') as string;

  let old: Date;
  let traineeIds: string[];
  let projectId: string | null = null;
  let personId: string | null = null;
  if (subjectType === 'milestone') {
    const m = await lockMilestone(tx, subjectId);
    old = m.due_at;
    traineeIds = m.members;
    projectId = m.project_id;
  } else {
    const { rows } = await tx.query<{ due_at: Date; user_id: string }>(
      'select t.due_at, p.user_id from task_instance t join personal_path p on p.id = t.path_id where t.id = $1 for update of t', [subjectId]);
    if (!rows[0]) throw new CommandError(404, '没有这个培养任务');
    old = rows[0].due_at;
    traineeIds = [rows[0].user_id];
    personId = rows[0].user_id;
  }
  return {
    traineeIds,
    precondition: () => (old.toISOString() === due ? '新截止和现在的截止相同' : null),
    apply: async () => {
      // 原截止永久保留：节点的原截止建时就存了；任务第一次调整时记下原截止
      if (subjectType === 'milestone') await tx.query('update milestone set due_at = $2 where id = $1', [subjectId, due]);
      else await tx.query('update task_instance set due_at = $2, original_due_at = coalesce(original_due_at, due_at), due_adjust_reason = $3 where id = $1', [subjectId, due, reason]);
      await tx.query('insert into deadline_change (subject_type, subject_id, old_due_at, new_due_at, reason, actor_id) values ($1, $2, $3, $4, $5, $6)', [subjectType, subjectId, old, due, reason, actor.id]);
      return {
        result: { subjectType, subjectId, dueAt: due },
        events: [{ subjectType, subjectId, projectId, personId, payload: { from: old.toISOString(), to: due, reason } }],
      };
    },
  };
};

const C13: Handler = async (tx, _actor, input) => {
  const milestoneId = text(input, 'milestoneId', '关键节点') as string;
  const reason = text(input, 'reason', '取消原因') as string;
  const m = await lockMilestone(tx, milestoneId);
  return {
    traineeIds: m.members,
    precondition: () => (m.status === 'passed' || m.status === 'cancelled' ? `节点已经「${STATUS_CN[m.status]}」，不能取消` : null),
    apply: async () => {
      await tx.query("update milestone set status = 'cancelled', cancel_reason = $2 where id = $1", [milestoneId, reason]);
      return { result: { milestoneId, status: 'cancelled' }, events: [{ subjectType: 'milestone', subjectId: milestoneId, projectId: m.project_id, payload: { reason } }] };
    },
  };
};

export const projectHandlers: Partial<Record<CommandId, Handler>> = { C01, C02, C03, C04, C05, C13 };
