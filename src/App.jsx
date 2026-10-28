import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import Layout from './components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
const Notificacoes = lazy(() => import('./pages/Notificacoes'));
const Chat = lazy(() => import('./pages/Chat'));
const Carteira = lazy(() => import('./pages/Carteira'));
const Perfil = lazy(() => import('./pages/Perfil'));
const Criar = lazy(() => import('./pages/Criar'));
const Postar = lazy(() => import('./pages/Postar'));
const Lives = lazy(() => import('./pages/Lives'));
const LiveViewer = lazy(() => import('./pages/LiveViewer'));
const LiveHost = lazy(() => import('./pages/LiveHost'));

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = carregando, null = deslogado

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return unsubscribe;
  }, []);

  if (user === undefined) {
    return (
      <div style={styles.loading}>
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<div style={styles.loading}><p>Carregando...</p></div>}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={user ? <Layout /> : <Navigate to="/login" replace />}>
          <Route index element={<Home />} />

          {/* Modo Usuário */}
          <Route path="lives" element={<Lives />} />
          <Route path="lives/:liveId" element={<LiveViewer />} />
          <Route path="notificacoes" element={<Notificacoes />} />

          {/* Modo Criador */}
          <Route path="postar" element={<Postar />} />
          <Route path="transmitir/:liveId" element={<LiveHost />} />
          <Route path="criar" element={<Criar />} />
          <Route path="carteira" element={<Carteira />} />

          {/* Modo Usuário */}
          <Route path="perfil" element={<Perfil />} />
          <Route path="chat" element={<Chat />} />
        </Route>
        <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

const styles = {
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#010208',
    color: '#52fa35',
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
  },
};
