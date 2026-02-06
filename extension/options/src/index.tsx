import React from 'react';
import { createRoot } from 'react-dom/client';
import OptionsApp from './OptionsApp';

// Initialize React app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <OptionsApp />
    </React.StrictMode>
  );
}