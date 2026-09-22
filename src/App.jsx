import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import Layout from './components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import Notificacoes from './pages/Notificacoes';
import Chat from './pages/Chat';
import Carteira from './pages/Carteira';
import Perfil from './pages/Perfil';
import Placeholder from './pages/Placeholder';

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
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={user ? <Layout /> : <Navigate to="/login" replace />}>
          <Route index element={<Home />} />

          {/* Modo Usuário */}
          <Route path="lives" element={<Placeholder title="Lives" />} />
          <Route path="notificacoes" element={<Notificacoes />} />

          {/* Modo Criador */}
          <Route path="visualizar-perfil" element={<Placeholder title="Visualização do seu Perfil" />} />
          <Route path="criar" element={<Placeholder title="Criar" />} />

          {/* Comuns aos dois modos */}
          <Route path="carteira" element={<Carteira />} />
          <Route path="perfil" element={<Perfil />} />
          <Route path="chat" element={<Chat />} />
        </Route>
        <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
      </Routes>
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
