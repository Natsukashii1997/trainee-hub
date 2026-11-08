// 能力证据、带教关系、能力项的命令（PRD 2.4、4.2、第 8 节；issue #41）：
// C16 提炼能力证据、C17 指定或更换带教、C18 维护能力项。
import type pg from 'pg';
import type { CommandId } from '../authorize.ts';
import { CommandError, type Handler, text } from './kit.ts';

const JUDGMENTS = ['insufficient', 'guided', 'independent'];
const DETAIL_KEYS = ['situation', 'basis', 'action', 'result', 'revision'];

async function assertRole(tx: pg.PoolClient, userId: string, role: 'trainee' | 'mentor', label: string) {
  const { rows } = await tx.query('select 1 from app_user where id = $1 and role = $2 and stopped_at is null', [userId, role]);
  if (!rows[0]) throw new CommandError(400, `${label}不存在或不是${role === 'trainee' ? '在培的管培生' : '带教'}`);
}

/** 只收 YYYY-MM-DD 的日期；不传时为北京时间今天 */
async function dateOrToday(tx: pg.PoolClient, input: Record<string, unknown>, key: string, label: string): Promise<string> {
  const v = text(input, key, label, false);
  if (v === null) return (await tx.query<{ d: string }>("select to_char((now() at time zone 'Asia/Shanghai')::date, 'YYYY-MM-DD') as d")).rows[0].d;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new CommandError(400, `「${label}」应为日期，如 2026-11-12`);
  return v;
}

// ---- C16 提炼能力证据 ----

const C16: Handler = async (tx, actor, input) => {
  const traineeId = text(input, 'traineeId', '管培生') as string;
  const itemId = text(input, 'itemId', '能力项') as string;
  const sourceType = text(input, 'sourceType', '来源类型') as string;
  if (!['submission', 'review', 'observation'].includes(sourceType)) throw new CommandError(400, '来源类型只能是成果版本、评审或带教观察');
  const sourceId = text(input, 'sourceId', '来源对象', sourceType !== 'observation');
  const summary = text(input, 'summary', '证据内容') as string;
  const judgment = text(input, 'judgment', '判断') as string;
  if (!JUDGMENTS.includes(judgment)) throw new CommandError(400, '判断只能是尚未观察到充分证据、有指导下完成或可独立完成');
  // 证据链按需填（PRD 8.2）：情境与事实 → 判断与依据 → 行动 → 结果与验证 → 反馈后的修改
  const raw = input.detail ?? {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new CommandError(400, '「证据链」格式不对');
  const detail: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!DETAIL_KEYS.includes(k) || typeof v !== 'string') throw new CommandError(400, `证据链里只能有 ${DETAIL_KEYS.join('、')} 几栏文字`);
    if (v.trim()) detail[k] = v.trim();
  }

  await assertRole(tx, traineeId, 'trainee', '管培生');
  if (!(await tx.query('select 1 from competency_item where id = $1 and active', [itemId])).rows[0]) throw new CommandError(400, '能力项不存在或已停用');

  // 来源必须与这位管培生有关：本人提交的成果、本人任务上的成果、本人参与项目里的成果，以及对这些成果的评审
  let projectId: string | null = null;
  let related = true;
  if (sourceType !== 'observation') {
    const sql = sourceType === 'submission'
      ? 'select s.* from submission s where s.id = $1'
      : 'select s.* from review r join submission s on s.id = r.submission_id where r.id = $1';
    const s = (await tx.query<{ submitter_id: string; milestone_id: string | null; task_id: string | null }>(sql, [sourceId])).rows[0];
    if (!s) throw new CommandError(404, sourceType === 'submission' ? '没有这个成果版本' : '没有这条评审');
    if (s.milestone_id) projectId = (await tx.query<{ project_id: string }>('select project_id from milestone where id = $1', [s.milestone_id])).rows[0].project_id;
    const { rows } = await tx.query(
      `select 1 where $1 = $2
         or exists (select 1 from task_instance t join personal_path p on p.id = t.path_id where t.id = $3 and p.user_id = $2)
         or exists (select 1 from project_member m where m.project_id = $4 and m.trainee_id = $2)`,
      [s.submitter_id, traineeId, s.task_id, projectId]);
    related = Boolean(rows[0]);
  }
  return {
    traineeIds: [traineeId],
    precondition: () => (related ? null : '来源与这位管培生无关：只能用本人的成果、对本人成果的评审，或本人参与项目里的成果与评审'),
    apply: async () => {
      const { rows } = await tx.query<{ id: string }>(
        `insert into competency_evidence (trainee_id, item_id, source_type, source_id, summary, detail, judgment, status, confirmed_by, confirmed_at)
         values ($1, $2, $3, $4, $5, $6, $7, 'confirmed', $8, now()) returning id`,
        [traineeId, itemId, sourceType, sourceId, summary, JSON.stringify(detail), judgment, actor.id]);
      const id = rows[0].id;
      return {
        result: { evidenceId: id, status: 'confirmed' },
        events: [{ subjectType: 'competency_evidence', subjectId: id, personId: traineeId, projectId, payload: { itemId, sourceType, sourceId, judgment } }],
      };
    },
  };
};

