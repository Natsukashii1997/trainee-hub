// 统一授权入口（PRD 2.3、16）：所有业务命令和查询都先经过 authorize()，第二轮的对象级规则（PRD 下篇 R1）也只加在这里。
// 骨架期只有两条规则：
//   1. 带教（含管理者）可执行全部命令、读取全部数据；
//   2. 管培生只能执行「发起方」含管培生的命令（PRD 4.2），且只能针对与本人相关的对象；
//      查询只返回本人的数据、本人参与的项目和全员可见的内容。

export interface Actor {
  id: string;
  name: string;
  role: 'trainee' | 'mentor';
  isAdmin: boolean;
}

/** PRD 4.2 的业务命令 */
export const COMMANDS = {
  C01: '创建项目', C02: '确认立项', C03: '新建关键节点', C04: '开始节点', C05: '调整截止',
  C06: '提交成果', C07: '修改再交', C08: '评审', C09: '处理下一步行动', C10: '标记受阻',
  C11: '响应受阻', C12: '解除受阻', C13: '取消节点', C14: '填写项目结论', C15: '确认结项',
  C16: '提炼能力证据', C17: '指定或更换带教', C18: '维护能力项', C19: '补记业务验证',
} as const;
export type CommandId = keyof typeof COMMANDS;

/** 「发起方」列里含管培生（含项目成员、主责管培生、行动负责人）的命令 */
const TRAINEE_COMMANDS = new Set<CommandId>(['C01', 'C03', 'C04', 'C06', 'C07', 'C09', 'C10', 'C12', 'C14', 'C19']);

export type Access =
  /** 执行业务命令；traineeIds 是这个对象相关的管培生（如项目成员、任务所属人），新建时可不传 */
  | { kind: 'command'; command: CommandId; traineeIds?: string[] }
  /** 读某位或某几位管培生的个人数据；不传 traineeIds 表示全员可见的内容 */
  | { kind: 'read'; traineeIds?: string[] };

export type Decision = { ok: true } | { ok: false; status: 401 | 403; reason: string };

const deny = (status: 401 | 403, reason: string): Decision => ({ ok: false, status, reason });

/** 唯一的授权判断 */
export function authorize(actor: Actor | null, access: Access): Decision {
  if (!actor) return deny(401, '未登录');
  if (actor.role === 'mentor') return { ok: true };

  const related = !access.traineeIds || access.traineeIds.includes(actor.id);
  if (access.kind === 'command') {
    if (!TRAINEE_COMMANDS.has(access.command)) return deny(403, `管培生不能执行「${COMMANDS[access.command]}」`);
    if (!related) return deny(403, '只能操作与自己相关的对象');
    return { ok: true };
  }
  if (!related) return deny(403, '只能查看自己的数据');
  return { ok: true };
}

/** 查询层用：返回只能看哪位管培生的数据；null 表示不限（带教） */
export function readScope(actor: Actor): string | null {
  return actor.role === 'mentor' ? null : actor.id;
}
