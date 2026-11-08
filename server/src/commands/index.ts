// 业务命令的执行器（PRD 4.1）：所有写入都经这里。每条命令在一个事务里依次做：
//   1. prepare：校验输入、锁住并读出目标对象，算出这个对象相关的管培生；
//   2. 统一授权入口 authorize()（不通过就什么都不写）；
//   3. 前置条件（PRD 4.5；不满足返回中文原因，状态不变、不写事件）；
//   4. apply：写业务对象；
//   5. 写事件日志（只追加，事件类型 = 命令编号）。
// 新命令只需在 HANDLERS 里登记一个 Handler，不要绕过执行器直接写库。
import type pg from 'pg';
import { type Actor, authorize, type CommandId, COMMANDS } from '../authorize.ts';
import { CommandError, type Handler } from './kit.ts';
import { projectHandlers } from './project.ts';
import { reviewHandlers } from './review.ts';

export { CommandError } from './kit.ts';

const HANDLERS: Partial<Record<CommandId, Handler>> = { ...projectHandlers, ...reviewHandlers };

export const isCommandId = (id: string): id is CommandId => Object.hasOwn(COMMANDS, id);

/** 执行一条业务命令；失败时抛 CommandError（或数据库错误），事务回滚，什么都不写 */
export async function runCommand(pool: pg.Pool, actor: Actor | null, command: CommandId, input: Record<string, unknown>, source: 'web' | 'bot' = 'web'): Promise<unknown> {
  const handler = HANDLERS[command];
  if (!handler) throw new CommandError(404, `命令「${COMMANDS[command]}」还没有实现`);
  if (!actor) throw new CommandError(401, '未登录');
  const tx = await pool.connect();
  try {
    await tx.query('begin');
    const prepared = await handler(tx, actor, input);
    const gate = authorize(actor, { kind: 'command', command, traineeIds: prepared.traineeIds });
    if (!gate.ok) throw new CommandError(gate.status, gate.reason);
    const unmet = prepared.precondition?.();
    if (unmet) throw new CommandError(409, unmet);
    const { result, events } = await prepared.apply();
    for (const e of events) {
      await tx.query(
        'insert into event_log (type, subject_type, subject_id, person_id, project_id, actor_id, source, payload) values ($1, $2, $3, $4, $5, $6, $7, $8)',
        [e.type ?? command, e.subjectType, e.subjectId, e.personId ?? null, e.projectId ?? null, actor.id, source, JSON.stringify(e.payload ?? {})],
      );
    }
    await tx.query('commit');
    return result;
  } catch (e) {
    await tx.query('rollback');
    throw e;
  } finally {
    tx.release();
  }
}
