import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const root = createRoot(document.getElementById('root'));
const routePath = window.location.pathname.replace(/\/+$/, '') || '/';

async function mountApplication() {
  if (routePath === '/pdf-manager') {
    const { PdfManagerApp } = await import('./pdfManager/PdfManagerApp.jsx');
    root.render(
      <React.StrictMode>
        <PdfManagerApp />
      </React.StrictMode>,
    );
    return;
  }

  const [{ default: App }, { AuthShell }] = await Promise.all([
    import('./App.jsx'),
    import('./auth/AuthShell.jsx'),
  ]);
  root.render(
    <React.StrictMode>
      <AuthShell>
        {(authState) => <App {...authState} />}
      </AuthShell>
    </React.StrictMode>,
  );
}

void mountApplication().catch((error) => {
  console.error('Unable to load the application:', error);
  root.render(<main className="pdf-manager-auth-page"><p>The website could not be loaded. Refresh and try again.</p></main>);
});
