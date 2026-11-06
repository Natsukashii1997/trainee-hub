// 写操作的校验与留痕
import { beforeEach, describe, expect, it } from 'vitest';
import { atBj } from '../lib/workday';
import * as api from './api';
import { db } from './store';

const u = (id: string) => api.userById(id);
beforeEach(() => api.resetDemo());

describe('提交与点评', () => {
  it('只能交自己的、只收飞书链接；周报和轻测不能在网页交', () => {
    expect(() => api.submitTask('t-u-lin-tt-9', { url: 'https://example.feishu.cn/docx/X' }, u('u-xu'))).toThrow('自己');
    expect(() => api.submitTask('t-u-lin-tt-9', { url: 'https://example.com/a' }, u('u-lin'))).toThrow('飞书');
    expect(() => api.submitTask('r-weekly-u-lin-2026-11-08', { url: 'https://example.feishu.cn/docx/X' }, u('u-lin'))).toThrow('机器人');
    api.submitTask('t-u-lin-tt-9', { url: 'https://example.feishu.cn/docx/LinCall' }, u('u-lin'));
    expect(api.taskById('t-u-lin-tt-9')!.status).toBe('submitted');
  });
  it('点评只能由负责带教或管理员写；需改进给修改截止', () => {
    expect(() => api.reviewTask('t-u-lin-tt-8', '达标', '', u('u-wu'))).toThrow();
    api.reviewTask('t-u-zhao-tt-13', '需改进', '选题太散', u('u-chang'));
    expect(api.taskById('t-u-zhao-tt-13')!.reviseDueAt).toBe(atBj('2026-11-10', '10:24'));
  });
  it('月度物料由管理员确认', () => {
    expect(() => api.reviewTask('r-material-u-zhao-2026-10-31', '达标', '', u('u-zhou'))).toThrow('管理员');
    api.reviewTask('r-material-u-zhao-2026-10-31', '达标', '已确认', u('u-chang'));
    expect(api.taskStatusLabel(api.taskById('r-material-u-zhao-2026-10-31')!)).toBe('已确认');
  });
});

describe('改截止与催办', () => {
  it('改截止必须写原因，留原截止；管理员可撤销', () => {
    expect(() => api.adjustDue('t-u-lin-tt-9', atBj('2026-11-09', '18:00'), ' ', u('u-zhou'))).toThrow('原因');
    expect(() => api.adjustDue('t-u-lin-tt-9', atBj('2026-11-09', '18:00'), '数据延迟', u('u-wu'))).toThrow();
    api.adjustDue('t-u-lin-tt-9', atBj('2026-11-09', '18:00'), '数据延迟', u('u-zhou'));
    const t = api.taskById('t-u-lin-tt-9')!;
    expect(t.originalDueAt).toBe(atBj('2026-11-06', '18:00'));
    expect(api.dueAdjustmentsOf(t.id)[0].payload).toMatchObject({ reason: '数据延迟', from: atBj('2026-11-06', '18:00') });
    api.undoDueAdjust(t.id, u('u-chang'));
    expect(api.taskById(t.id)!.dueAt).toBe(atBj('2026-11-06', '18:00'));
  });
  it('同一任务 24 小时内只催一次', () => {
    api.nudgeTask('t-u-meng-tt-6', u('u-wu'));
    expect(() => api.nudgeTask('t-u-meng-tt-6', u('u-wu'))).toThrow('24 小时');
    api.setNow(atBj('2026-11-06', '10:25'));
    expect(() => api.nudgeTask('t-u-meng-tt-6', u('u-wu'))).not.toThrow();
  });
});

describe('事件日志', () => {
  it('每个写操作追加事件，事件只追加', () => {
    const n = db.events.length;
    api.toggleUsed('a-3', u('u-lin'));
    api.publishAnnouncement('测试公告', '正文', u('u-chang'));
    expect(db.events.length).toBe(n + 2);
    expect(api.feedList()[0].text).toBe('发布了公告「测试公告」');
  });
  it('到开放日自动转进行中', () => {
    expect(api.taskById('t-u-lin-tt-10')!.status).toBe('todo');
    api.setNow(atBj('2026-11-09', '09:30'));
    expect(api.taskById('t-u-lin-tt-10')!.status).toBe('doing');
  });
  it('模板版本被期次绑定后只读，另存新版本可编辑', () => {
    expect(() => api.addTemplate('m-kf')).toThrow('只读');
    const nt = api.saveTemplateAsNewVersion('pt-1', u('u-chang'));
    expect(nt.version).toBe('v1.1');
    const mod = db.modules.find(m => db.stages.find(s => s.id === m.stageId)?.templateId === nt.id && m.name === '客服')!;
    expect(() => api.addTemplate(mod.id)).not.toThrow();
  });
});
