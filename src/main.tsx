import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AdvancedAccessProvider } from './components/AdvancedAccessContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdvancedAccessProvider>
      <App />
    </AdvancedAccessProvider>
  </StrictMode>,
);
