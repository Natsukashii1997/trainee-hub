// 从带教关系推出「谁负责」（PRD 2.4）：带教关系是带教信息的唯一来源，项目、站上都不另存。
// 某天生效 = 开始日 ≤ 这天，且没有结束日或结束日 ≥ 这天；同一天有两条生效时（换带教当天）取开始日较晚的那条。
// 日期按北京时间算。
import type pg from 'pg';

type Db = pg.Pool | pg.PoolClient;

const TODAY = "(now() at time zone 'Asia/Shanghai')::date";
const ACTIVE = `start_date <= ${TODAY} and (end_date is null or end_date >= ${TODAY})`;
const LATEST = 'order by start_date desc, created_at desc limit 1';

async function first(db: Db, sql: string, params: unknown[]): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(sql, params);
  return rows[0]?.id ?? null;
}

/** 管培生的默认带教（范围为全程），没有时为空 */
export const defaultMentor = (db: Db, traineeId: string) =>
  first(db, `select mentor_id as id from mentorship where trainee_id = $1 and scope = 'all' and ${ACTIVE} ${LATEST}`, [traineeId]);

/** 兜底的管理者 */
const admin = (db: Db) => first(db, "select id from app_user where role = 'mentor' and is_admin and stopped_at is null order by id limit 1", []);

/** 默认带教 → 管理者 */
async function fallback(db: Db, traineeId: string): Promise<string | null> {
  return (await defaultMentor(db, traineeId)) ?? (await admin(db));
}

/** 项目带教：项目主责管培生在该项目范围的带教关系 → 主责的默认带教 → 管理者。节点成果的评审负责人、项目详情显示的项目带教都按这条 */
export async function projectMentor(db: Db, projectId: string): Promise<string | null> {
  const lead = await first(db, "select trainee_id as id from project_member where project_id = $1 and role = 'lead'", [projectId]);
  if (!lead) return admin(db);
  return (await first(db, `select mentor_id as id from mentorship where trainee_id = $1 and scope = 'project' and project_id = $2 and ${ACTIVE} ${LATEST}`, [lead, projectId]))
    ?? fallback(db, lead);
}

/** 培养任务成果的评审负责人：该管培生在任务所属站的带教关系 → 默认带教 → 管理者 */
export async function stationMentor(db: Db, traineeId: string, stationId: string): Promise<string | null> {
  return (await first(db, `select mentor_id as id from mentorship where trainee_id = $1 and scope = 'station' and station_id = $2 and ${ACTIVE} ${LATEST}`, [traineeId, stationId]))
    ?? fallback(db, traineeId);
}
