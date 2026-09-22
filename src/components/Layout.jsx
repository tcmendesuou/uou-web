import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import {
  Home, Radio, Bell, Wallet, User, LogOut,
  LayoutDashboard, Eye, PlusCircle, MessageCircle,
} from 'lucide-react';

// ✅ Abas do modo Usuário comum
const USER_MENU = [
  { path: '/', icon: Home, label: 'Home', end: true },
  { path: '/lives', icon: Radio, label: 'Lives' },
  { path: '/notificacoes', icon: Bell, label: 'Notificações' },
  { path: '/carteira', icon: Wallet, label: 'Carteira' },
  { path: '/perfil', icon: User, label: 'Perfil' },
];

// ✅ Abas do modo Criador de Conteúdo (trocam quando o toggle é ativado)
const CREATOR_MENU = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { path: '/visualizar-perfil', icon: Eye, label: 'Visualização do Perfil' },
  { path: '/criar', icon: PlusCircle, label: 'Criar' },
  { path: '/carteira', icon: Wallet, label: 'Carteira' },
  { path: '/perfil', icon: User, label: 'Perfil' },
];

const SIDEBAR_COLLAPSED = 84;
const SIDEBAR_EXPANDED = 260;

export default function Layout() {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  // ✅ Por enquanto o modo fica salvo no navegador (localStorage).
  // Quando quiser, integramos com um campo no Firestore (ex: users/{uid}.isCreator).
  const [isCreator, setIsCreator] = useState(() => {
    try {
      return localStorage.getItem('uou_web_role') === 'creator';
    } catch {
      return false;
    }
  });

  const menuItems = isCreator ? CREATOR_MENU : USER_MENU;

  const toggleRole = () => {
    setIsCreator((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('uou_web_role', next ? 'creator' : 'user');
      } catch {
        // ignora se localStorage não estiver disponível
      }
      return next;
    });
  };

  const handleLogout = async () => {
    if (window.confirm('Deseja sair?')) {
      await signOut(auth);
      navigate('/login');
    }
  };

  return (
    <div style={styles.container}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" />

      {/* Sidebar — colapsada por padrão, expande no hover */}
      <aside
        style={{
          ...styles.sidebar,
          width: hovered ? `${SIDEBAR_EXPANDED}px` : `${SIDEBAR_COLLAPSED}px`,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div style={styles.logo}>
          <h1 style={styles.logoText}>UOU</h1>
        </div>

        {/* ✅ Espaçador: empurra o menu pra parte de baixo da sidebar */}
        <div style={{ flex: 1 }} />

        <nav style={styles.nav}>
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              style={({ isActive }) => ({
                ...styles.navItem,
                ...(hovered ? styles.navItemExpanded : styles.navItemCollapsed),
                ...(isActive ? styles.navItemActive : {}),
              })}
            >
              <item.icon size={26} style={{ flexShrink: 0 }} />
              {hovered && <span style={styles.navLabel}>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          style={{
            ...styles.logoutButton,
            ...(hovered ? styles.navItemExpanded : styles.navItemCollapsed),
          }}
          onClick={handleLogout}
        >
          <LogOut size={26} style={{ flexShrink: 0 }} />
          {hovered && <span style={styles.navLabel}>Sair</span>}
        </button>
      </aside>

      {/* Coluna principal: header + conteúdo */}
      <div style={styles.mainWrapper}>
        <header style={styles.header}>
          <div />

          {/* ✅ Toggle Usuário / Criador de Conteúdo */}
          <div style={styles.toggleWrap}>
            <span style={{ ...styles.toggleLabel, ...(!isCreator ? styles.toggleLabelActive : {}) }}>
              Usuário
            </span>
            <button
              type="button"
              onClick={toggleRole}
              style={{ ...styles.toggleTrack, ...(isCreator ? styles.toggleTrackOn : {}) }}
              aria-label="Alternar entre modo usuário e criador"
            >
              <span style={{ ...styles.toggleThumb, ...(isCreator ? styles.toggleThumbOn : {}) }} />
            </button>
            <span style={{ ...styles.toggleLabel, ...(isCreator ? styles.toggleLabelActive : {}) }}>
              Criador
            </span>
          </div>
        </header>

        <main style={styles.main}>
          <Outlet context={{ isCreator }} />
        </main>
      </div>

      {/* ✅ Botão flutuante de Chat, canto inferior direito, visível nos dois modos */}
      <button
        type="button"
        onClick={() => navigate('/chat')}
        style={styles.chatFab}
        aria-label="Abrir chat"
      >
        <MessageCircle size={26} color="#010208" />
      </button>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    height: '100vh',
    backgroundColor: '#010208',
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    position: 'relative',
  },
  sidebar: {
    backgroundColor: '#000',
    borderRight: '1px solid #1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 0',
    flexShrink: 0,
    overflow: 'hidden',
    transition: 'width 0.18s ease',
    zIndex: 10,
  },
  logo: {
    marginBottom: '12px',
    paddingBottom: '20px',
    paddingLeft: '28px',
    borderBottom: '1px solid #1a1a1a',
  },
  logoText: {
    fontSize: '26px',
    fontWeight: '900',
    color: '#52fa35',
    margin: 0,
    letterSpacing: '2px',
    whiteSpace: 'nowrap',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    paddingBottom: '12px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '14px 0',
    color: '#ccc',
    textDecoration: 'none',
    fontSize: '15px',
    fontWeight: '500',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  navItemCollapsed: {
    justifyContent: 'center',
    padding: '14px 0',
  },
  navItemExpanded: {
    justifyContent: 'flex-start',
    padding: '14px 28px',
  },
  navItemActive: {
    color: '#52fa35',
  },
  navLabel: {
    overflow: 'hidden',
  },
  logoutButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    color: '#ff4444',
    backgroundColor: 'transparent',
    border: 'none',
    borderTop: '1px solid #1a1a1a',
    fontSize: '15px',
    fontWeight: '500',
    cursor: 'pointer',
    marginTop: '8px',
    paddingTop: '20px',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  mainWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  header: {
    height: '72px',
    borderBottom: '1px solid #1a1a1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 32px',
    flexShrink: 0,
  },
  toggleWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  toggleLabel: {
    fontSize: '13px',
    color: '#666',
    fontWeight: '600',
  },
  toggleLabelActive: {
    color: '#fff',
  },
  toggleTrack: {
    width: '46px',
    height: '26px',
    borderRadius: '13px',
    backgroundColor: '#333',
    border: 'none',
    padding: '3px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  toggleTrackOn: {
    backgroundColor: '#52fa35',
  },
  toggleThumb: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: '#fff',
    transition: 'transform 0.2s',
    transform: 'translateX(0)',
  },
  toggleThumbOn: {
    transform: 'translateX(20px)',
  },
  main: {
    flex: 1,
    overflow: 'auto',
    padding: '32px',
  },
  chatFab: {
    position: 'absolute',
    bottom: '28px',
    right: '28px',
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    backgroundColor: '#52fa35',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(82, 250, 53, 0.35)',
    zIndex: 20,
  },
};
