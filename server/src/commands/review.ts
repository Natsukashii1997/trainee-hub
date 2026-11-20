// 成果、评审、下一步行动、认定的命令（PRD 2.4、3.3、4.2–4.5、第 7 节；issue #38）：
// C06 提交成果、C07 修改再交、C08 评审、C09 处理下一步行动。
// PRD v3.0（总纲 6.2、7.2；issue #45）：C08 加反馈条目和顺手验证上次的反馈；C40 单独验证一条反馈。
import type pg from 'pg';
import type { CommandId } from '../authorize.ts';
import { projectMentor, stationMentor } from '../mentor.ts';
import { insertFeedback, parseFeedback, parseResult, parseVerifications, prepareVerifications } from './feedback.ts';
import { CommandError, type Handler, ids, text } from './kit.ts';

const STATUS_CN: Record<string, string> = {
  draft: '草拟', active: '推进中', ended: '已结束',
  todo: '未开始', doing: '进行中', submitted: '待评审', revise: '需修改', passed: '已通过', cancelled: '已取消',
};
const GRADES = ['优秀', '达标', '需改进'] as const;
const KINDS = { revise: '修改再交', advance: '推进后续节点', suggest: '建议' } as const;
type Kind = keyof typeof KINDS;

/** 成果的主挂靠对象：一个关键节点或一个培养任务 */
interface Subject {
  kind: 'milestone' | 'task';
  id: string;
  status: string;
  /** 节点所属项目；任务为空 */
  projectId: string | null;
  projectStatus: string | null;
  /** 节点：项目成员；任务：任务所属人 */
  traineeIds: string[];
  /** 任务所属人与站 */
  ownerId: string | null;
  stationId: string | null;
  inProject: boolean;
}

/** 锁住主挂靠对象并取出判断要用的信息 */
async function lockSubject(tx: pg.PoolClient, kind: 'milestone' | 'task', id: string): Promise<Subject> {
  if (kind === 'milestone') {
    const r = await tx.query<{ status: string; project_id: string; project_status: string }>(
      'select m.status, m.project_id, p.status as project_status from milestone m join project p on p.id = m.project_id where m.id = $1 for update of m', [id]);
    if (!r.rows[0]) throw new CommandError(404, '没有这个关键节点');
    const m = await tx.query<{ trainee_id: string }>('select trainee_id from project_member where project_id = $1', [r.rows[0].project_id]);
    return { kind, id, status: r.rows[0].status, projectId: r.rows[0].project_id, projectStatus: r.rows[0].project_status, traineeIds: m.rows.map(x => x.trainee_id), ownerId: null, stationId: null, inProject: false };
  }
  const r = await tx.query<{ status: string; user_id: string; station_id: string; in_project: boolean }>(
    'select t.status, p.user_id, t.station_id, t.in_project from task_instance t join personal_path p on p.id = t.path_id where t.id = $1 for update of t', [id]);
  if (!r.rows[0]) throw new CommandError(404, '没有这个培养任务');
  const t = r.rows[0];
  return { kind, id, status: t.status, projectId: null, projectStatus: null, traineeIds: [t.user_id], ownerId: t.user_id, stationId: t.station_id, inProject: t.in_project };
}

const subjectOf = (row: { milestone_id: string | null; task_id: string | null }) =>
  (row.milestone_id ? ['milestone', row.milestone_id] : ['task', row.task_id as string]) as ['milestone' | 'task', string];

/** 这一对象最新的成果版本 */
async function latestSubmission(tx: pg.PoolClient, s: Subject) {
  const { rows } = await tx.query<{ id: string; version: number; review_state: string }>(
    `select id, version, review_state from submission where ${s.kind === 'milestone' ? 'milestone_id' : 'task_id'} = $1 order by version desc limit 1`, [s.id]);
  return rows[0] ?? null;
}

/** 按 PRD 2.4 推出评审负责人（提交时确定，存快照） */
async function deriveReviewer(tx: pg.PoolClient, s: Subject): Promise<string> {
  const id = s.kind === 'milestone' ? await projectMentor(tx, s.projectId as string) : await stationMentor(tx, s.ownerId as string, s.stationId as string);
  if (!id) throw new CommandError(409, '推不出评审负责人：没有生效的带教关系，也没有管理者');
  return id;
}

