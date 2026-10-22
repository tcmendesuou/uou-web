// src/components/LiveOverlays.jsx
// Peças visuais compartilhadas entre quem assiste e quem transmite.
import React from 'react';
import { Users } from 'lucide-react';
import { brl } from '../lib/liveLogic';
import { formatClock } from '../lib/liveHooks';

const GOLD = '#FFD700';

/** Barra de cima: AO VIVO + tempo restante + espectadores. */
export function LiveTopBar({ remainingSeconds, viewers, backstage = false }) {
  return (
    <div style={styles.topBar}>
      <div style={styles.badge(backstage)}>
        <span style={styles.dot(backstage)} />
        <strong>{backstage ? 'BACKSTAGE' : 'AO VIVO'}</strong>
        {!backstage && remainingSeconds !== null && (
          <span style={styles.time}>{formatClock(remainingSeconds)}</span>
        )}
      </div>
      <div style={styles.viewers}>
        <Users size={15} /> {viewers || 0}
      </div>
    </div>
  );
}

/** Título, descrição e prêmio. */
export function LiveInfo({ live, clock }) {
  if (!live) return null;
  const prize = live.prizeDrawnAt
    ? live.prizeValuePaid || 0
    : live.prizeSource === 'pot'
      ? Math.max((live.potBalance || 0) * ((live.prizePercent || 0) / 100), live.prizeReserve || 0)
      : live.prizeAmount || 0;

  return (
    <div style={styles.info}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={styles.title}>{live.title || 'Live'}</h2>
        {live.isPremium && <span style={styles.premium}>PREMIADA</span>}
      </div>
      {live.description ? <p style={styles.desc}>{live.description}</p> : null}
      {live.isPremium && (
        <div style={styles.prizeRow}>
          <span style={{ color: GOLD, fontWeight: 700, fontSize: 14 }}>Prêmio: {brl(prize)}</span>
          {clock?.timerSeconds !== null && clock?.timerSeconds !== undefined && !live.prizeDrawnAt && (
            <span style={{ color: '#fff', fontSize: 13 }}>Sorteio em: {formatClock(clock.timerSeconds)}</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Contagem grande dos últimos 10s antes do sorteio. */
export function DrawCountdown({ value }) {
  if (value === null || value === undefined) return null;
  return (
    <div style={styles.centerOverlay} aria-live="polite">
      <div style={styles.countdownCircle}>
        <span style={{ color: GOLD, fontSize: 60, fontWeight: 900, lineHeight: 1 }}>{value}</span>
        <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>SORTEIO</span>
      </div>
    </div>
  );
}

/** Anúncio do ganhador (grande por 5s, depois encolhe para o canto). */
export function WinnerCard({ name }) {
  const [small, setSmall] = React.useState(false);
  React.useEffect(() => {
    if (!name) return undefined;
    setSmall(false);
    const t = setTimeout(() => setSmall(true), 5000);
    return () => clearTimeout(t);
  }, [name]);

  if (!name) return null;
  return (
    <div style={small ? styles.winnerSmallWrap : styles.centerOverlay}>
      <div style={{ ...styles.winnerCard, ...(small ? styles.winnerCardSmall : {}) }}>
        <div style={{ fontSize: small ? 14 : 22, color: GOLD, fontWeight: 800, marginBottom: small ? 2 : 8 }}>
          Sorteio realizado!
        </div>
        <div style={{ fontSize: small ? 13 : 17, color: '#fff', fontWeight: 600 }}>{name} ganhou!</div>
        {!small && <div style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>O prêmio foi creditado na carteira</div>}
      </div>
    </div>
  );
}

const styles = {
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  badge: (backstage) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    borderRadius: 16,
    backgroundColor: backstage ? '#2a2a2a' : '#e5262b',
    color: '#fff',
    fontSize: 12,
  }),
  dot: (backstage) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: backstage ? '#aaa' : '#fff',
  }),
  time: { fontVariantNumeric: 'tabular-nums', opacity: 0.9, marginLeft: 4 },
  viewers: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    color: '#f0f0f0',
    fontSize: 13,
    fontWeight: 600,
  },
  info: { marginTop: 14 },
  title: { color: '#f0f0f0', fontSize: 18, fontWeight: 700, margin: 0 },
  premium: {
    backgroundColor: GOLD,
    color: '#000',
    fontSize: 10,
    fontWeight: 800,
    borderRadius: 10,
    padding: '3px 8px',
  },
  desc: { color: '#999', fontSize: 13, lineHeight: 1.5, margin: '6px 0 0 0' },
  prizeRow: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 8, flexWrap: 'wrap' },
  centerOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 20,
  },
  countdownCircle: {
    width: 150,
    height: 150,
    borderRadius: '50%',
    backgroundColor: 'rgba(0,0,0,0.85)',
    border: `3px solid ${GOLD}`,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  winnerCard: {
    backgroundColor: 'rgba(0,0,0,0.88)',
    border: `2px solid ${GOLD}`,
    borderRadius: 16,
    padding: '22px 30px',
    textAlign: 'center',
    maxWidth: '80%',
  },
  winnerCardSmall: { padding: '10px 18px', borderRadius: 12 },
  winnerSmallWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 16,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 20,
  },
};
