import { lazy, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles/fonts.css';
import './styles/app.css';
import { AppLayout, PageFrame } from './components/Layout';
import { SessionProvider, ToastProvider } from './components/ui';
import { ScheduleEvents, ScheduleIndex, ScheduleMentees, ScheduleRotation, ScheduleWeek } from './pages/Schedule';
import { Todo } from './pages/Todo';
import Kit from './pages/Kit';

/* 业务页面按需加载：各页面由不同 agent 并行重写，一个页面出错不拖垮整个应用（错误边界见 Layout 的 PageFrame）。 */
const Home = lazy(() => import('./pages/Home'));
const PathOverview = lazy(() => import('./pages/Growth').then(m => ({ default: m.PathOverview })));
const MyPath = lazy(() => import('./pages/Growth').then(m => ({ default: m.MyPath })));
const TaskDetail = lazy(() => import('./pages/Growth').then(m => ({ default: m.TaskDetail })));
const MentorBoard = lazy(() => import('./pages/Growth').then(m => ({ default: m.MentorBoard })));
const HandoffNotes = lazy(() => import('./pages/Growth').then(m => ({ default: m.HandoffNotes })));
const AIHome = lazy(() => import('./pages/AI').then(m => ({ default: m.AIHome })));
const AssetLibrary = lazy(() => import('./pages/AI').then(m => ({ default: m.AssetLibrary })));
const AssetDetail = lazy(() => import('./pages/AI').then(m => ({ default: m.AssetDetail })));
const SubmitAsset = lazy(() => import('./pages/AI').then(m => ({ default: m.SubmitAsset })));
const Members = lazy(() => import('./pages/Team').then(m => ({ default: m.Members })));
const Profile = lazy(() => import('./pages/Team').then(m => ({ default: m.Profile })));
const ReviewQueue = lazy(() => import('./pages/Admin').then(m => ({ default: m.ReviewQueue })));
const MembersAdmin = lazy(() => import('./pages/Admin').then(m => ({ default: m.MembersAdmin })));
const PathEditor = lazy(() => import('./pages/Admin').then(m => ({ default: m.PathEditor })));
const CohortAdmin = lazy(() => import('./pages/Admin').then(m => ({ default: m.CohortAdmin })));
const RotationAdmin = lazy(() => import('./pages/Admin').then(m => ({ default: m.RotationAdmin })));
const WorkdayCalendar = lazy(() => import('./pages/Admin').then(m => ({ default: m.WorkdayCalendar })));
const RulesAdmin = lazy(() => import('./pages/Admin').then(m => ({ default: m.RulesAdmin })));
const Login = lazy(() => import('./pages/Misc').then(m => ({ default: m.Login })));
const Soon = lazy(() => import('./pages/Misc').then(m => ({ default: m.Soon })));

/* 路由表（PRD v1.1）。日程、待办是顶栏切面；/admin/assign 已由 /admin/rotation（轮岗排期编辑）取代。 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<PageFrame><Login /></PageFrame>} />
            <Route element={<AppLayout />}>
              <Route index element={<Home />} />
              {/* 日程：按角色默认视角 */}
              <Route path="schedule" element={<ScheduleIndex />} />
              <Route path="schedule/week" element={<ScheduleWeek />} />
              <Route path="schedule/mentees" element={<ScheduleMentees />} />
              <Route path="schedule/rotation" element={<ScheduleRotation />} />
              <Route path="schedule/events" element={<ScheduleEvents />} />
              <Route path="todo" element={<Todo />} />
              {/* 成长 */}
              <Route path="growth" element={<Navigate to="/growth/path" replace />} />
              <Route path="growth/path" element={<PathOverview />} />
              <Route path="growth/me" element={<MyPath />} />
              <Route path="growth/tasks/:id" element={<TaskDetail />} />
              <Route path="growth/board" element={<MentorBoard />} />
              <Route path="growth/handoff/:stationId" element={<HandoffNotes />} />
              {/* AI */}
              <Route path="ai" element={<AIHome />} />
              <Route path="ai/assets" element={<AssetLibrary />} />
              <Route path="ai/assets/:id" element={<AssetDetail />} />
              <Route path="ai/submit" element={<SubmitAsset />} />
              {/* 团队 */}
              <Route path="team" element={<Members />} />
              <Route path="team/:id" element={<Profile />} />
              {/* 管理后台 */}
              <Route path="admin" element={<Navigate to="/admin/review" replace />} />
              <Route path="admin/review" element={<ReviewQueue />} />
              <Route path="admin/members" element={<MembersAdmin />} />
              <Route path="admin/cohort" element={<CohortAdmin />} />
              <Route path="admin/rotation" element={<RotationAdmin />} />
              <Route path="admin/calendar" element={<WorkdayCalendar />} />
              <Route path="admin/path" element={<PathEditor />} />
              <Route path="admin/rules" element={<RulesAdmin />} />
              <Route path="admin/soon" element={<Soon which="admin" />} />
              {/* 二期、三期占位 */}
              <Route path="knowledge" element={<Soon which="knowledge" />} />
              <Route path="incentive" element={<Soon which="incentive" />} />
              {/* 组件示例（给页面开发对照） */}
              <Route path="dev/kit" element={<Kit />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
