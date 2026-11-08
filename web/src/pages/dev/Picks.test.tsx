import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionProvider, ToastProvider } from '../../components/ui';
import { STATES, world } from './picksData';
import { HOME_VERSIONS } from './PicksHome';
import { PROJECT_VERSIONS } from './PicksProject';
import { PROFILE_VERSIONS } from './PicksProfile';

/* #44 挑版页：4 页 × 3 版 × 5 种状态都能渲染，不报错，且主体里有对应的人和项目 */
afterEach(cleanup);
const pages = { 首页管培生: HOME_VERSIONS.homeT, 首页带教: HOME_VERSIONS.homeM, 项目详情: PROJECT_VERSIONS, 成长档案: PROFILE_VERSIONS };

describe('关键页挑版', () => {
  for (const [name, vers] of Object.entries(pages)) {
    vers.forEach((V, i) => {
      for (const s of STATES) {
        it(`${name} 版 ${'ABC'[i]} · ${s.label}`, () => {
          const { container } = render(<MemoryRouter><SessionProvider><ToastProvider><V w={world(s.value)} /></ToastProvider></SessionProvider></MemoryRouter>);
          const text = container.textContent ?? '';
          expect(text).toMatch(name === '首页带教' ? /在带 2 人/ : /来电归因优化/);
          expect(text).not.toMatch(/undefined|NaN/);
        });
      }
    });
  }

  it('示例数据与后端初始化脚本一致：人、项目、节点截止', () => {
    const w = world('revise');
    expect(w.pj1.members.map(m => m.name)).toEqual(['林夏', '许诺']);
    expect(w.pj1.mentor).toBe('周颖');
    expect(w.pj2?.mentor).toBe('吴桐');
    expect(w.pj1.milestones.map(m => m.name)).toEqual(['问题定义', '分流方案验证']);
    expect(w.ms1.dueAt).toBe('2026-11-13T10:00:00.000Z');
    expect(w.ms2.dueAt).toBe('2026-12-04T10:00:00.000Z');
  });
});
