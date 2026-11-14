import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import './styles/fonts.css';
import './styles/app.css';
import { Sidebar } from './components/Layout';
import { SessionProvider, ToastProvider } from './components/ui';
import Picks from './pages/dev/Picks';

/* #44 关键页挑版的独立入口（vite.picks.config.ts 构建后发布为 Artifact）：外壳用现有侧栏，路由放内存里，不连后端。
   #43 之后外壳从后端取演示身份；独立页没有后端，这里用一份只在本入口生效的示例接口顶上（身份与后端初始化脚本一致）。 */
const IDS = [
  { id: 'u-lin', name: '林夏', role: 'trainee', isAdmin: false },
  { id: 'u-xu', name: '许诺', role: 'trainee', isAdmin: false },
  { id: 'u-zhou', name: '周颖', role: 'mentor', isAdmin: true },
  { id: 'u-wu', name: '吴桐', role: 'mentor', isAdmin: false },
] as const;
// 起始身份跟着要打开的页面走（?p=homeM 是带教首页），否则身份还没加载完，挑版页会先按管培生切回管培生首页
const startPage = (() => { try { return new URLSearchParams(window.location.search).get('p'); } catch { return null; } })();
let me: (typeof IDS)[number] = startPage === 'homeM' ? IDS[2] : IDS[0];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  if (!url.startsWith('/api/')) return realFetch(input, init);
  if (url === '/api/demo/identities') return json({ identities: IDS });
  if (url === '/api/me') return json({ me, demo: true });
  if (url === '/api/demo/login') {
    const { userId } = JSON.parse(String(init?.body ?? '{}')) as { userId?: string };
    me = IDS.find(i => i.id === userId) ?? me;
    return json({ me });
  }
  // 顶栏待办数：示例里林夏 1 件（修改再交）、周颖 2 件（两份待评审），其他人 0
  if (url === '/api/views/todo') return json({ result: { toReview: me.id === 'u-zhou' ? [1, 2] : [], myActions: me.id === 'u-lin' ? [1] : [], blockersToRespond: [], projectsToConfirm: [] } });
  return json({ error: '挑版页没有这个接口' }, 404);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter>
      <SessionProvider>
        <ToastProvider>
          <div className="app"><Sidebar /><Picks standalone /></div>
        </ToastProvider>
      </SessionProvider>
    </MemoryRouter>
  </StrictMode>,
);
