import React, { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import logoUou from '../assets/logo-uou.png';
import CompanySwitcher from './CompanySwitcher';
import { useMyCompanies, getActiveCompanyId, setActiveCompanyId } from '../lib/companies';
import {
  Home, Radio, Bell, User, LogOut,
  LayoutDashboard, PlusCircle, Film, Wallet, MessageCircle, Building2,
  Eye, Handshake, Megaphone, Clapperboard, Store, Users, Settings,
} from 'lucide-react';

// ✅ Abas do modo Usuário comum
const USER_MENU = [
  { path: '/', icon: Home, label: 'Home', end: true },
  { path: '/lives', icon: Radio, label: 'Lives' },
  { path: '/notificacoes', icon: Bell, label: 'Notificações' },
  { path: '/perfil', icon: User, label: 'Perfil' },
];

// ✅ Abas do modo Criador de Conteúdo (trocam quando o toggle é ativado)
const CREATOR_MENU = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { path: '/postar', icon: PlusCircle, label: 'Criar' },
  { path: '/criar', icon: Film, label: 'Editar' },
  { path: '/carteira', icon: Wallet, label: 'Carteira' },
];

// ✅ Menu quando está dentro do perfil de uma empresa (as abas serão definidas depois)
const COMPANY_MENU = [
  { path: '/empresa', icon: Eye, label: 'Perfil', end: true },
  { path: '/empresa/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/empresa/parceiros', icon: Handshake, label: 'Parceiros' },
  { path: '/empresa/marketing', icon: Megaphone, label: 'Marketing' },
  { path: '/empresa/posts', icon: Clapperboard, label: 'Posts' },
  { path: '/empresa/loja', icon: Store, label: 'Loja' },
  { path: '/empresa/financeiro', icon: Wallet, label: 'Financeiro' },
  { path: '/empresa/equipe', icon: Users, label: 'Equipe' },
  { path: '/empresa/configuracoes', icon: Settings, label: 'Configurações' },
];

const SIDEBAR_COLLAPSED = 84;
const SIDEBAR_EXPANDED = 260;