/** 写一个新的成果版本，并把主挂靠对象改为待评审 */
async function insertSubmission(tx: pg.PoolClient, s: Subject, v: { version: number; url: string; note: string | null; changeNote: string | null; prevReviewId: string | null; submitterId: string; reviewerId: string }) {
  const { rows } = await tx.query<{ id: string }>(
    `insert into submission (milestone_id, task_id, version, url, note, change_note, submitter_id, reviewer_id, prev_review_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [s.kind === 'milestone' ? s.id : null, s.kind === 'task' ? s.id : null, v.version, v.url, v.note, v.changeNote, v.submitterId, v.reviewerId, v.prevReviewId]);
  await tx.query(`update ${s.kind === 'milestone' ? 'milestone' : 'task_instance'} set status = 'submitted' where id = $1`, [s.id]);
  return rows[0].id;
}

/** 事件里记所属项目（节点）或所属管培生（任务） */
const eventScope = (s: Subject, personId: string | null) => ({ projectId: s.projectId, personId: s.kind === 'task' ? s.ownerId : personId });

const C06: Handler = async (tx, actor, input) => {
  const milestoneId = text(input, 'milestoneId', '关键节点', false);
  const taskId = text(input, 'taskId', '培养任务', false);
  if (Boolean(milestoneId) === Boolean(taskId)) throw new CommandError(400, '成果只能挂一个关键节点或一个培养任务');
  const url = text(input, 'url', '飞书链接') as string;
  const note = text(input, 'note', '说明', false);
  const s = await lockSubject(tx, milestoneId ? 'milestone' : 'task', (milestoneId ?? taskId) as string);
  const prev = await latestSubmission(tx, s);
  return {
    traineeIds: s.traineeIds,
    precondition: () => {
      const what = s.kind === 'milestone' ? '节点' : '培养任务';
      if (s.status !== 'todo' && s.status !== 'doing') return `${what}现在是「${STATUS_CN[s.status]}」，只有未开始或进行中的${what}能提交成果`;
      if (s.kind === 'milestone' && s.projectStatus !== 'active') return `项目现在是「${STATUS_CN[s.projectStatus as string]}」，只有推进中的项目能提交节点成果`;
      if (s.inProject) return '这个培养任务设为「在项目中完成」，不单独交成果，由节点评审时认定';
      if (prev) return '这个对象已经有成果版本，修改后请用「修改再交」';
      return null;
    },
    apply: async () => {
      const reviewerId = await deriveReviewer(tx, s);
      const id = await insertSubmission(tx, s, { version: 1, url, note, changeNote: null, prevReviewId: null, submitterId: actor.id, reviewerId });
      return {
        result: { submissionId: id, version: 1, reviewerId },
        events: [{ subjectType: 'submission', subjectId: id, ...eventScope(s, actor.id), payload: { [s.kind === 'milestone' ? 'milestoneId' : 'taskId']: s.id, version: 1, reviewerId } }],
      };
    },
  };
};

const C07: Handler = async (tx, actor, input) => {
  const prevReviewId = text(input, 'prevReviewId', '上一版评审') as string;
  const url = text(input, 'url', '飞书链接') as string;
  const changeNote = text(input, 'changeNote', '修改说明') as string;
  const r = await tx.query<{ submission_id: string; milestone_id: string | null; task_id: string | null }>(
    'select r.submission_id, s.milestone_id, s.task_id from review r join submission s on s.id = r.submission_id where r.id = $1', [prevReviewId]);
  if (!r.rows[0]) throw new CommandError(404, '没有这条评审');
  const s = await lockSubject(tx, ...subjectOf(r.rows[0]));
  const latest = await latestSubmission(tx, s);
  return {
    traineeIds: s.traineeIds,
    precondition: () => {
      if (s.status !== 'revise') return `现在是「${STATUS_CN[s.status]}」，只有需修改的对象能修改再交`;
      if (latest?.id !== r.rows[0].submission_id) return '只能针对最新一版的评审修改再交';
      return null;
    },
    apply: async () => {
      const version = (latest?.version ?? 0) + 1;
      const reviewerId = await deriveReviewer(tx, s);
      const id = await insertSubmission(tx, s, { version, url, note: null, changeNote, prevReviewId, submitterId: actor.id, reviewerId });
      // 上一版评审下未完成的「修改再交」行动自动完成，完成依据 = 新版本
      const done = await tx.query<{ id: string }>(
        "update next_action set status = 'done', done_submission_id = $2, resolution = $3, done_at = now() where review_id = $1 and kind = 'revise' and status = 'open' returning id",
        [prevReviewId, id, `已修改再交 V${version}`]);
      return {
        result: { submissionId: id, version, reviewerId, closedActionIds: done.rows.map(x => x.id) },
        events: [{ subjectType: 'submission', subjectId: id, ...eventScope(s, actor.id), payload: { prevReviewId, version, reviewerId, closedActionIds: done.rows.map(x => x.id) } }],
      };
    },
  };
};

interface ActionInput { kind: Kind; content: string; ownerId: string | null; targetMilestoneId: string | null }

function parseActions(input: Record<string, unknown>): ActionInput[] {
  const v = input.actions;
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new CommandError(400, '「下一步行动」应为列表');
  return v.map((a, i) => {
    if (!a || typeof a !== 'object') throw new CommandError(400, `第 ${i + 1} 条下一步行动格式不对`);
    const o = a as Record<string, unknown>;
    if (typeof o.kind !== 'string' || !Object.hasOwn(KINDS, o.kind)) throw new CommandError(400, `第 ${i + 1} 条下一步行动的类型只能是修改再交、推进后续节点或建议`);
    return {
      kind: o.kind as Kind,
      content: text(o, 'content', `第 ${i + 1} 条下一步行动的内容`) as string,
      ownerId: text(o, 'ownerId', '负责人', false),
      targetMilestoneId: text(o, 'targetMilestoneId', '关联节点', false),
    };
  });
}

const C08: Handler = async (tx, actor, input) => {
  const submissionId = text(input, 'submissionId', '成果版本') as string;
  const grade = text(input, 'grade', '评审结论') as string;
  if (!(GRADES as readonly string[]).includes(grade)) throw new CommandError(400, '评审结论只能是优秀、达标或需改进');
  const comment = text(input, 'comment', '短评', false) ?? '';
  const keyIssue = text(input, 'keyIssue', '关键问题', false);
  const judgment = text(input, 'judgment', '带教判断', false);
  const actions = parseActions(input);
  const creditTaskIds = ids(input, 'creditTaskIds', '认定的培养任务');
  const feedback = parseFeedback(input);
  const verifications = parseVerifications(input);

  const sub = await tx.query<{ milestone_id: string | null; task_id: string | null; submitter_id: string; review_state: string; version: number; submitted_at: Date }>(
    'select milestone_id, task_id, submitter_id, review_state, version, submitted_at from submission where id = $1 for update', [submissionId]);
  if (!sub.rows[0]) throw new CommandError(404, '没有这个成果版本');
  const row = sub.rows[0];
  const s = await lockSubject(tx, ...subjectOf(row));
  const latest = await latestSubmission(tx, s);
  const level = text(input, 'level', '反馈级别', false) ?? (s.kind === 'milestone' ? 'deep' : 'light');
  if (level !== 'light' && level !== 'deep') throw new CommandError(400, '反馈级别只能是轻反馈或深反馈');

  // 负责人默认值（PRD 7.3）：修改再交 = 提交人；推进后续节点 = 项目主责管培生（任务成果为提交人）；建议可不指定
  let lead: string | null = null;
  if (s.projectId) lead = (await tx.query<{ trainee_id: string }>("select trainee_id from project_member where project_id = $1 and role = 'lead'", [s.projectId])).rows[0]?.trainee_id ?? null;
  const owned = actions.map(a => ({ ...a, ownerId: a.ownerId ?? (a.kind === 'revise' ? row.submitter_id : a.kind === 'advance' ? (lead ?? row.submitter_id) : null) }));
  const owners = [...new Set(owned.map(a => a.ownerId).filter((x): x is string => Boolean(x)))];
  if (owners.length) {
    const { rows } = await tx.query<{ id: string }>('select id from app_user where id = any($1)', [owners]);
    if (rows.length !== owners.length) throw new CommandError(400, '下一步行动的负责人不存在');
  }
  const targets = [...new Set(owned.map(a => a.targetMilestoneId).filter((x): x is string => Boolean(x)))];
  if (targets.length) {
    const { rows } = await tx.query<{ project_id: string }>('select project_id from milestone where id = any($1)', [targets]);
    if (rows.length !== targets.length) throw new CommandError(400, '下一步行动关联的节点不存在');
    if (s.projectId && rows.some(x => x.project_id !== s.projectId)) throw new CommandError(400, '下一步行动只能关联本项目的节点');
  }
  // 能认定的任务：与该节点关联、还没有已认定记录的培养任务
  let creditable = new Set<string>();
  let creditOwners: string[] = [];
  if (creditTaskIds.length && s.kind === 'milestone') {
    const { rows } = await tx.query<{ task_id: string; user_id: string }>(
      `select mt.task_id, p.user_id from milestone_task mt join task_instance t on t.id = mt.task_id join personal_path p on p.id = t.path_id
       where mt.milestone_id = $1 and mt.task_id = any($2)
         and not exists (select 1 from submission_credit c where c.task_id = mt.task_id and c.status = 'credited')
       for update of t`, [s.id, creditTaskIds]);
    creditable = new Set(rows.map(x => x.task_id));
    creditOwners = rows.map(x => x.user_id);
  }
  const passed = grade !== '需改进';
  const verify = verifications.length
    ? await prepareVerifications(tx, verifications, { id: submissionId, version: row.version, submittedAt: row.submitted_at, submitterId: row.submitter_id, projectId: s.projectId, traineeIds: s.traineeIds }, actor.id)
    : null;

  return {
    traineeIds: s.traineeIds,
    precondition: () => {
      if (row.review_state !== 'pending') return '这个成果版本已经评审过';
      const unverifiable = verify?.problem();
      if (unverifiable) return unverifiable;
      if (latest?.id !== submissionId) return '只能评审这一对象最新的成果版本';
      if (!passed && !owned.some(a => a.kind === 'revise')) return '结论为需改进时，至少要有一条「修改再交」行动';
      if (passed && owned.some(a => a.kind === 'revise')) return '「修改再交」行动只用在需改进的评审里';
      if (creditTaskIds.length && !passed) return '认定只能出现在通过（优秀、达标）的评审里';
      if (creditTaskIds.length && s.kind !== 'milestone') return '只有节点成果的评审能认定培养任务';
      const bad = creditTaskIds.filter(id => !creditable.has(id));
      if (bad.length) return `这些任务不能认定（没有关联这个节点，或已经认定过）：${bad.join('、')}`;
      return null;
    },
    apply: async () => {
      const { rows } = await tx.query<{ id: string }>(
        'insert into review (submission_id, reviewer_id, grade, comment, key_issue, judgment, level) values ($1, $2, $3, $4, $5, $6, $7) returning id',
        [submissionId, actor.id, grade, comment, keyIssue, judgment, level]);
      const reviewId = rows[0].id;
      const status = passed ? 'passed' : 'revise';
      await tx.query("update submission set review_state = 'reviewed' where id = $1", [submissionId]);
      await tx.query(`update ${s.kind === 'milestone' ? 'milestone' : 'task_instance'} set status = $2 where id = $1`, [s.id, status]);
      const actionIds: string[] = [];
      for (const a of owned) {
        const r = await tx.query<{ id: string }>('insert into next_action (review_id, kind, content, owner_id, target_milestone_id) values ($1, $2, $3, $4, $5) returning id',
          [reviewId, a.kind, a.content, a.ownerId, a.targetMilestoneId]);
        actionIds.push(r.rows[0].id);
      }
      // 反馈条目属于这一版的提交人（总纲 7.1）
      const feedbackIds = await insertFeedback(tx, feedback, { traineeId: row.submitter_id, reviewId, submissionId, milestoneId: s.kind === 'milestone' ? s.id : null, actorId: actor.id });
      const verifyEvents = verify ? await verify.apply() : [];
      if (creditTaskIds.length) {
        await tx.query("insert into submission_credit (submission_id, task_id, status, credited_by, credited_at) select $1, unnest($2::text[]), 'credited', $3, now()", [submissionId, creditTaskIds, actor.id]);
        await tx.query("update task_instance set status = 'passed' where id = any($1)", [creditTaskIds]);
      }
      return {
        result: { reviewId, status, actionIds, creditedTaskIds: creditTaskIds, feedbackIds, verifiedFeedbackIds: verifications.map(v => v.feedbackId) },
        events: [{
          subjectType: 'review', subjectId: reviewId, ...eventScope(s, row.submitter_id),
          payload: { submissionId, version: row.version, grade, actionIds, creditedTaskIds: creditTaskIds, creditedTrainees: [...new Set(creditOwners)], feedbackIds },
        }, ...verifyEvents],
      };
    },
  };
};

const C09: Handler = async (tx, _actor, input) => {
  const actionId = text(input, 'actionId', '下一步行动') as string;
  const result = text(input, 'result', '处理结果') as string;
  if (result !== 'done' && result !== 'dropped') throw new CommandError(400, '处理结果只能是已完成或不再需要');
  const resolution = text(input, 'resolution', result === 'done' ? '完成依据' : '不再需要的原因', result === 'dropped');
  const r = await tx.query<{ status: string; owner_id: string | null; project_id: string | null }>(
    `select a.status, a.owner_id, m.project_id from next_action a join review r on r.id = a.review_id join submission s on s.id = r.submission_id
     left join milestone m on m.id = s.milestone_id where a.id = $1 for update of a`, [actionId]);
  if (!r.rows[0]) throw new CommandError(404, '没有这条下一步行动');
  const a = r.rows[0];
  return {
    traineeIds: a.owner_id ? [a.owner_id] : [],
    precondition: () => (a.status === 'open' ? null : '这条行动已经处理过'),
    apply: async () => {
      await tx.query('update next_action set status = $2, resolution = $3, done_at = now() where id = $1', [actionId, result, resolution]);
      return { result: { actionId, status: result }, events: [{ subjectType: 'next_action', subjectId: actionId, projectId: a.project_id, personId: a.owner_id, payload: { result, resolution } }] };
    },
  };
};

/** C40 验证反馈：在某份成果版本上记一条「下次验证」的反馈改了没有（总纲 6.2）。评审时一起验证走 C08 的 verifications */
const C40: Handler = async (tx, actor, input) => {
  const feedbackId = text(input, 'feedbackId', '反馈') as string;
  const submissionId = text(input, 'submissionId', '成果版本') as string;
  const result = parseResult(input);
  const sub = await tx.query<{ milestone_id: string | null; task_id: string | null; submitter_id: string; version: number; submitted_at: Date }>(
    'select milestone_id, task_id, submitter_id, version, submitted_at from submission where id = $1', [submissionId]);
  if (!sub.rows[0]) throw new CommandError(404, '没有这个成果版本');
  const row = sub.rows[0];
  const s = await lockSubject(tx, ...subjectOf(row));
  const verify = await prepareVerifications(tx, [{ feedbackId, result }], { id: submissionId, version: row.version, submittedAt: row.submitted_at, submitterId: row.submitter_id, projectId: s.projectId, traineeIds: s.traineeIds }, actor.id);
  return {
    traineeIds: verify.traineeIds,
    precondition: verify.problem,
    apply: async () => ({ result: { feedbackId, submissionId, result }, events: await verify.apply() }),
  };
};

export const reviewHandlers: Partial<Record<CommandId, Handler>> = { C06, C07, C08, C09, C40 };
