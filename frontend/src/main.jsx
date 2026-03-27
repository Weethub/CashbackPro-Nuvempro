import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@nimbus-ds/styles/dist/index.css';
import './i18n/index.js';
import App from './App.jsx';
import NexoProvider from './providers/NexoProvider.jsx';
import InstallSuccess from './pages/InstallSuccess.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

function Root() {
  const params = new URLSearchParams(window.location.search);
  const sessionToken = params.get('session_token');

  if (sessionToken) {
    return (
      <ErrorBoundary>
        <InstallSuccess />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <NexoProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </NexoProvider>
    </ErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
