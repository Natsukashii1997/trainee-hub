// 跨站可见性（PRD 4.4）
import { beforeEach, describe, expect, it } from 'vitest';
import { atBj } from '../lib/workday';
import * as api from './api';

const u = (id: string) => api.userById(id);
const task = (id: string) => api.taskById(id)!;
beforeEach(() => api.resetDemo());

describe('产出与点评', () => {
  it('本人、管理员看得到；其他管培生和同事看不到，任务详情直接不返回', () => {
    expect(api.canSeePrivate(u('u-xu'), task('t-u-xu-tt-11'))).toBe(true);
    expect(api.canSeePrivate(u('u-chang'), task('t-u-xu-tt-11'))).toBe(true);
    expect(api.canSeePrivate(u('u-lin'), task('t-u-xu-tt-11'))).toBe(false);
    expect(api.canSeePrivate(u('u-he'), task('t-u-xu-tt-11'))).toBe(false);
    expect(api.taskDetail('t-u-xu-tt-11', u('u-lin'))).toBeNull();
    expect(api.visibleTasksOf(u('u-he'), 'u-xu')).toEqual([]);
  });
  it('本站站带教看本站、能点评；此前各站只读（看得到、不能评）', () => {
    expect(api.canSeePrivate(u('u-zhou'), task('t-u-lin-tt-8'))).toBe(true);
    expect(api.canReview(u('u-zhou'), task('t-u-lin-tt-8'))).toBe(true);
    // 林夏上一站教学（吴桐）
    expect(api.canSeePrivate(u('u-zhou'), task('t-u-lin-tt-6'))).toBe(true);
    expect(api.isReadOnlyFor(u('u-zhou'), task('t-u-lin-tt-6'))).toBe(true);
  });
  it('开站前 5 个工作日起可只读此前各站：赵一然 11-12 到周颖的销售站，11-05 09:00 起可看', () => {
    const t = task('t-u-zhao-tt-13'); // 内容站（无站带教）
    expect(api.canSeePrivate(u('u-zhou'), t)).toBe(true);
    expect(api.canReview(u('u-zhou'), t)).toBe(false);
    api.setNow(atBj('2026-11-05', '08:59'));
    expect(api.canSeePrivate(u('u-zhou'), t)).toBe(false);
    api.setNow(atBj('2026-11-04', '10:00'));
    expect(api.canSeePrivate(u('u-zhou'), t)).toBe(false);
  });
  it('离站后保留本站内容只读，但看不到之后的站', () => {
    // 孟川 10-28 离开周颖的客服站，现在在吴桐的教学站
    expect(api.canSeePrivate(u('u-zhou'), task('t-u-meng-tt-9'))).toBe(true);
    expect(api.canSeePrivate(u('u-zhou'), task('t-u-meng-tt-6'))).toBe(false);
    // 吴桐是孟川的本站站带教，可看此前的客服站，不能评
    expect(api.canSeePrivate(u('u-wu'), task('t-u-meng-tt-9'))).toBe(true);
    expect(api.canReview(u('u-wu'), task('t-u-meng-tt-9'))).toBe(false);
  });
  it('主带教看全程（含之后的站）', () => {
    expect(api.canSeePrivate(u('u-zhou'), task('t-u-lin-tt-18'))).toBe(true);
    expect(api.canSeePrivate(u('u-wu'), task('t-u-lin-tt-18'))).toBe(false);
  });
  it('还没进入窗口的站带教：看不到这个人', () => {
    // 宋知第 4 段（11-26）才到周颖的客服站；上一段销售站（10-15—10-28）也是周颖 → 周颖看得到销售站，看不到之后的站
    expect(api.canSeePrivate(u('u-zhou'), task('t-u-song-tt-11'))).toBe(true);
    expect(api.canSeePrivate(u('u-zhou'), task('t-u-song-tt-4'))).toBe(false);
  });
});

describe('考核与交接要点', () => {
  it('轻测成绩只给本人、主带教、管理员；站带教看不到', () => {
    expect(api.canSeeAssessment(u('u-zhou'), 'u-lin')).toBe(true); // 主带教
    expect(api.canSeeAssessment(u('u-zhou'), 'u-xu')).toBe(false); // 只是站带教
    const d = api.taskDetail('r-quiz-u-xu-2026-10-29', u('u-zhou'))!;
    expect(d.quizResult).toBeUndefined();
    expect(api.taskDetail('r-quiz-u-xu-2026-10-29', u('u-xu'))!.quizResult).toBeTypeOf('number');
  });
  it('交接要点给相关带教和管理员，不给本人', () => {
    const card = api.handoverCard('u-lin', u('u-zhou'));
    expect(card.map(x => x.note!.authorId)).toContain('u-wu');
    expect(api.handoverCard('u-lin', u('u-lin'))).toHaveLength(0);
    expect(api.handoverCard('u-lin', u('u-chang')).length).toBeGreaterThan(0);
  });
});
