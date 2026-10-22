// src/pages/Lives.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Radio, Users, CalendarClock, Trophy, ImageOff } from 'lucide-react';
import { db, auth } from '../firebase';
import { brl, isVideoUrl } from '../lib/liveLogic';

const sortByDateDesc = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '');
const sortByScheduled = (a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || '');

export default function Lives() {
  const navigate = useNavigate();
  const [liveNow, setLiveNow] = useState(null); // null = carregando
  const [scheduled, setScheduled] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const onErr = (err) => {
      console.error('[Lives] erro ao carregar:', err);
      setError('Não foi possível carregar as lives. Tente novamente.');
    };
    const unsubLive = onSnapshot(
      query(collection(db, 'lives'), where('status', '==', 'live')),
      (snap) => setLiveNow(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sortByDateDesc)),
      onErr
    );
    const unsubScheduled = onSnapshot(
      query(collection(db, 'lives'), where('status', '==', 'scheduled')),
      (snap) => setScheduled(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sortByScheduled)),
      onErr
    );
    return () => {
      unsubLive();
      unsubScheduled();
    };
  }, []);

  const myUid = auth.currentUser?.uid;

  const open = (live) => {
    if (live.userId === myUid) navigate(`/transmitir/${live.id}`);
    else navigate(`/lives/${live.id}`);
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.pageTitle}>Lives</h1>
      {error && <p style={styles.error}>{error}</p>}

      <h2 style={styles.sectionTitle}>
        <span style={styles.liveDot} /> Ao vivo agora
      </h2>
      {liveNow === null ? (
        <p style={styles.muted}>Carregando...</p>
      ) : liveNow.length === 0 ? (
        <div style={styles.empty}>
          <Radio size={36} color="#333" />
          <p style={styles.muted}>Nenhuma live no ar neste momento.</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {liveNow.map((live) => (
            <LiveCard key={live.id} live={live} mine={live.userId === myUid} onOpen={() => open(live)} />
          ))}
        </div>
      )}

      {scheduled.length > 0 && (
        <>
          <h2 style={{ ...styles.sectionTitle, marginTop: 36 }}>
            <CalendarClock size={18} color="#52fa35" /> Agendadas
          </h2>
          <div style={styles.grid}>
            {scheduled.map((live) => (
              <LiveCard key={live.id} live={live} scheduled mine={live.userId === myUid} onOpen={() => open(live)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LiveCard({ live, scheduled = false, mine = false, onOpen }) {
  const clickable = !scheduled || mine;
  const when = live.scheduledDate
    ? new Date(live.scheduledDate).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';
  const media = live.teaserUrl || live.thumbnail;

  return (
    <button
      type="button"
      onClick={clickable ? onOpen : undefined}
      style={{ ...styles.card, cursor: clickable ? 'pointer' : 'default' }}
    >
      <div style={styles.thumb}>
        {media ? (
          isVideoUrl(media) ? (
            <video src={media} style={styles.thumbMedia} muted loop autoPlay playsInline />
          ) : (
            <img src={media} alt="" style={styles.thumbMedia} />
          )
        ) : (
          <ImageOff size={32} color="#333" />
        )}
        {!scheduled && <span style={styles.liveBadge}>AO VIVO</span>}
        {live.isPremium && (
          <span style={styles.prizeBadge}>
            <Trophy size={11} /> PREMIADA
          </span>
        )}
        {!scheduled && (
          <span style={styles.viewersBadge}>
            <Users size={12} /> {live.viewers || 0}
          </span>
        )}
      </div>
      <div style={styles.cardBody}>
        <p style={styles.cardTitle}>{live.title}</p>
        <p style={styles.cardHost}>{live.userName || 'Criador'}</p>
        <div style={styles.cardMeta}>
          <span style={styles.price}>{live.price > 0 ? brl(live.price) : 'Grátis'}</span>
          {scheduled && <span style={styles.when}>{when}</span>}
          {mine && <span style={styles.mine}>{scheduled ? 'Sua live' : 'Continuar transmissão'}</span>}
        </div>
      </div>
    </button>
  );
}

const styles = {
  container: {
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    maxWidth: 1100,
    margin: '0 auto',
  },
  pageTitle: { color: '#f0f0f0', fontSize: 22, fontWeight: 700, margin: '0 0 24px 0' },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#f0f0f0',
    fontSize: 16,
    fontWeight: 700,
    margin: '0 0 14px 0',
  },
  liveDot: { width: 9, height: 9, borderRadius: '50%', backgroundColor: '#e5262b' },
  muted: { color: '#777', fontSize: 14, margin: 0 },
  error: { color: '#ff4444', fontSize: 13 },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    padding: '40px 0',
    border: '1px dashed #1f1f1f',
    borderRadius: 14,
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 18 },
  card: {
    textAlign: 'left',
    padding: 0,
    border: '1px solid #1a1a1a',
    borderRadius: 14,
    backgroundColor: '#0d0d0d',
    overflow: 'hidden',
    fontFamily: 'inherit',
    color: 'inherit',
  },
  thumb: {
    position: 'relative',
    aspectRatio: '16 / 10',
    backgroundColor: '#111',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbMedia: { width: '100%', height: '100%', objectFit: 'cover' },
  liveBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: '#e5262b',
    color: '#fff',
    fontSize: 11,
    fontWeight: 800,
    borderRadius: 8,
    padding: '3px 8px',
  },
  prizeBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFD700',
    color: '#000',
    fontSize: 10,
    fontWeight: 800,
    borderRadius: 8,
    padding: '3px 8px',
  },
  viewersBadge: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 8,
    padding: '3px 8px',
  },
  cardBody: { padding: 14 },
  cardTitle: {
    color: '#f0f0f0',
    fontSize: 15,
    fontWeight: 700,
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cardHost: { color: '#888', fontSize: 13, margin: '4px 0 10px 0' },
  cardMeta: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  price: { color: '#52fa35', fontSize: 13, fontWeight: 700 },
  when: { color: '#aaa', fontSize: 12 },
  mine: { color: '#FFD700', fontSize: 12, fontWeight: 700 },
};
