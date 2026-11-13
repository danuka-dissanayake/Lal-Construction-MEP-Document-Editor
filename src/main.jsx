import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AuthShell } from './auth/AuthShell.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthShell>
      {(authState) => <App {...authState} />}
    </AuthShell>
  </React.StrictMode>,
);
