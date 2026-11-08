import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import './styles/fonts.css';
import './styles/app.css';
import { Sidebar } from './components/Layout';
import { SessionProvider, ToastProvider } from './components/ui';
import Picks from './pages/dev/Picks';

/* #44 关键页挑版的独立入口（vite.picks.config.ts 构建后发布为 Artifact）：外壳用现有侧栏，路由放内存里，不连后端。 */
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
