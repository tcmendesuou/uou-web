import React, { useState } from 'react';
import { Search } from 'lucide-react';

const TABS = [
  { id: 'para-voce', label: 'Pra Você' },
  { id: 'seguindo', label: 'Seguindo' },
  { id: 'viral', label: 'Viral' },
];

export default function FeedTopBar({ selectedTab, onSelectTab, searchText, onSearchChange }) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div style={styles.container}>
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
            {tab.label}
          </button>
        ))}
      </div>

      <div style={styles.searchWrap}>
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
        <button
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
          style={styles.searchButton}
          aria-label="Buscar"
        >
          <Search size={18} color="#ccc" />
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid #1a1a1a',
    paddingBottom: '16px',
    marginBottom: '24px',
  },
  tabs: {
    display: 'flex',
    gap: '8px',
  },
  tab: {
    padding: '8px 18px',
    borderRadius: '20px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#888',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  tabActive: {
    backgroundColor: 'rgba(82, 250, 53, 0.15)',
    color: '#52fa35',
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
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
