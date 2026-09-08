// src/App.tsx
import { useEffect, useState, useRef } from 'react';
import keycloak from './keycloak';
import { Whiteboard } from './components/Whiteboard';

function App() {
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [username, setUsername] = useState<string>('');
  const [guestName, setGuestName] = useState<string>(`Guest_${Math.floor(1000 + Math.random() * 9000)}`);
  const [initialRoomId, setInitialRoomId] = useState<string>('main-room');
  const [keycloakError, setKeycloakError] = useState<string | null>(null);
  const isInitialized = useRef<boolean>(false);

  // Check if Keycloak is configured for the current environment
  const isLocal = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1'
  );
  const customKeycloakUrl = import.meta.env.VITE_KEYCLOAK_URL;
  const isKeycloakConfigured = Boolean(
    (customKeycloakUrl && !customKeycloakUrl.includes('localhost')) || isLocal
  );

  // Get room ID from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      setInitialRoomId(roomParam);
    }
  }, []);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    // In production without a public Keycloak URL, skip Keycloak init to avoid ERR_CONNECTION_REFUSED
    if (!isKeycloakConfigured) {
      setLoading(false);
      return;
    }

    // Safety timeout in case local Keycloak is offline so it never hangs the page
    const timer = setTimeout(() => {
      setLoading(false);
    }, 2000);

    // Initialize without forcing check-sso redirect so unauthenticated visitors are never redirected to localhost
    keycloak
      .init({
        checkLoginIframe: false,
      })
      .then((auth) => {
        clearTimeout(timer);
        setAuthenticated(auth);
        if (auth && keycloak.tokenParsed) {
          const name =
            keycloak.tokenParsed.preferred_username ||
            keycloak.tokenParsed.name ||
            'User';
          setUsername(name);
        }
      })
      .catch((err) => {
        clearTimeout(timer);
        console.warn('Keycloak initialization skipped or unavailable:', err);
      })
      .finally(() => {
        clearTimeout(timer);
        setLoading(false);
      });
  }, [isKeycloakConfigured]);

  const handleKeycloakLogin = () => {
    if (!isKeycloakConfigured) {
      setKeycloakError(
        'Keycloak SSO is configured for local Docker enterprise development. Use Guest Mode above to collaborate instantly on this live demo!'
      );
      return;
    }

    keycloak.login().catch((err) => {
      console.error('Login redirect failed:', err);
      setKeycloakError('Could not connect to Keycloak server. You can continue in Guest Demo Mode.');
    });
  };

  const handleGuestLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = guestName.trim() || `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
    setUsername(finalName);
    setAuthenticated(true);
  };

  const handleLogout = () => {
    setAuthenticated(false);
    setUsername('');
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100 bg-light">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <span className="ms-3 text-secondary fs-5">Loading CollabBoard...</span>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100 canvas-grid-bg p-3">
        <div className="glass-panel p-4 p-md-5 rounded-5 shadow-lg text-center" style={{ maxWidth: '440px', width: '100%' }}>
          <div className="d-inline-flex p-3 rounded-circle bg-primary bg-opacity-10 text-primary mb-3">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
              <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
              <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>
              <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
            </svg>
          </div>
          
          <h3 className="fw-bold text-slate-800 mb-1">Collaborative Whiteboard</h3>
          <p className="text-muted small mb-4">
            Real-time multi-user drawing, templates, live cursors, and presentation tools.
          </p>

          {keycloakError && (
            <div className="alert alert-warning py-2 px-3 small rounded-3 mb-3 text-start">
              <small className="fw-semibold d-block">ℹ️ Live Demo Notice:</small>
              <small className="text-muted">Keycloak server is offline. Use Guest Mode below to test all real-time features instantly!</small>
            </div>
          )}

          <form onSubmit={handleGuestLogin} className="mb-3 text-start">
            <label className="form-label small fw-semibold text-secondary">Your Display Name</label>
            <div className="input-group mb-3">
              <input
                type="text"
                className="form-control rounded-start-3"
                placeholder="Enter your name..."
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-primary rounded-end-3 px-3 fw-semibold">
                Join Board
              </button>
            </div>
          </form>

          <div className="d-flex align-items-center my-3">
            <hr className="flex-grow-1 opacity-25" />
            <span className="px-3 text-muted small">or</span>
            <hr className="flex-grow-1 opacity-25" />
          </div>

          <button
            type="button"
            className="btn btn-outline-secondary w-100 py-2 rounded-3 d-flex align-items-center justify-content-center gap-2 fw-medium"
            onClick={handleKeycloakLogin}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span>Sign in with Keycloak (SSO)</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-100 vh-100 overflow-hidden">
      <Whiteboard username={username} initialRoomId={initialRoomId} onLogout={handleLogout} />
    </div>
  );
}

export default App;