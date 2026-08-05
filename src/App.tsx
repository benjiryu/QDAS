import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './app/AppShell';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectPage } from './pages/ProjectPage';
import { SourcePage } from './pages/SourcePage';
import { NotFoundPage } from './pages/NotFoundPage';

/**
 * Route table. Every route renders inside the shell, so the landmark structure
 * is identical on all of them.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/projects" replace />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectPage />} />
        <Route path="projects/:projectId/sources/:sourceId" element={<SourcePage />} />
        {/* Without this, an unmatched URL renders a page with no h1. */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
