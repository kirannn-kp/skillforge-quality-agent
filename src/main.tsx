import { Component, Suspense, lazy, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Quality workspace render failed', error, info.componentStack); }
  render() {
    if (this.state.failed) return <main className="startup"><h1>Workspace could not render</h1><p>The error is available in the browser console. Reload to start a fresh synthetic session.</p><button onClick={() => location.reload()}>Reload workspace</button></main>;
    return this.props.children;
  }
}
const SkillStudio = lazy(() => import('./SkillStudio'));
const QualityWorkspace = lazy(() => import('./QualityWorkspace'));
const workspace = new URLSearchParams(location.search).get('workspace');
createRoot(document.getElementById('root')!).render(<ErrorBoundary>
  {workspace === 'skills' || workspace === 'quality' ?
    <Suspense fallback={<main className="startup">Loading workspace…</main>}>
      {workspace === 'skills' ? <SkillStudio /> : <QualityWorkspace />}
    </Suspense> : <App />}
</ErrorBoundary>);
