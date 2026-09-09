import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './App';
import {SharedView} from './components/SharedView';
import {ToastProvider} from './components/ui';
import {api} from './lib/api';
import type {AppConfig} from '../shared/types';

const root = createRoot(document.getElementById('root')!);
const sharedMatch = /^\/m\/([A-Za-z0-9_-]{10,64})\/?$/.exec(window.location.pathname);

function Fatal({message}: {message: string}) {
  return (
    <div style={{display: 'grid', placeItems: 'center', height: '100%', padding: 24}}>
      <div className="card card-pad" style={{maxWidth: 380, textAlign: 'center'}}>
        <div style={{fontWeight: 620, marginBottom: 6}}>Cannot reach the server</div>
        <div className="small muted">{message}</div>
      </div>
    </div>
  );
}

if (sharedMatch) {
  root.render(
    <StrictMode>
      <ToastProvider>
        <SharedView token={sharedMatch[1]} />
      </ToastProvider>
    </StrictMode>,
  );
} else {
  api
    .config()
    .then((config: AppConfig) => {
      document.title = `${config.brandTagline} — ${config.brandName}`;
      root.render(
        <StrictMode>
          <ToastProvider>
            <App config={config} />
          </ToastProvider>
        </StrictMode>,
      );
    })
    .catch((err: unknown) => {
      root.render(<Fatal message={err instanceof Error ? err.message : 'Unknown error'} />);
    });
}
