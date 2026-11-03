import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import Layout from './components/Layout';
import Login from './pages/Login';
import Landing from './pages/Landing';
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
const EditorTeste = lazy(() => import('./pages/EditorTeste'));

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = carregando, null = deslogado

  useEffect(() => {
    // Só entra quem já tem cadastro (conta criada no App): se o login criar uma conta nova
    // sem documento em `users` (ex.: Entrar com Google), a pessoa é desconectada.
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) { setUser(null); return; }
      try {
        const snap = await getDoc(doc(db, 'users', u.uid));
        if (!snap.exists()) {
          await signOut(auth);
          window.alert('Não encontramos um cadastro do UOU para essa conta. O cadastro é feito pelo aplicativo UOU.');
          setUser(null);
          return;
        }
      } catch (err) {
        console.warn('[App] não foi possível checar o cadastro:', err?.message);
      }
      setUser(u);
    });
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
        <Route path="/" element={user ? <Layout /> : <Landing />}>
          <Route index element={<Home />} />

          {/* Modo Usuário */}
          <Route path="lives" element={<Lives />} />
          <Route path="lives/:liveId" element={<LiveViewer />} />
          <Route path="notificacoes" element={<Notificacoes />} />

          {/* Modo Criador */}
          <Route path="postar" element={<Postar />} />
          <Route path="transmitir/:liveId" element={<LiveHost />} />
          <Route path="criar" element={<Criar />} />
          <Route path="editor-teste" element={<EditorTeste />} />
          <Route path="carteira" element={<Carteira />} />

          {/* Modo Usuário */}
          <Route path="perfil" element={<Perfil />} />
          <Route path="chat" element={<Chat />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
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
