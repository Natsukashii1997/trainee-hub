import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles/fonts.css';
import './styles/app.css';
import { AppLayout } from './components/Layout';
import { SessionProvider, ToastProvider } from './components/ui';
import Home from './pages/Home';
import { MentorBoard, MyPath, PathOverview, TaskDetail } from './pages/Growth';
import { AIHome, AssetDetail, AssetLibrary, SubmitAsset } from './pages/AI';
import { Members, Profile } from './pages/Team';
import { AssignPath, MembersAdmin, PathEditor, ReviewQueue } from './pages/Admin';
import { Login, Soon } from './pages/Misc';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<AppLayout />}>
              <Route index element={<Home />} />
              <Route path="growth" element={<Navigate to="/growth/path" replace />} />
              <Route path="growth/path" element={<PathOverview />} />
              <Route path="growth/me" element={<MyPath />} />
              <Route path="growth/tasks/:id" element={<TaskDetail />} />
              <Route path="growth/board" element={<MentorBoard />} />
              <Route path="ai" element={<AIHome />} />
              <Route path="ai/assets" element={<AssetLibrary />} />
              <Route path="ai/assets/:id" element={<AssetDetail />} />
              <Route path="ai/submit" element={<SubmitAsset />} />
              <Route path="team" element={<Members />} />
              <Route path="team/:id" element={<Profile />} />
              <Route path="admin" element={<Navigate to="/admin/review" replace />} />
              <Route path="admin/review" element={<ReviewQueue />} />
              <Route path="admin/members" element={<MembersAdmin />} />
              <Route path="admin/path" element={<PathEditor />} />
              <Route path="admin/assign" element={<AssignPath />} />
              <Route path="admin/soon" element={<Soon which="admin" />} />
              <Route path="knowledge" element={<Soon which="knowledge" />} />
              <Route path="incentive" element={<Soon which="incentive" />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
