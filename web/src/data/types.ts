// 领域类型（PRD v1.1 第 9 节本体）。UI 原型阶段由示例数据填充；接后端时接口按这些形状返回。
// 时间字段一律是 ISO（UTC）字符串，页面显示必须经 lib/time.ts 按北京时间格式化。
export type { WorkdayEntry } from '../lib/workday';

// ---------- 人与期次 ----------
export type Role = 'trainee' | 'mentor' | 'admin' | 'colleague';
export const ROLE_LABEL: Record<Role, string> = { trainee: '管培生', mentor: '带教人', admin: '管理员', colleague: '同事' };

export interface User {
  id: string;
  name: string;
  color: string;
  role: Role;
  team: string;
  feishuOpenId?: string;
  cohortId?: string;
  joinedAt?: string;
  /** 首次飞书登录时间 */
  firstLoginAt?: string;
  /** 管理员指定角色的时间；为空且是同事、又不在任何预置名单里 → R01 待分配 */
  roleAssignedAt?: string;
  /** 中止培养：未关闭的待办全部撤销，指标分母剔除（PRD 3.4、13） */
  stoppedAt?: string;
  /**
   * 兼容字段（只读）：当前所在站的站带教，由数据层每次同步时推算填入，不是存储字段。
   * 新页面请用 currentStation(userId)?.stationMentorId 或 mainMentorOf(userId)。
   */
  mentorId?: string;
  line?: Line;
  bio?: string;
  skills?: string[];
  lastActiveAt?: string;
}

export type CohortStatus = 'preparing' | 'running' | 'ended';
export const COHORT_STATUS_LABEL: Record<CohortStatus, string> = { preparing: '筹备', running: '进行中', ended: '已结束' };
export interface RosterEntry { openId: string; name: string }
export interface Cohort {
  id: string;
  name: string;
  templateId: string;
  /** 绑定的模板版本号（冗余一份，方便显示） */
  templateVersion: string;
  startAt: string;
  endAt: string;
  status: CohortStatus;
  /** 预置名单：飞书 open_id 在名单里的人首次登录直接成为本期管培生 */
  roster: RosterEntry[];
}

// ---------- 路径模板（带版本） ----------
export type Line = '客户线' | '老师线' | '市场线' | 'AIBP';
export type Output = '文档' | '路演' | '表格' | '复盘' | '录音';

export interface PathTemplate {
  id: string;
  name: string;
  version: string;
  /** 已被期次绑定：只读，改动要另存新版本 */
  frozen: boolean;
  basedOnId?: string;
  createdAt: string;
}
export interface Stage { id: string; templateId: string; no: number; name: string; days: number; desc: string }
export interface Module { id: string; stageId: string; name: string; line?: Line; days: number }

/** 截止规则：锚点（站开始或站结束）+ 偏移 N 个工作日 + 时刻（北京时间 HH:mm） */
export interface DeadlineRule { anchor: 'stationStart' | 'stationEnd'; offsetWorkdays: number; time: string }
export interface TaskTemplate {
  id: string;
  moduleId: string;
  name: string;
  desc: string;
  requirements: string[];
  output: Output;
  /** 建议用时（工作日）：开放日 = 截止 − 建议用时 */
  days: number;
  deadline: DeadlineRule;
  assetIds: string[];
  resources: { title: string; source: string }[];
}

// ---------- 个人路径与站 ----------
export type PathStatus = 'pending' | 'running' | 'ended';
/** 站（personal_module）：带教关系的唯一来源 */
export interface Station {
  id: string;
  userId: string;
  moduleId: string;
  /** 在个人路径里的顺序，从 0 开始 */
  order: number;
  startAt: string;
  endAt: string;
  /** 站带教，可空：空 = 由管理员接 */
  stationMentorId?: string;
  /** R06 换站接人：新站带教点「已准备」的时间 */
  preparedAt?: string;
}
export interface PersonalPath {
  id: string;
  userId: string;
  cohortId: string;
  startAt: string;
  endAt: string;
  /** 主带教，可空：空 = 管理员担任 */
  mainMentorId?: string;
  status: PathStatus;
  stations: Station[];
}
export type StationTimePos = 'upcoming' | 'current' | 'left';
export const STATION_POS_LABEL: Record<StationTimePos, string> = { upcoming: '待开始', current: '在站', left: '已离站' };

