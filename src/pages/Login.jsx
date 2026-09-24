import React, { useState } from 'react';
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

// Garante que exista um documento em `users/{uid}` para quem entra pela
// primeira vez via Google/Apple (login por e-mail/senha já é criado no
// cadastro do App). Só cria se ainda não existir — nunca sobrescreve
// um perfil já existente.
async function ensureUserDocument(user) {
  const userRef = doc(db, 'users', user.uid);
  const userDoc = await getDoc(userRef);
  if (!userDoc.exists()) {
    await setDoc(userRef, {
      name: user.displayName || '',
      email: user.email || '',
      photoURL: user.photoURL || null,
      bio: '',
      isPrivate: false,
      followers: 0,
      following: 0,
      wallet: 0,
      createdAt: new Date().toISOString(),
    });
  }
}

function friendlyError(err) {
  if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
    return ''; // usuário cancelou, não precisa mostrar erro
  }
  if (err.code === 'account-exists-with-different-credential') {
    return 'Esse e-mail já está cadastrado com outro método de login.';
  }
  return 'Não foi possível entrar. Tente novamente.';
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error('Erro ao entrar:', err);
      setError('E-mail ou senha inválidos.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await ensureUserDocument(result.user);
    } catch (err) {
      console.error('Erro ao entrar com Google:', err);
      const msg = friendlyError(err);
      if (msg) setError(msg);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    setError('');
    setAppleLoading(true);
    try {
      const provider = new OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');
      const result = await signInWithPopup(auth, provider);
      await ensureUserDocument(result.user);
    } catch (err) {
      console.error('Erro ao entrar com Apple:', err);
      const msg = friendlyError(err);
      if (msg) setError(msg);
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" />
      <div style={styles.card}>
        <h1 style={styles.logo}>UOU</h1>
        <p style={styles.subtitle}>Entrar</p>

        {error && <p style={styles.error}>{error}</p>}

        <form style={styles.form} onSubmit={handleSubmit}>
          <input
            style={styles.input}
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div style={styles.dividerRow}>
          <div style={styles.dividerLine} />
          <span style={styles.dividerText}>ou</span>
          <div style={styles.dividerLine} />
        </div>

        <button
          style={styles.socialButton}
          type="button"
          onClick={handleGoogleLogin}
          disabled={googleLoading}
        >
          <GoogleIcon />
          <span>{googleLoading ? 'Entrando...' : 'Continuar com Google'}</span>
        </button>

        <button
          style={{ ...styles.socialButton, ...styles.appleButton }}
          type="button"
          onClick={handleAppleLogin}
          disabled={appleLoading}
        >
          <AppleIcon />
          <span>{appleLoading ? 'Entrando...' : 'Continuar com Apple'}</span>
        </button>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.86 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 384 512" fill="#fff">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141 0 187.4 0 281.7c0 27.7 5.1 56.4 15.2 86 13.5 39.1 62.2 134.9 113.1 133.3 26.7-.6 45.5-19 80.2-19 33.7 0 51.1 19 80.9 19 51.4-.8 95.5-88.1 108.3-127.3-68.9-32.5-79-95.2-79-104.9zM261 88.9c29.3-34.9 26.6-66.7 25.8-78.9-25.9 1.5-55.9 17.9-72.9 38-18.9 21.6-30 48.4-27.6 78 28-2.1 53.6-16.3 74.7-37.1z" />
    </svg>
  );
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#010208',
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
  },
  card: {
    width: '360px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '40px',
    backgroundColor: '#0d0d0d',
    borderRadius: '16px',
    border: '1px solid #1a1a1a',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  logo: {
    fontSize: '32px',
    fontWeight: '900',
    color: '#52fa35',
    textAlign: 'center',
    margin: 0,
    letterSpacing: '2px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#999',
    textAlign: 'center',
    marginTop: 0,
    marginBottom: '8px',
  },
  error: {
    color: '#f87171',
    fontSize: '13px',
    textAlign: 'center',
    margin: 0,
  },
  input: {
    padding: '14px 16px',
    borderRadius: '8px',
    border: '1px solid #333',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
    fontFamily: 'inherit',
  },
  button: {
    padding: '14px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#52fa35',
    color: '#010208',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    marginTop: '8px',
    fontFamily: 'inherit',
  },
  dividerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '4px 0',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    backgroundColor: '#262626',
  },
  dividerText: {
    color: '#666',
    fontSize: '12px',
  },
  socialButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #333',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  appleButton: {
    backgroundColor: '#000',
    border: '1px solid #333',
  },
};
