import {initializeTheme} from './ui/theme';
import { createRoot } from 'react-dom/client';
import App from './ui/app';
import '@fontsource-variable/outfit';
import './ui/styles.css';
import './ui/suite.css';
import './ui/suite-app.css';

initializeTheme();

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

if (!hasWebGL()) {
  document.getElementById('root')!.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:var(--ink-900);color:var(--text-hi);font-family:var(--font-ui),sans-serif;padding:2rem;text-align:center">
      <div>
        <h1 style="color:var(--amber)">WebGL unavailable</h1>
        <p>PiVo Ortho requires WebGL to render 3D viewports.<br/>
        Enable hardware acceleration or use a recent desktop browser.</p>
      </div>
    </div>`;
} else {
  const root = createRoot(document.getElementById('root')!);
  root.render(<App />);
}
