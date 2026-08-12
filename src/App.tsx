import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './app/AppShell';
import { CodebookPage } from './pages/CodebookPage';
import { CodedDataPage } from './pages/CodedDataPage';
import { NotesPage } from './pages/NotesPage';
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
        {/* The three destinations, per D-043. Read surfaces: all editing still
            routes through the coding panel via `excerpt.open`. */}
        <Route path="projects/:projectId/codebook" element={<CodebookPage />} />
        <Route path="projects/:projectId/coded-data" element={<CodedDataPage />} />
        <Route path="projects/:projectId/notes" element={<NotesPage />} />
        {/* Without this, an unmatched URL renders a page with no h1. */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
