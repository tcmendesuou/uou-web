import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Highlights from '../components/Highlights';
import FeedTopBar from '../components/FeedTopBar';
import PostFeed from '../components/PostFeed';

export default function Home() {
  const { isCreator } = useOutletContext();
  const [selectedTab, setSelectedTab] = useState('para-voce');
  const [searchText, setSearchText] = useState('');

  if (isCreator) {
    return (
      <div>
        <h1 style={styles.title}>Dashboard</h1>
        <p style={styles.subtitle}>
          Aqui vamos mostrar o resumo de lives, posts e desempenho do criador.
        </p>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Degradê roxo no topo, igual ao ScreenGlow do app */}
      <div style={styles.glow} aria-hidden />
      <div style={{ position: 'relative', zIndex: 1 }}>
      <Highlights />
      <FeedTopBar
        selectedTab={selectedTab}
        onSelectTab={setSelectedTab}
        searchText={searchText}
        onSearchChange={setSearchText}
      />
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
    background: 'radial-gradient(ellipse 80% 100% at 50% 0%, rgba(96, 36, 140, 0.55) 0%, rgba(40, 14, 70, 0.28) 45%, rgba(1, 2, 8, 0) 100%)',
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#fff',
    margin: 0,
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '15px',
    color: '#999',
    margin: 0,
  },
};
