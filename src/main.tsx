import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './fonts.css';
// Getijdeninstrument: schreefloos (Instrument Sans) voor alles, mono voor tijden en labels.
import '@fontsource/instrument-sans/400.css';
import '@fontsource/instrument-sans/500.css';
import '@fontsource/instrument-sans/600.css';
import '@fontsource/instrument-sans/700.css';
import '@fontsource/dm-mono/400.css';
import './index.css';
import { setupPwa } from './lib/pwa';

setupPwa();

createRoot(document.getElementById('root')!).render(
  <App />,
);