// ---------- 任务 ----------
/** 周期任务的完成方式（PRD 4.2 表） */
export type CompletionMode = 'link' | 'bot-weekly' | 'bot-quiz' | 'declare';
export const COMPLETION_LABEL: Record<CompletionMode, string> = {
  link: '提交链接', 'bot-weekly': '机器人收周报', 'bot-quiz': '机器人写成绩', declare: '本人声明 + 管理员确认',
};

export type Frequency =
  | { kind: 'daily' }
  | { kind: 'weekly'; weekday: number /* 0 = 周日 */ }
  | { kind: 'monthEnd' }
  | { kind: 'dates'; dates: string[] /* YYYY-MM-DD */ };
export interface RecurringRule {
  id: string;
  name: string;
  /** 实例名称模板：{week} ISO 周次、{month} 月份、{module} 所在站名称、{date} MM.DD */
  titleTemplate: string;
  frequency: Frequency;
  /** 截止时刻，北京时间 HH:mm */
  dueTime: string;
  /** 适用的阶段（空 = 全程）与期次 */
  stageIds?: string[];
  cohortId?: string;
  completion: CompletionMode;
  needsReview: boolean;
  output: Output;
  note: string;
  /** 停用的规则不展开（如日报：通道待定） */
  enabled: boolean;
}

export type TaskStatus = 'todo' | 'doing' | 'submitted' | 'revise' | 'passed';
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: '未开始', doing: '进行中', submitted: '已提交', revise: '需修改', passed: '已通过' };

export interface TaskInstance {
  id: string;
  userId: string;
  kind: 'path' | 'recurring';
  templateId?: string;
  ruleId?: string;
  name: string;
  note: string;
  output: Output;
  /** 所属站（路径任务必有；负责带教按它解析，不单存） */
  stationId?: string;
  moduleId?: string;
  openAt: string;
  dueAt: string;
  /** 第一次调整前的截止；调整过才有 */
  originalDueAt?: string;
  completion: CompletionMode;
  status: TaskStatus;
  /** 需修改时的修改截止 */
  reviseDueAt?: string;
  progress?: number;
  /** 轻测成绩：分数或「未答」（未答不判逾期） */
  quizResult?: number | '未答';
}

export interface Submission {
  id: string;
  taskId: string;
  /** 飞书文档链接；机器人收的周报、本人声明可以没有 */
  url?: string;
  at: string;
  version: number;
  channel: 'web' | 'bot';
  note?: string;
  /** 再交时必填 */
  changeNote?: string;
}
export type Grade = '优秀' | '达标' | '需改进';
export const GRADES: Grade[] = ['优秀', '达标', '需改进'];
export interface Review { id: string; taskId: string; submissionId: string; mentorId: string; grade: Grade; comment: string; at: string }

/** 交接要点（一期）：站结束后原站带教写，最多 3 条 */
export interface HandoverNote { id: string; stationId: string; userId: string; authorId: string; points: string[]; at: string }

// ---------- 运行层：事件、待办 ----------
export type EventSource = 'web' | 'bot' | 'feishu' | 'system';
export type Visibility = 'public' | 'restricted' | 'owner' | 'admin';
export type EventType =
  | 'user.firstLogin' | 'user.roleAssigned' | 'user.stopped'
  | 'path.mainMentorChanged' | 'station.mentorChanged' | 'station.prepared' | 'station.postponed' | 'station.swapped'
  | 'station.switching' | 'station.ended' | 'station.leftUnsettled'
  | 'task.opened' | 'task.started' | 'task.dueSoon' | 'task.overdue' | 'task.dueAdjusted' | 'task.dueAdjustUndone' | 'task.rescheduled' | 'task.nudged'
  | 'submission.created' | 'review.created' | 'quiz.scored' | 'weekly.received'
  | 'handover.written'
  | 'asset.submitted' | 'asset.approved' | 'asset.returned' | 'asset.used'
  | 'integration.error' | 'integration.recovered'
  | 'todo.reassigned'
  | 'announcement.published' | 'template.versioned';
export interface EventLog {
  id: string;
  type: EventType;
  subjectType: 'user' | 'path' | 'station' | 'task' | 'submission' | 'review' | 'handover' | 'asset' | 'integration' | 'todo' | 'announcement' | 'template';
  subjectId: string;
  /** 属于哪位管培生（成长时间线按它取） */
  personId?: string;
  actorId?: string;
  source: EventSource;
  at: string;
  visibility: Visibility;
  payload?: Record<string, unknown>;
  /** 推算事件的去重键：同一键只写一次 */
  dedupKey?: string;
}

