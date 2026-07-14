import { createRoot } from 'react-dom/client';
import { App } from './App';
import { FullscreenPreview } from './FullscreenPreview';
import './styles.css';

const previewUrl = new URLSearchParams(location.search).get('previewUrl');

createRoot(document.getElementById('root')!).render(
  previewUrl ? <FullscreenPreview url={previewUrl} /> : <App />,
);
