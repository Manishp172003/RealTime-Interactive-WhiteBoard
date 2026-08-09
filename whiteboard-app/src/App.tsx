// src/App.tsx
import { useEffect, useState } from 'react';
import keycloak from './keycloak';
import { Whiteboard } from './components/Whiteboard';

function App() {
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [username, setUsername] = useState<string>('');

  useEffect(() => {
    keycloak
      .init({
        onLoad: 'login-required',
        checkLoginIframe: false,
      })
      .then((auth) => {
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
        console.error('Keycloak initialization failed:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100 bg-light">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <span className="ms-3 text-secondary fs-5">Authenticating with Keycloak...</span>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100 bg-light">
        <div className="alert alert-danger" role="alert">
          Authentication failed. Please refresh and try logging in again.
        </div>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column vh-100 overflow-hidden">
      {/* Top Navbar */}
      <nav className="navbar navbar-dark bg-dark px-3 justify-content-between flex-shrink-0" style={{ height: '60px' }}>
        <span className="navbar-brand mb-0 h1 fs-5 d-flex align-items-center gap-2">
          🎨 Real-Time Whiteboard
        </span>
        <div className="d-flex align-items-center gap-3">
          <span className="text-light small">
            User: <strong>{username}</strong>
          </span>
          <button
            className="btn btn-outline-danger btn-sm"
            onClick={() => keycloak.logout({ redirectUri: window.location.origin })}
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Main Whiteboard Canvas */}
      <main className="flex-grow-1 position-relative">
        <Whiteboard username={username} />
      </main>
    </div>
  );
}

export default App;