import {initializeTheme} from './ui/theme';
import { createRoot } from 'react-dom/client';
import App from './ui/app';
import '@fontsource-variable/outfit';
import './ui/styles.css';
import './ui/suite.css';
import './ui/suite-app.css';

initializeTheme();

// Mount storage and native-file controls even when graphics are unavailable.
const root = createRoot(document.getElementById('root')!);
root.render(<App />);
