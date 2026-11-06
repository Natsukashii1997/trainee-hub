// 一期 12 条待办规则（PRD 3.4）：每条至少一个用例，含改派、唯一性、负责人为空落管理员。
import { beforeEach, describe, expect, it } from 'vitest';
import { atBj } from '../lib/workday';
import * as api from './api';
import { db } from './store';
import type { TodoRule } from './types';

const u = (id: string) => api.userById(id);
const ADMIN = 'u-chang';
const open = (rule: TodoRule, ownerId?: string) => db.todos.filter(x => x.status === 'open' && x.rule === rule && (!ownerId || x.ownerId === ownerId));
const find = (rule: TodoRule, subjectId: string, ownerId?: string) => db.todos.find(x => x.rule === rule && x.subjectId === subjectId && (!ownerId || x.ownerId === ownerId));

beforeEach(() => api.resetDemo());

describe('R01 新成员待分配', () => {
  it('新登录、不在预置名单的同事落给管理员；指定角色后关闭', () => {
    const td = find('R01', 'u-bai')!;
    expect(td).toMatchObject({ ownerId: ADMIN, status: 'open' });
    api.setRole('u-bai', 'colleague', u(ADMIN));
    expect(find('R01', 'u-bai')!.status).toBe('done');
  });
  it('预置名单里的人首次登录直接成为管培生，不生成 R01；名单外的生成', () => {
    db.cohorts[0].roster.push({ openId: 'ou_new', name: '新同学' });
    const a = api.firstLogin('ou_new', '新同学');
    expect(a.role).toBe('trainee');
    expect(find('R01', a.id)).toBeUndefined();
    const b = api.firstLogin('ou_stranger', '路人');
    expect(b.role).toBe('colleague');
    expect(find('R01', b.id)!.status).toBe('open');
  });
});

describe('R02 待点评', () => {
  it('路径任务提交后给所属站的站带教，期限 = 提交后 2 个工作日', () => {
    const td = find('R02', 't-u-lin-tt-8')!;
    expect(td.ownerId).toBe('u-zhou');
    expect(td.dueAt).toBe(atBj('2026-11-06', '16:50'));
  });
  it('所属站没有站带教（市场线）时落给管理员', () => {
    expect(find('R02', 't-u-zhao-tt-13')!.ownerId).toBe(ADMIN);
    expect(find('R02', 't-u-chen-tt-15')!.ownerId).toBe(ADMIN);
  });
  it('超时再过 3 个工作日抄送管理员；离站的尾巴任务仍归原站带教', () => {
    const td = find('R02', 't-u-meng-tt-10')!;
    expect(td.ownerId).toBe('u-zhou');
    expect(td.cc).toContain(ADMIN);
  });
  it('周报只看不评：交了不进待点评', () => {
    expect(open('R02').some(x => x.subjectId.startsWith('r-weekly'))).toBe(false);
  });
  it('点评写入后关闭', () => {
    api.reviewTask('t-u-lin-tt-8', '达标', '录音完整。', u('u-zhou'));
    expect(find('R02', 't-u-lin-tt-8')!.status).toBe('done');
  });
});

describe('R03 修改再交', () => {
  it('评「需改进」生成本人的修改再交，修改截止 = 点评后 3 个工作日；再交（必须写修改说明）后关闭并重新进待点评', () => {
    api.reviewTask('t-u-lin-tt-8', '需改进', '第 4 段重录。', u('u-zhou'));
    const td = find('R03', 't-u-lin-tt-8')!;
    expect(td).toMatchObject({ ownerId: 'u-lin', status: 'open', dueAt: atBj('2026-11-10', '10:24') });
    expect(() => api.submitTask('t-u-lin-tt-8', { url: 'https://example.feishu.cn/docx/Lin2' }, u('u-lin'))).toThrow('修改说明');
    api.submitTask('t-u-lin-tt-8', { url: 'https://example.feishu.cn/docx/Lin2', changeNote: '重录了第 4 段' }, u('u-lin'));
    expect(find('R03', 't-u-lin-tt-8')!.status).toBe('done');
    expect(open('R02', 'u-zhou').some(x => x.subjectId === 't-u-lin-tt-8')).toBe(true);
  });
});

