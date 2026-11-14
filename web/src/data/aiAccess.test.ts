// @vitest-environment node
import { test, expect } from 'vitest';
import prd from '../../../docs/PRD.md?raw';
import agents from '../../../AGENTS.md?raw';
import { AI_DEFAULT_EXECUTOR, AI_EXECUTORS, AI_FEATURES, AI_OPEN_APIS } from './aiAccess';

// 设置页、PRD 第 15 节、AGENTS.md「AI 接入」三处要一致（P-13）：这里查功能名和「不调用 AI」的结论
const section = (text: string, head: string) => {
  const i = text.indexOf(head);
  expect(i, `找不到「${head}」`).toBeGreaterThan(-1);
  const rest = text.slice(i + head.length);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
};

test('功能清单与 PRD 第 15 节、AGENTS「AI 接入」一致', () => {
  const p = section(prd, '## 15. AI 接入');
  const a = section(agents, '## AI 接入');
  for (const f of AI_FEATURES) {
    expect(p, `PRD 第 15 节缺「${f.name}」`).toContain(f.name);
    expect(a, `AGENTS「AI 接入」缺「${f.name}」`).toContain(f.name);
  }
});

test('不调用 AI：没有默认执行方，执行方都是未启用，三处都写明', () => {
  expect(AI_DEFAULT_EXECUTOR).toBeNull();
  expect(AI_EXECUTORS.map(e => e.status)).toEqual(['未启用', '未启用']);
  expect(section(prd, '## 15. AI 接入')).toContain('工作台自己不调用任何 AI');
  expect(section(agents, '## AI 接入')).toContain('本应用当前不调用 AI');
});

test('AI 产出必须留痕；接口密钥只给状态', () => {
  for (const f of AI_FEATURES.filter(x => x.aiOutput)) expect(f.trace).toMatch(/执行方.*接入方式.*模型.*时间.*审核人/);
  for (const o of AI_OPEN_APIS) {
    expect(Object.keys(o)).not.toContain('key');
    expect(o.canWrite.some(w => w.includes('答案') && w.includes('留痕'))).toBe(true);
  }
});
