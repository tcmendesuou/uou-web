import React, { useState } from 'react';
import { Search, Zap } from 'lucide-react';

const TABS = [
  { id: 'para-voce', label: 'Pra Você' },
  { id: 'seguindo', label: 'Seguindo' },
  { id: 'viral', label: 'Viral' },
];

const VIRAL_COLOR = '#00ff00';

export default function FeedTopBar({ selectedTab, onSelectTab, searchText, onSearchChange, rightSlot = null, compact = false }) {
  const [searchOpen, setSearchOpen] = useState(false);

  const tabs = (
    <div style={styles.tabs}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelectTab(tab.id)}
          style={{
            ...styles.tab,
            ...(selectedTab === tab.id ? styles.tabActive : {}),
          }}
        >
          {tab.id === 'viral' ? (
            <span style={styles.viralRow}>
              <Zap size={11} color={VIRAL_COLOR} fill={VIRAL_COLOR} />
              <span style={{ color: VIRAL_COLOR }}>{tab.label.toUpperCase()}</span>
              <Zap size={11} color={VIRAL_COLOR} fill={VIRAL_COLOR} />
            </span>
          ) : (
            tab.label
          )}
          {selectedTab === tab.id && (
            <span style={{ ...styles.indicator, ...(tab.id === 'viral' ? { backgroundColor: '#00BFFF' } : {}) }} />
          )}
        </button>
      ))}

      {/* Descobrir (lupa): abre a busca ao lado */}
      <button
        type="button"
        onClick={() => setSearchOpen((v) => !v)}
        style={{ ...styles.tab, ...styles.discover, ...(searchOpen || searchText ? styles.tabActive : {}) }}
        aria-label="Descobrir"
      >
        <Search size={14} /> Descobrir
      </button>
      {searchOpen && (
        <input
          autoFocus
          type="text"
          placeholder="Buscar..."
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          style={styles.searchInput}
          onBlur={() => { if (!searchText) setSearchOpen(false); }}
        />
      )}
    </div>
  );

  // Dentro do header (compact): só as abas, sem linha nem espaçamento
  if (compact) return tabs;

  return (
    <div style={styles.container}>
      <div />
      {tabs}
      <div style={styles.rightWrap}>{rightSlot}</div>
    </div>
  );
}

const styles = {
  container: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    borderBottom: '1px solid #1a1a1a',
    paddingBottom: '8px',
    marginBottom: '12px',
  },
  tabs: {
    display: 'flex',
    alignItems: 'center',
    gap: '30px',
  },
  discover: { display: 'flex', alignItems: 'center', gap: '6px' },
  rightWrap: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' },
  tab: {
    position: 'relative',
    padding: '4px 0',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#666',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  tabActive: {
    color: '#fff',
  },
  viralRow: { display: 'flex', alignItems: 'center', gap: '3px' },
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '2px',
    backgroundColor: '#00ff00',
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  searchInput: {
    padding: '8px 12px',
    borderRadius: '20px',
    border: '1px solid #333',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    fontSize: '13px',
    outline: 'none',
    width: '180px',
    fontFamily: 'inherit',
  },
  searchButton: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: 'none',
    backgroundColor: '#1a1a1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
};
