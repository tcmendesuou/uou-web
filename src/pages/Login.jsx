import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <div style={styles.container}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" />
      <form style={styles.card} onSubmit={handleSubmit}>
        <h1 style={styles.logo}>UOU</h1>
        <p style={styles.subtitle}>Entrar</p>

        {error && <p style={styles.error}>{error}</p>}

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
    </div>
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
};
