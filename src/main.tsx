import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { CategoriesProvider } from './context/CategoriesContext';
import { AddressProvider } from './context/AddressContext';
import ErrorBoundary from './components/ErrorBoundary';

// ─── Global error safety net ────────────────────────────────────────────────
window.onerror = (msg, source, line, col, error) => {
  console.error('🔴 Global error:', { msg, source, line, col, error });
};
window.onunhandledrejection = (event: PromiseRejectionEvent) => {
  console.error('🔴 Unhandled promise rejection:', event.reason);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <AddressProvider>
          <CategoriesProvider>
            <CartProvider>
              <App />
            </CartProvider>
          </CategoriesProvider>
        </AddressProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
