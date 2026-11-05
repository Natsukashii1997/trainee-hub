// 领域类型。UI 原型阶段由示例数据填充；接后端时接口按这些形状返回（见 docs/PRD.md 第 9 节）。

export type Role = 'trainee' | 'mentor' | 'admin' | 'colleague';
export const ROLE_LABEL: Record<Role, string> = { trainee: '管培生', mentor: '带教人', admin: '管理员', colleague: '同事' };

export interface User {
  id: string;
  name: string;
  color: string;
  role: Role;
  team: string;
  joinedAt?: string;
  mentorId?: string;
  line?: string;
  bio?: string;
  skills?: string[];
  lastActiveAt?: string;
}

export type Output = '文档' | '路演' | '表格' | '复盘' | '录音';

export interface Stage { id: string; no: number; name: string; days: number; desc: string }
export interface Module { id: string; stageId: string; name: string; line?: string; days: number }
export interface TaskTemplate {
  id: string;
  moduleId: string;
  name: string;
  desc: string;
  requirements: string[];
  output: Output;
  days: number;
  assetIds: string[];
  resources: { title: string; source: string }[];
}

export interface PersonalModule { moduleId: string; startAt: string; endAt: string; mentorId: string }
export interface PersonalPath { userId: string; startAt: string; endAt: string; modules: PersonalModule[] }

export type TaskStatus = 'todo' | 'doing' | 'submitted' | 'revise' | 'passed';
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: '未开始', doing: '进行中', submitted: '已提交', revise: '需修改', passed: '已通过' };

export interface TaskInstance {
  id: string;
  userId: string;
  templateId?: string;
  kind: 'path' | 'recurring';
  name: string;
  moduleId?: string;
  note: string;
  output: Output;
  dueAt: string;
  status: TaskStatus;
  progress?: number;
  mentorId: string;
}

export interface Submission { id: string; taskId: string; url: string; at: string; note?: string }
export type Grade = '优秀' | '达标' | '需改进';
export interface Review { id: string; taskId: string; submissionId: string; mentorId: string; grade: Grade; comment: string; at: string }

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

export interface Contribution { id: string; userId: string; kind: '资产上架' | '资料贡献' | '分享会主讲'; refId: string; title: string; at: string }
export interface FeedItem { id: string; actorId: string; text: string; at: string }
export interface Announcement { id: string; title: string; body: string; at: string; readBy: number }
export interface CalendarItem { id: string; ownerId: string; title: string; startAt: string; endAt: string }
export interface Resource { id: string; title: string; source: string; moduleId?: string; updatedAt: string }

/** 可见性：产出、点评、考核只给本人、本人的带教人、管理员（PRD 4.4）。接后端后由服务端执行同一规则。 */
export function canSeePrivate(viewer: User, owner: User, mentorIds: string[]): boolean {
  return viewer.role === 'admin' || viewer.id === owner.id || mentorIds.includes(viewer.id);
}
