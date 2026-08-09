// src/App.tsx
import { useEffect, useState, useRef } from 'react';
import keycloak from './keycloak';
import { Whiteboard } from './components/Whiteboard';

function App() {
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [username, setUsername] = useState<string>('');
  const [initialRoomId, setInitialRoomId] = useState<string>('main-room');
  const isInitialized = useRef<boolean>(false);

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
    <div className="w-100 vh-100 overflow-hidden">
      <Whiteboard username={username} initialRoomId={initialRoomId} />
    </div>
  );
}

export default App;