export default function Layout() {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const mainRef = useRef(null);
  const [scrollbarW, setScrollbarW] = useState(0); // largura da barra de rolagem, para centralizar o header com o feed
  const [toggleInFeed, setToggleInFeed] = useState(false); // Home pode hospedar o seletor Usuário/Criador na barra do feed

  // ✅ Por enquanto o modo fica salvo no navegador (localStorage).
  // Quando quiser, integramos com um campo no Firestore (ex: users/{uid}.isCreator).
  const [isCreator, setIsCreator] = useState(() => {
    try {
      return localStorage.getItem('uou_web_role') === 'creator';
    } catch {
      return false;
    }
  });

  // ✅ Perfil de empresa: troca estilo Nubank (ícone no header). Empresa ativa fica salva no navegador.
  const uid = auth.currentUser?.uid;
  const companies = useMyCompanies(uid);
  const [activeId, setActiveId] = useState(() => getActiveCompanyId());
  const activeCompany = companies?.find((c) => c.id === activeId) || null;

  // Se a empresa salva não existe mais (ou o usuário saiu dela), volta ao perfil pessoal.
  useEffect(() => {
    if (activeId && companies && !companies.some((c) => c.id === activeId)) {
      setActiveCompanyId(null);
      setActiveId(null);
    }
  }, [activeId, companies]);

  const enterCompany = (c) => {
    setActiveCompanyId(c.id);
    setActiveId(c.id);
    navigate('/empresa');
  };
  const leaveCompany = () => {
    setActiveCompanyId(null);
    setActiveId(null);
    navigate('/perfil');
  };

  // Foto do perfil para o ícone "Perfil" da sidebar (se tiver)
  const [myPhoto, setMyPhoto] = useState(null);
  useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(doc(db, 'users', uid), (snap) => setMyPhoto(snap.exists() ? snap.data().photoURL || null : null), () => {});
  }, [uid]);

  const menuItems = activeCompany ? COMPANY_MENU : (isCreator ? CREATOR_MENU : USER_MENU);

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

  const roleToggle = (
    <>
      <span style={{ ...styles.toggleLabel, ...(!isCreator ? styles.toggleLabelActive : {}) }}>Usuário</span>
      <button
        type="button"
        onClick={toggleRole}
        style={{ ...styles.toggleTrack, ...(isCreator ? styles.toggleTrackOn : {}) }}
        aria-label="Alternar entre modo usuário e criador"
      >
        <span style={{ ...styles.toggleThumb, ...(isCreator ? styles.toggleThumbOn : {}) }} />
      </button>
      <span style={{ ...styles.toggleLabel, ...(isCreator ? styles.toggleLabelActive : {}) }}>Criador</span>
    </>
  );

  useEffect(() => {
    const el = mainRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setScrollbarW(el.offsetWidth - el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    const mo = new MutationObserver(() => { if (el.firstElementChild) ro.observe(el.firstElementChild); measure(); });
    mo.observe(el, { childList: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, []);

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
      {/* Reserva fixa do espaço da sidebar colapsada; ao expandir, ela passa POR CIMA do conteúdo (como no Instagram) */}
      <div style={{ width: `${SIDEBAR_COLLAPSED}px`, flexShrink: 0, position: 'relative' }}>
      <aside
        style={{
          ...styles.sidebar,
          width: hovered ? `${SIDEBAR_EXPANDED}px` : `${SIDEBAR_COLLAPSED}px`,
          ...(hovered ? { boxShadow: '8px 0 32px rgba(0,0,0,0.6)' } : {}),
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Logo do UOU: fica só aqui na sidebar (não se move quando ela expande) */}
        <div style={styles.sideLogo}><img src={logoUou} alt="UOU" style={styles.sideLogoImg} /></div>

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
                ...(activeCompany ? { padding: hovered ? '10px 28px' : '10px 0' } : {}),
              })}
            >
              {({ isActive }) => (
                <>
                  {item.path === '/perfil' && myPhoto ? (
                    <img
                      src={myPhoto}
                      alt=""
                      style={{ ...styles.navAvatar, ...(isActive ? { borderColor: '#52fa35' } : {}) }}
                    />
                  ) : (
                    <item.icon size={26} style={{ flexShrink: 0 }} />
                  )}
                  {hovered && <span style={styles.navLabel}>{item.label}</span>}
                </>
              )}
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
      </div>

      {/* Coluna principal: header + conteúdo */}
      <div style={styles.mainWrapper}>
        <header style={{ ...styles.header, paddingRight: `${32 + scrollbarW}px` }}>
          <div />
          {/* Espaço onde a Home pode encaixar as abas (Pra Você / Seguindo / Viral / Descobrir) */}
          <div id="uou-header-slot" style={{ display: 'flex', justifyContent: 'center', minWidth: 0 }} />

          {/* ✅ Toggle Usuário / Criador de Conteúdo */}
          <div style={{ ...styles.headerSide, ...styles.toggleWrap }}>
            <CompanySwitcher
              uid={uid}
              companies={companies || []}
              activeCompany={activeCompany}
              onEnter={enterCompany}
              onLeave={leaveCompany}
            />
            {!activeCompany && !toggleInFeed && roleToggle}
          </div>
        </header>

        <main ref={mainRef} style={styles.main}>
          {activeCompany?.status === 'suspended' ? (
            <div style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center', color: '#f0f0f0' }}>
              <h2 style={{ margin: '0 0 8px' }}>Empresa suspensa</h2>
              <p style={{ color: '#8a8a95', fontSize: 14 }}>
                O perfil de "{activeCompany.tradeName || activeCompany.legalName}" foi suspenso pela equipe do UOU.
                {activeCompany.suspendedReason ? ` Motivo: ${activeCompany.suspendedReason}` : ''}
              </p>
              <p style={{ color: '#8a8a95', fontSize: 13 }}>Use o botão "Perfil pessoal" no topo para voltar.</p>
            </div>
          ) : (
            <Outlet context={{ isCreator, company: activeCompany, setToggleInFeed, roleToggle }} />
          )}
        </main>
      </div>

      {/* ✅ Botão flutuante de Chat, canto inferior direito, visível nos dois modos */}
      <button
        type="button"
        onClick={() => navigate('/chat')}
        style={styles.chatFab}
        aria-label="Abrir chat"
      >
        <MessageCircle size={26} color="#52fa35" />
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
    zIndex: 30,
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    boxSizing: 'border-box',
    transition: 'width 0.18s ease, box-shadow 0.18s ease',
  },
  sideLogo: { width: `${SIDEBAR_COLLAPSED}px`, display: 'flex', justifyContent: 'center', flexShrink: 0, paddingTop: '4px' },
  sideLogoImg: { height: '22px', width: 'auto', display: 'block' },
  navAvatar: { width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid transparent', boxSizing: 'border-box' },
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
    color: '#f0f0f0',
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
    height: '56px',
    borderBottom: '1px solid #1a1a1a',
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    padding: '0 32px',
    flexShrink: 0,
  },
  headerSide: {
    display: 'flex',
    alignItems: 'center',
  },
  headerLogo: {
    fontSize: '24px',
    fontWeight: '900',
    color: '#52fa35',
    margin: 0,
    letterSpacing: '2px',
    justifySelf: 'center',
    display: 'flex',
    alignItems: 'center',
  },
  headerLogoImg: { height: '26px', width: 'auto', display: 'block' },
  toggleWrap: {
    justifyContent: 'flex-end',
    gap: '10px',
  },
  toggleLabel: {
    fontSize: '13px',
    color: '#aaa',
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
    padding: '14px 32px 32px',
  },
  chatFab: {
    position: 'absolute',
    bottom: '28px',
    right: '28px',
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    backgroundColor: 'rgba(82,250,53,0.10)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    border: '1px solid #52fa35',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 20,
  },
};