describe('R04 今明截止', () => {
  it('林夏：今天的测验 + 明天截止的归因复盘', () => {
    const titles = api.todosOf('u-lin').filter(x => x.rule === 'R04').map(x => x.title);
    expect(titles).toEqual(['今天的测验 · 轻测 · 客服', '明天截止 · 一周来电归因复盘']);
  });
  it('截止被调到下周后撤销', () => {
    api.adjustDue('t-u-lin-tt-9', atBj('2026-11-10', '18:00'), '来电数据导出延迟', u('u-zhou'));
    expect(find('R04', 't-u-lin-tt-9')!.status).toBe('cancelled');
  });
});

describe('R05 逾期跟进', () => {
  it('路径任务逾期：本人补交一条、站带教跟进一条', () => {
    expect(find('R05', 't-u-meng-tt-6', 'u-meng')!.status).toBe('open');
    expect(find('R05', 't-u-meng-tt-6', 'u-wu')!.status).toBe('open');
  });
  it('周报未交：跟进归主带教，主带教为空落管理员', () => {
    const id = 'r-weekly-u-xu-2026-11-01';
    expect(find('R05', id, 'u-xu')).toBeDefined();
    expect(find('R05', id, ADMIN)!.status).toBe('open');
  });
  it('轻测未答不算逾期', () => {
    expect(find('R05', 'r-quiz-u-meng-2026-10-29')).toBeUndefined();
  });
  it('补交后关闭', () => {
    api.submitTask('t-u-meng-tt-6', { url: 'https://example.feishu.cn/docx/Meng' }, u('u-meng'));
    expect(find('R05', 't-u-meng-tt-6', 'u-meng')!.status).toBe('done');
    expect(find('R05', 't-u-meng-tt-6', 'u-wu')!.status).toBe('done');
  });
});

describe('R06 换站接人 / R07 换站预告', () => {
  it('开站前 5 个工作日出现：新站带教不同才给接人待办，空的落管理员；带教不变不生成', () => {
    expect(find('R06', 'st-u-zhao-4')!.ownerId).toBe('u-zhou'); // 内容 → 销售
    expect(find('R06', 'st-u-chen-4')!.ownerId).toBe('u-wu'); // 投放 → 教研
    expect(find('R06', 'st-u-meng-4')!.ownerId).toBe(ADMIN); // 教学 → 投放（无站带教）
    expect(find('R06', 'st-u-lin-4')).toBeUndefined(); // 客服 → 销售，都是周颖
    expect(open('R07')).toHaveLength(6);
  });
  it('提前一天还没出现', () => {
    api.setNow(atBj('2026-11-04', '10:00'));
    expect(open('R07')).toHaveLength(0);
    expect(open('R06')).toHaveLength(0);
  });
  it('点「已准备」关闭接人；开站日仍未确认抄送管理员；开站后预告自动关闭', () => {
    api.markStationPrepared('st-u-zhao-4', u('u-zhou'));
    expect(find('R06', 'st-u-zhao-4')!.status).toBe('done');
    api.setNow(atBj('2026-11-12', '10:00'));
    expect(find('R06', 'st-u-chen-4')!.cc).toContain(ADMIN);
    expect(open('R07')).toHaveLength(0);
    expect(find('R07', 'st-u-lin-4')!.status).toBe('done');
  });
});

describe('R08 写交接要点', () => {
  it('站结束、下一站换了带教 → 原站带教，站后 2 个工作日；写入后关闭', () => {
    const td = find('R08', 'st-u-xu-2')!;
    expect(td).toMatchObject({ ownerId: 'u-wu', status: 'open', dueAt: atBj('2026-10-30', '18:00') });
    expect(() => api.writeHandover('st-u-xu-2', ['1', '2', '3', '4'], u('u-wu'))).toThrow('最多 3 条');
    api.writeHandover('st-u-xu-2', ['拆课细，但常压线交'], u('u-wu'));
    expect(find('R08', 'st-u-xu-2')!.status).toBe('done');
  });
  it('连续两站同一位带教免写', () => {
    api.setNow(atBj('2026-11-12', '10:00'));
    expect(find('R08', 'st-u-lin-3')).toBeUndefined(); // 客服 → 销售，都是周颖
    expect(find('R08', 'st-u-meng-3')!.ownerId).toBe('u-wu'); // 教学（吴桐）→ 投放（无站带教）
  });
});

