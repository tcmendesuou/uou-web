// src/components/Panel.jsx
// Painel cinza no estilo do Premiere: cabeçalho com título (ou abas) em sublinhado, ícone ≡
// no canto e corpo com rolagem própria. Se receber `drag`, o ícone ≡ vira a alça para
// arrastar o painel e trocar de lugar (veja usePanelLayout em src/lib/panelLayout.js).
import React from 'react';

const GREEN = '#52fa35';

export default function Panel({ area, title, tabs, activeTab, onTab, actions, drag, bodyStyle, children }) {
  return (
    <section
      style={{
        gridArea: area, backgroundColor: '#1b1b1d', borderRadius: 3, minWidth: 0, minHeight: 0, display: 'flex',
        flexDirection: 'column', overflow: 'hidden',
        outline: drag?.over ? `2px dashed ${GREEN}` : '2px solid transparent', outlineOffset: -2,
      }}
      onDragOver={drag?.onOver}
      onDrop={drag?.onDrop}
    >
      <header
        style={s.head}
        draggable={!!drag}
        onDragStart={drag ? (e) => { drag.onStart(e); try { e.dataTransfer.setDragImage(e.currentTarget.parentElement, 24, 16); } catch { /* ok */ } } : undefined}
        onDragEnd={drag?.onEnd}
      >
        <div style={s.tabs}>
          {tabs ? tabs.map((t) => (
            <button key={t.id} type="button" style={s.tab(activeTab === t.id)} onClick={() => onTab?.(t.id)}>
              {t.icon ? <t.icon size={13} /> : null}{t.label}
            </button>
          )) : <span style={s.tab(true)}>{title}</span>}
        </div>
        <div style={s.right}>
          {actions}
          <span style={{ ...s.menu, cursor: drag ? 'grab' : 'default' }} title={drag ? 'Arraste para mudar de lugar' : undefined} aria-hidden>≡</span>
        </div>
      </header>
      <div style={{ ...s.body, ...bodyStyle }}>{children}</div>
    </section>
  );
}

const s = {
  head: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', height: 34, flexShrink: 0,
    borderBottom: '1px solid #2a2a2d', cursor: 'default',
  },
  tabs: { display: 'flex', gap: 16, height: '100%', alignItems: 'stretch', minWidth: 0 },
  tab: (a) => ({
    display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit',
    color: a ? '#e6e6e6' : '#8b8b90', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
    borderBottom: a ? '2px solid #e6e6e6' : '2px solid transparent', boxSizing: 'border-box', cursor: 'pointer',
  }),
  right: { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  menu: { color: '#777', fontSize: 15, userSelect: 'none' },
  body: { padding: 14, flex: 1, minHeight: 0, overflow: 'auto' },
};
