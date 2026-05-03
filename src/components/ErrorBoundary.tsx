import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('🔴 ErrorBoundary caught:', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: '#f8f8f8',
          fontFamily: 'Poppins, system-ui, sans-serif',
          padding: '24px',
          textAlign: 'center',
        }}>
          {/* Error Icon */}
          <div style={{
            width: 80, height: 80,
            borderRadius: '50%',
            background: '#fee2e2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111', margin: '0 0 8px' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px', maxWidth: 320, lineHeight: 1.6 }}>
            An unexpected error occurred. Please reload the app to continue.
          </p>

          <button
            onClick={this.handleReload}
            style={{
              padding: '14px 32px',
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(220,38,38,0.3)',
              transition: 'transform 0.2s',
            }}
            onMouseDown={(e) => { (e.target as HTMLButtonElement).style.transform = 'scale(0.97)'; }}
            onMouseUp={(e) => { (e.target as HTMLButtonElement).style.transform = 'scale(1)'; }}
          >
            Reload App
          </button>

          {/* Error detail (dev only) */}
          {import.meta.env.DEV && this.state.error && (
            <details style={{ marginTop: 32, maxWidth: 400, textAlign: 'left', width: '100%' }}>
              <summary style={{ fontSize: 11, color: '#9ca3af', cursor: 'pointer', fontWeight: 600 }}>
                Error Details (Dev)
              </summary>
              <pre style={{
                marginTop: 8, padding: 12, background: '#f3f4f6', borderRadius: 8,
                fontSize: 11, color: '#374151', overflow: 'auto', whiteSpace: 'pre-wrap',
              }}>
                {this.state.error.message}
                {'\n\n'}
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