/** 一期 12 条待办规则（PRD 3.4） */
export type TodoRule = 'R01' | 'R02' | 'R03' | 'R04' | 'R05' | 'R06' | 'R07' | 'R08' | 'R09' | 'R10' | 'R11' | 'R12';
export const TODO_RULE_LABEL: Record<TodoRule, string> = {
  R01: '新成员待分配', R02: '待点评', R03: '修改再交', R04: '今明截止', R05: '逾期跟进', R06: '换站接人',
  R07: '换站预告', R08: '写交接要点', R09: '站末遗留未评', R10: '资产审核', R11: '资产退回修改', R12: '接口或同步异常',
};
export type TodoStatus = 'open' | 'done' | 'cancelled';
export interface Todo {
  id: string;
  rule: TodoRule;
  subjectType: 'user' | 'station' | 'task' | 'asset' | 'integration';
  subjectId: string;
  /** 涉及哪位管培生 */
  personId?: string;
  ownerId: string;
  title: string;
  /** 出现时间 */
  appearAt: string;
  /** 期限；待定的规则（R01、R10、R11）为空 */
  dueAt?: string;
  /** 越小越急（首页焦点排序用） */
  priority: number;
  status: TodoStatus;
  eventId?: string;
  closedByEventId?: string;
  closedAt?: string;
  /** 抄送（如点评超时 3 个工作日抄送管理员） */
  cc: string[];
  /** 已超时转交管理员（R09） */
  escalated?: boolean;
}

// ---------- 日程项（查询视图，不存表） ----------
export type ScheduleShape = 'span' | 'deadline' | 'moment';
export type ScheduleKind =
  | 'cohort' | 'stage' | 'station' | 'switch' | 'taskOpen' | 'taskDue' | 'reviseDue'
  | 'weekly' | 'quiz' | 'material' | 'reviewDue' | 'handoverDue' | 'assessment' | 'teamEvent' | 'holiday';
export interface ScheduleItem {
  id: string;
  kind: ScheduleKind;
  shape: ScheduleShape;
  title: string;
  startAt: string;
  endAt?: string;
  /** 所属管培生 */
  personId?: string;
  /** 跳回所属对象的家 */
  ref: { type: 'task' | 'station' | 'path' | 'teamEvent' | 'calendar' | 'stage'; id: string };
  source: 'derived' | 'rule' | 'feishu';
  visibility: Visibility;
  /** 继承关联对象的状态，用于着色（任务状态、逾期等） */
  status?: TaskStatus | 'overdue' | 'missed';
}

// ---------- 团队、知识、AI ----------
export type TeamEventType = '分享会' | '路演' | '读书会';
/** 团队活动：来自共享「管培生活动」飞书日历，只读；主讲、主题、回放由工作台补录 */
export interface TeamEvent {
  id: string;
  feishuEventId: string;
  type: TeamEventType;
  title: string;
  speakerId?: string;
  topic?: string;
  startAt: string;
  endAt: string;
  place: string;
  cohortId?: string;
  assetIds: string[];
  status: 'upcoming' | 'ended' | 'replayed';
  minutesUrl?: string;
}

export type AssetType = 'Skill' | 'Prompt' | '工作流' | '用例';
export type AssetStatus = 'pending' | 'live' | 'returned';
export interface Asset {
  id: string;
  type: AssetType;
  title: string;
  summary: string;
  tags: string[];
  usage: string;
  installCmd?: string;
  example?: { input: string; output: string };
  content?: string;
  authorId: string;
  version: string;
  submittedAt: string;
  updatedAt: string;
  status: AssetStatus;
  returnReason?: string;
  /** 示例数据里已有的使用人数（团队外部门的人等），加上 usedBy 才是展示的总数 */
  baseUses: number;
  usedBy: string[];
  favBy: string[];
}

export interface Announcement { id: string; title: string; body: string; at: string; readBy: number }
export interface Resource { id: string; title: string; source: string; moduleId?: string; updatedAt: string }

export type IntegrationLevel = 'ok' | 'warn' | 'error' | 'off';
export interface Integration { id: string; name: string; detail: string; at: string | null; level: IntegrationLevel }

export interface Contribution { id: string; userId: string; kind: '资产上架' | '分享会主讲'; refId: string; title: string; at: string }
export interface FeedItem { id: string; actorId: string; text: string; at: string }