// ---- C17 指定或更换带教 ----

const C17: Handler = async (tx, actor, input) => {
  const mentorId = text(input, 'mentorId', '带教') as string;
  const traineeId = text(input, 'traineeId', '管培生') as string;
  const scope = text(input, 'scope', '范围') as string;
  if (!['all', 'station', 'project'].includes(scope)) throw new CommandError(400, '范围只能是全程、某一站或某个项目');
  const stationId = scope === 'station' ? (text(input, 'stationId', '站') as string) : null;
  const projectId = scope === 'project' ? (text(input, 'projectId', '项目') as string) : null;
  const startDate = await dateOrToday(tx, input, 'startDate', '开始日');
  await assertRole(tx, mentorId, 'mentor', '带教');
  await assertRole(tx, traineeId, 'trainee', '管培生');
  if (stationId && !(await tx.query('select 1 from personal_module s join personal_path p on p.id = s.path_id where s.id = $1 and p.user_id = $2', [stationId, traineeId])).rows[0])
    throw new CommandError(400, '站必须是这位管培生路径上的站');
  if (projectId && !(await tx.query('select 1 from project_member where project_id = $1 and trainee_id = $2', [projectId, traineeId])).rows[0])
    throw new CommandError(400, '这位管培生不是该项目的成员');

  // 同一管培生、同一范围、同一对象上还没结束的关系（没有结束日或结束日不早于新关系开始日），按新关系开始日结束
  const { rows: current } = await tx.query<{ id: string; mentor_id: string; start_date: string }>(
    `select id, mentor_id, to_char(start_date, 'YYYY-MM-DD') as start_date from mentorship
     where trainee_id = $1 and scope = $2 and station_id is not distinct from $3 and project_id is not distinct from $4
       and (end_date is null or end_date >= $5::date) for update`,
    [traineeId, scope, stationId, projectId, startDate]);
  return {
    traineeIds: [traineeId],
    precondition: () => {
      if (current.some(m => m.start_date > startDate)) return '已有一条更晚开始的带教关系，先调整它';
      if (current.some(m => m.mentor_id === mentorId)) return '这位带教已经在这个范围带这位管培生';
      return null;
    },
    apply: async () => {
      const ended = current.map(m => m.id);
      if (ended.length) await tx.query('update mentorship set end_date = $2::date where id = any($1)', [ended, startDate]);
      const { rows } = await tx.query<{ id: string }>(
        'insert into mentorship (mentor_id, trainee_id, scope, station_id, project_id, start_date) values ($1, $2, $3, $4, $5, $6::date) returning id',
        [mentorId, traineeId, scope, stationId, projectId, startDate]);
      const id = rows[0].id;
      return {
        result: { mentorshipId: id, startDate, endedIds: ended },
        events: [{ subjectType: 'mentorship', subjectId: id, personId: traineeId, projectId, payload: { mentorId, scope, stationId, startDate, endedIds: ended, by: actor.id } }],
      };
    },
  };
};

// ---- C18 维护能力项 ----
// 新增：版本 1。修改：另存一个新版本，旧版本停用；已有的能力证据仍指向旧版本。停用：只把当前版本停用。

const C18: Handler = async (tx, _actor, input) => {
  const itemId = text(input, 'itemId', '能力项', false);
  const retire = input.retire === true;
  if (retire && !itemId) throw new CommandError(400, '停用时要指定能力项');
  const name = retire ? null : (text(input, 'name', '能力项名称') as string);
  const description = retire ? null : (text(input, 'description', '说明', false) ?? '');
  let old: { no: number; version: number; active: boolean } | null = null;
  if (itemId) {
    old = (await tx.query<{ no: number; version: number; active: boolean }>('select no, version, active from competency_item where id = $1 for update', [itemId])).rows[0] ?? null;
    if (!old) throw new CommandError(404, '没有这个能力项');
  }
  const dup = name ? (await tx.query('select 1 from competency_item where active and name = $1 and id is distinct from $2', [name, itemId])).rows[0] : null;
  return {
    traineeIds: [],
    precondition: () => {
      if (old && !old.active) return '这个能力项版本已停用，只能修改当前版本';
      if (dup) return `已有同名的能力项「${name}」`;
      return null;
    },
    apply: async () => {
      if (old) await tx.query('update competency_item set active = false where id = $1', [itemId]);
      if (retire) return { result: { itemId, active: false }, events: [{ subjectType: 'competency_item', subjectId: itemId as string, payload: { retire: true } }] };
      const no = old?.no ?? (await tx.query<{ n: number }>('select coalesce(max(no), 0) + 1 as n from competency_item')).rows[0].n;
      const version = (old?.version ?? 0) + 1;
      const { rows } = await tx.query<{ id: string }>('insert into competency_item (no, name, description, version) values ($1, $2, $3, $4) returning id', [no, name, description, version]);
      const id = rows[0].id;
      return { result: { itemId: id, no, version }, events: [{ subjectType: 'competency_item', subjectId: id, payload: { no, name, version, replaces: itemId } }] };
    },
  };
};

export const growthHandlers: Partial<Record<CommandId, Handler>> = { C16, C17, C18 };
