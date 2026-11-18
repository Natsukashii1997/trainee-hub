import { lazy, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
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
const Profile = lazy(() => import('./pages/Team').then(m => ({ default: m.Profile })));
const ReviewQueue = lazy(() => import('./pages/Admin').then(m => ({ default: m.ReviewQueue })));
const MembersAdmin = lazy(() => import('./pages/Admin').then(m => ({ default: m.MembersAdmin })));
const PathEditor = lazy(() => import('./pages/Admin').then(m => ({ default: m.PathEditor })));
const CohortAdmin = lazy(() => import('./pages/Admin').then(m => ({ default: m.CohortAdmin })));
const RotationAdmin = lazy(() => import('./pages/Admin').then(m => ({ default: m.RotationAdmin })));
const WorkdayCalendar = lazy(() => import('./pages/Admin').then(m => ({ default: m.WorkdayCalendar })));
const RulesAdmin = lazy(() => import('./pages/Admin').then(m => ({ default: m.RulesAdmin })));
const AIAccess = lazy(() => import('./pages/Admin').then(m => ({ default: m.AIAccess })));
const Login = lazy(() => import('./pages/Misc').then(m => ({ default: m.Login })));
const Soon = lazy(() => import('./pages/Misc').then(m => ({ default: m.Soon })));
const Pending = lazy(() => import('./pages/Misc').then(m => ({ default: m.Pending })));
const MilestoneDetail = lazy(() => import('./pages/Milestone').then(m => ({ default: m.MilestoneDetail })));

/** 旧地址带参数的重定向：把 :param 换成当前地址里的值 */
function Moved({ to }: { to: string }) {
  const params = useParams();
  return <Navigate to={to.replace(/:(\w+)/g, (_, k: string) => params[k] ?? '')} replace />;
}

/* 路由表（PRD v2.0 骨架版；页面清单的编号写在注释里）。旧地址（v1.1 原型）重定向到新地址，见资产处置清单第 1 节。
   还没做的页面先放 Pending 占位，写明在哪张 issue 实现。 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<PageFrame><Login /></PageFrame>} />
            <Route element={<AppLayout />}>
              {/* 工作台：W1–W2 首页、W3 待办、W4 日程 */}
              <Route index element={<Home />} />
              <Route path="todo" element={<Todo />} />
              <Route path="schedule" element={<ScheduleIndex />} />
              <Route path="schedule/week" element={<ScheduleWeek />} />
              <Route path="schedule/mentees" element={<ScheduleMentees />} />
              <Route path="schedule/rotation" element={<ScheduleRotation />} />
              <Route path="schedule/events" element={<ScheduleEvents />} />
              {/* 项目实践：P1–P3 */}
              <Route path="projects" element={<Pending page="P1" />} />
              <Route path="projects/:id" element={<Pending page="P2" />} />
              <Route path="projects/:id/milestones/:mid" element={<MilestoneDetail />} />
              {/* 培养成长：T1–T7 */}
              <Route path="growth" element={<Navigate to="/growth/path" replace />} />
              <Route path="growth/path" element={<MyPath />} />
              <Route path="growth/tasks/:id" element={<TaskDetail />} />
              <Route path="growth/people/:id" element={<Profile />} />
              <Route path="growth/mentees" element={<MentorBoard />} />
              <Route path="growth/reviews/:id" element={<Pending page="T5" />} />
              <Route path="growth/handover/:stationId" element={<HandoffNotes />} />
              <Route path="growth/overview" element={<PathOverview />} />
              {/* 知识与工具：K1–K5 */}
              <Route path="knowledge" element={<AIHome />} />
              <Route path="knowledge/resources" element={<Pending page="K2" />} />
              <Route path="knowledge/cases" element={<Pending page="K3" />} />
              <Route path="knowledge/cases/:id" element={<Pending page="K3" />} />
              <Route path="knowledge/assets" element={<AssetLibrary />} />
              <Route path="knowledge/assets/new" element={<SubmitAsset />} />
              <Route path="knowledge/assets/:id" element={<AssetDetail />} />
              <Route path="knowledge/faq" element={<Pending page="K5" />} />
              {/* 管理区：M1–M10（侧栏只对管理者显示） */}
              <Route path="admin" element={<Navigate to="/admin/members" replace />} />
              <Route path="admin/members" element={<MembersAdmin />} />
              <Route path="admin/competencies" element={<Pending page="M2" />} />
              <Route path="admin/cohort" element={<CohortAdmin />} />
              <Route path="admin/path" element={<PathEditor />} />
              <Route path="admin/rules" element={<RulesAdmin />} />
              <Route path="admin/calendar" element={<WorkdayCalendar />} />
              <Route path="admin/rotation" element={<RotationAdmin />} />
              <Route path="admin/review" element={<ReviewQueue />} />
              <Route path="admin/ai" element={<AIAccess />} />
              <Route path="admin/later" element={<Soon which="admin" />} />
              {/* 旧地址（v1.1 原型）→ 新地址 */}
              <Route path="growth/me" element={<Navigate to="/growth/path" replace />} />
              <Route path="growth/board" element={<Navigate to="/growth/mentees" replace />} />
              <Route path="growth/handoff/:stationId" element={<Moved to="/growth/handover/:stationId" />} />
              <Route path="team" element={<Navigate to="/admin/members" replace />} />
              <Route path="team/:id" element={<Moved to="/growth/people/:id" />} />
              <Route path="ai" element={<Navigate to="/knowledge" replace />} />
              <Route path="ai/assets" element={<Navigate to="/knowledge/assets" replace />} />
              <Route path="ai/assets/:id" element={<Moved to="/knowledge/assets/:id" />} />
              <Route path="ai/submit" element={<Navigate to="/knowledge/assets/new" replace />} />
              <Route path="admin/soon" element={<Navigate to="/admin/later" replace />} />
              <Route path="incentive" element={<Navigate to="/admin/later" replace />} />
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
