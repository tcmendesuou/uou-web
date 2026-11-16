import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext } from 'react-router-dom';
import Highlights from '../components/Highlights';
import FeedTopBar from '../components/FeedTopBar';
import PostFeed from '../components/PostFeed';
import Dashboard from './Dashboard';

// Degradê do topo: roxo → azul → verde, trocando bem devagar (as três camadas se alternam sem pular)
const GLOW_CSS = `
@keyframes uouGlowFade { 0% { opacity: 0; } 33% { opacity: 1; } 66% { opacity: 0; } 100% { opacity: 0; } }
.uou-glow-layer { position: absolute; inset: 0; opacity: 0; animation: uouGlowFade 60s linear infinite; }
@media (prefers-reduced-motion: reduce) { .uou-glow-layer { animation: none; } .uou-glow-layer:first-child { opacity: 1; } }
`;
const GLOWS = [
  'rgba(96, 36, 140, 0.55)',  // roxo
  'rgba(30, 90, 220, 0.60)',  // azul
  'rgba(40, 200, 70, 0.50)',  // verde
];

export default function Home() {
  const { isCreator } = useOutletContext();
  const [selectedTab, setSelectedTab] = useState('para-voce');
  const [searchText, setSearchText] = useState('');
  const [slot, setSlot] = useState(null);

  useEffect(() => { setSlot(document.getElementById('uou-header-slot')); }, []);

  if (isCreator) {
    return <Dashboard />;
  }

  const topBarProps = { selectedTab, onSelectTab: setSelectedTab, searchText, onSearchChange: setSearchText };

  return (
    <div style={{ position: 'relative' }}>
      <style>{GLOW_CSS}</style>
      <div style={styles.glow} aria-hidden>
        {GLOWS.map((c, i) => (
          <div
            key={c}
            className="uou-glow-layer"
            style={{
              animationDelay: `${-20 * (i + 1)}s`,
              background: `radial-gradient(ellipse 80% 100% at 50% 0%, ${c} 0%, rgba(20, 10, 40, 0.18) 45%, rgba(1, 2, 8, 0) 100%)`,
            }}
          />
        ))}
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
      <Highlights />
      {/* As abas ficam no header (junto do seletor Usuário/Criador) */}
      {slot && createPortal(<FeedTopBar {...topBarProps} compact />, slot)}
      <PostFeed selectedTab={selectedTab} searchText={searchText} />
      </div>
    </div>
  );
}

const styles = {
  glow: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    height: '360px',
    pointerEvents: 'none',
    overflow: 'hidden',
  },
};
