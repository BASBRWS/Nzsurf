import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './fonts.css';
// Getijdeninstrument: schreef voor het oordeel, schreefloos voor de feiten, mono voor tijden.
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/instrument-sans/400.css';
import '@fontsource/instrument-sans/500.css';
import '@fontsource/instrument-sans/600.css';
import '@fontsource/instrument-sans/700.css';
import '@fontsource/dm-mono/400.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <App />,
);
