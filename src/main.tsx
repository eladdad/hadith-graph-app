import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initializeGraphvizLayout } from './graphvizLayout';

const root = createRoot(document.getElementById('root')!);

initializeGraphvizLayout().then(() => {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}).catch((error: unknown) => {
  console.error('Could not initialize graph layout', error);
  root.render(
    <main role="alert">
      <p>The graph could not be loaded. Please reload to try again.</p>
      <button onClick={() => window.location.reload()}>Reload</button>
    </main>,
  );
});