describe('R09 站末遗留未评', () => {
  it('离站时还有未通过的任务 → 原站带教；超过站后 3 个工作日转管理员（抄送并标记）', () => {
    const td = find('R09', 'st-u-meng-2')!;
    expect(td).toMatchObject({ ownerId: 'u-zhou', escalated: true });
    expect(td.cc).toContain(ADMIN);
    expect(find('R09', 'st-u-chen-2')!.ownerId).toBe(ADMIN); // 内容站无站带教
  });
  it('遗留任务都有结论后关闭', () => {
    api.reviewTask('t-u-meng-tt-10', '达标', '小结写得实在。', u('u-zhou'));
    expect(find('R09', 'st-u-meng-2')!.status).toBe('done');
  });
});

describe('R10 资产审核 / R11 资产退回修改', () => {
  it('提交 → 管理员审核；退回 → 作者修改；重新提交关闭 R11 并回到 R10', () => {
    expect(open('R10', ADMIN)).toHaveLength(3);
    api.reviewAsset('a-5', false, '补一个示例', u(ADMIN));
    expect(find('R10', 'a-5')!.status).toBe('done');
    expect(find('R11', 'a-5', 'u-chen')!.status).toBe('open');
    api.resubmitAsset('a-5', { summary: '补了示例' }, u('u-chen'));
    expect(find('R11', 'a-5')!.status).toBe('done');
    expect(open('R10').some(x => x.subjectId === 'a-5')).toBe(true);
  });
  it('宋知被退回的资产在他名下', () => {
    expect(find('R11', 'a-9', 'u-song')!.status).toBe('open');
  });
});

describe('R12 接口或同步异常', () => {
  it('出错落管理员，恢复后关闭', () => {
    expect(find('R12', 'int-cal')!.status).toBe('open');
    api.setIntegrationStatus('int-cal', 'ok', '同步正常');
    expect(find('R12', 'int-cal')!.status).toBe('done');
    api.setIntegrationStatus('int-bot', 'error', '接口 5 分钟无响应');
    expect(find('R12', 'int-bot')!.ownerId).toBe(ADMIN);
  });
});

describe('改派、唯一性、撤销', () => {
  it('站带教后补：这一站未关闭的待点评改派给新带教（同一条待办），并记待办重派事件', () => {
    const before = find('R02', 't-u-zhao-tt-13')!;
    expect(before.ownerId).toBe(ADMIN);
    api.changeStationMentor('st-u-zhao-3', 'u-zhou', '市场线临时由周颖带', u(ADMIN));
    const after = db.todos.filter(x => x.rule === 'R02' && x.subjectId === 't-u-zhao-tt-13' && x.status === 'open');
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: before.id, ownerId: 'u-zhou' });
    expect(db.events.some(e => e.type === 'todo.reassigned' && e.subjectId === before.id)).toBe(true);
  });
  it('同一 rule + subject + owner 只有一条未关闭；重复推算不重复生成，事件按去重键只写一次', () => {
    const n = db.todos.length, ev = db.events.length;
    api.syncAll(); api.syncAll();
    expect(db.todos.length).toBe(n);
    expect(db.events.length).toBe(ev);
    const keys = db.todos.filter(x => x.status === 'open').map(x => `${x.rule}|${x.subjectId}|${x.ownerId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('中止培养：未关闭的待办全部撤销', () => {
    api.stopTraining('u-meng', '个人原因', u(ADMIN));
    const mine = db.todos.filter(x => x.personId === 'u-meng');
    expect(mine.some(x => x.status === 'open')).toBe(false);
    expect(mine.some(x => x.status === 'cancelled')).toBe(true);
  });
});

describe('首页焦点', () => {
  it('管培生按优先级取两条：已逾期优先', () => {
    expect(api.homeFocus(u('u-meng')).map(x => x.rule)).toEqual(['R05', 'R04']);
    expect(api.homeFocus(u('u-lin')).map(x => x.title)).toEqual(['今天的测验 · 轻测 · 客服', '明天截止 · 一周来电归因复盘']);
  });
  it('带教先看已超时的', () => {
    expect(api.homeFocus(u('u-zhou')).every(x => api.isTodoLate(x))).toBe(true);
  });
});
