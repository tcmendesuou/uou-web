// src/pages/Lives.jsx
// Tela "Live" igual ao app: Ao vivo · Programação · Agenda · Seguindo
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { Radio, Eye, Trophy, ImageOff, Play, CalendarClock, Check } from 'lucide-react';
import { db, auth } from '../firebase';
import { brl, isVideoUrl, payForLive, LIVE_CATEGORIES } from '../lib/liveLogic';

const sortByDateDesc = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '');
const sortByScheduled = (a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || '');
const TABS = [
  { id: 'ao-vivo', label: 'Ao vivo' },
  { id: 'programacao', label: 'Programação' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'seguindo', label: 'Seguindo' },
];

const sameDay = (iso, yyyyMmDd) => {
  if (!iso || !yyyyMmDd) return false;
  const d = new Date(iso);
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return local === yyyyMmDd;
};

export default function Lives() {
  const navigate = useNavigate();
  const myUid = auth.currentUser?.uid;
  const [tab, setTab] = useState('ao-vivo');
  const [liveNow, setLiveNow] = useState(null); // null = carregando
  const [scheduled, setScheduled] = useState(null);
  const [followingIds, setFollowingIds] = useState([]);
  const [paidIds, setPaidIds] = useState(new Set());
  const [error, setError] = useState('');
  const [buying, setBuying] = useState('');

  // Filtros da Programação
  const [fPerson, setFPerson] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fDate, setFDate] = useState('');

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
    let unsubAccess = () => {};
    if (myUid) {
      unsubAccess = onSnapshot(
        query(collection(db, 'live_access'), where('userId', '==', myUid), where('hasPaid', '==', true)),
        (snap) => setPaidIds(new Set(snap.docs.map((d) => d.data().liveId))),
        (err) => console.error('[Lives] erro ao carregar agenda:', err)
      );
      getDocs(query(collection(db, 'follows'), where('followerId', '==', myUid)))
        .then((snap) => setFollowingIds(snap.docs.map((d) => d.data().followingId)))
        .catch((err) => console.error('[Lives] erro ao carregar seguindo:', err));
    }
    return () => { unsubLive(); unsubScheduled(); unsubAccess(); };
  }, [myUid]);

  const open = (live) => {
    if (live.userId === myUid) navigate(`/transmitir/${live.id}`);
    else navigate(`/lives/${live.id}`);
  };

  const buy = async (live) => {
    if (buying) return;
    if (!window.confirm(`Comprar "${live.title}" por ${brl(live.price)}? O valor sai da sua carteira.`)) return;
    setBuying(live.id);
    try {
      const res = await payForLive({ liveId: live.id, liveTitle: live.title, liveOwnerId: live.userId });
      if (!res.ok) window.alert('Saldo insuficiente na carteira.');
    } catch (err) {
      console.error('[Lives] erro ao comprar:', err);
      window.alert(err.message || 'Não foi possível concluir a compra.');
    } finally {
      setBuying('');
    }
  };

  const loading = liveNow === null || scheduled === null;

  const filteredProgramacao = useMemo(() => {
    const p = fPerson.trim().toLowerCase();
    return (scheduled || []).filter((l) =>
      (!p || (l.userName || '').toLowerCase().includes(p)) &&
      (!fCategory || l.category === fCategory) &&
      (!fDate || sameDay(l.scheduledDate, fDate))
    );
  }, [scheduled, fPerson, fCategory, fDate]);

  const list = useMemo(() => {
    const all = [...(liveNow || []), ...(scheduled || [])];
    if (tab === 'ao-vivo') return liveNow || [];
    if (tab === 'programacao') return filteredProgramacao;
    if (tab === 'agenda') return all.filter((l) => paidIds.has(l.id)).sort(sortByScheduled);
    return all.filter((l) => followingIds.includes(l.userId));
  }, [tab, liveNow, scheduled, paidIds, followingIds, filteredProgramacao]);

  const emptyText = {
    'ao-vivo': 'Nenhuma live no ar neste momento.',
    programacao: 'Nenhuma live programada com esses filtros.',
    agenda: 'Você ainda não comprou nenhuma live.',
    seguindo: 'Nenhuma live de quem você segue por enquanto.',
  }[tab];

  return (
    <div style={styles.container}>
      <div style={styles.glow} aria-hidden />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <h1 style={styles.pageTitle}>Live</h1>

        <div style={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{ ...styles.tab, ...(tab === t.id ? styles.tabActive : {}) }}
            >
              {t.label}
              {tab === t.id && <span style={styles.indicator} />}
            </button>
          ))}
        </div>

        {tab === 'programacao' && (
          <div style={styles.filters}>
            <input
              type="text"
              placeholder="Pessoa"
              value={fPerson}
              onChange={(e) => setFPerson(e.target.value)}
              style={styles.input}
            />
            <input
              type="date"
              value={fDate}
              onChange={(e) => setFDate(e.target.value)}
              style={styles.input}
            />
            <div style={styles.chips}>
              <button type="button" style={styles.chip(!fCategory)} onClick={() => setFCategory('')}>Todos os temas</button>
              {LIVE_CATEGORIES.map((c) => (
                <button key={c} type="button" style={styles.chip(fCategory === c)} onClick={() => setFCategory(fCategory === c ? '' : c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p style={styles.error}>{error}</p>}

        {loading ? (
          <p style={styles.muted}>Carregando...</p>
        ) : list.length === 0 ? (
          <div style={styles.empty}>
            <Radio size={36} color="#333" />
            <p style={styles.muted}>{emptyText}</p>
          </div>
        ) : (
          <div style={styles.grid}>
            {list.map((live) => (
              <LiveCard
                key={live.id}
                live={live}
                mine={live.userId === myUid}
                paid={paidIds.has(live.id)}
                buying={buying === live.id}
                onOpen={() => open(live)}
                onBuy={() => buy(live)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LiveCard({ live, mine, paid, buying, onOpen, onBuy }) {
  const isLive = live.status === 'live';
  const media = live.teaserUrl || live.thumbnail;
  const when = live.scheduledDate
    ? new Date(live.scheduledDate).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';

  let action;
  if (isLive || mine) {
    action = (
      <button type="button" style={styles.watchBtn} onClick={onOpen}>
        <Play size={18} fill="#000" /> {mine ? 'Continuar transmissão' : 'Assistir Live'}
      </button>
    );
  } else if (paid) {
    action = (
      <div style={styles.paidTag}><Check size={16} /> Na sua agenda</div>
    );
  } else if (live.price > 0) {
    action = (
      <button type="button" style={styles.watchBtn} onClick={onBuy} disabled={buying}>
        {buying ? 'Comprando...' : `Comprar · ${brl(live.price)}`}
      </button>
    );
  } else {
    action = <div style={styles.paidTag}><CalendarClock size={16} /> Grátis · aguarde o início</div>;
  }

  return (
    <div style={styles.card}>
      {media ? (
        isVideoUrl(media) ? (
          <video src={media} style={styles.cardMedia} muted loop autoPlay playsInline />
        ) : (
          <img src={media} alt="" style={styles.cardMedia} />
        )
      ) : (
        <div style={styles.cardEmpty}><ImageOff size={36} color="#2a2a2a" /></div>
      )}
      <div style={styles.cardShade} />

      {live.isPremium && <span style={styles.prizeBadge}><Trophy size={11} /> PREMIADA</span>}

      <div style={styles.cardBottom}>
        {isLive ? (
          <span style={styles.liveBadge}><span style={styles.liveBadgeDot} /> AO VIVO</span>
        ) : (
          <span style={styles.scheduledBadge}><CalendarClock size={13} /> {when}</span>
        )}

        <div style={styles.creator}>
          {live.userPhoto ? (
            <img src={live.userPhoto} alt="" style={styles.creatorPhoto} />
          ) : (
            <div style={{ ...styles.creatorPhoto, backgroundColor: '#2a2a2a' }} />
          )}
          <span style={styles.creatorName}>{live.userName || 'Criador'}</span>
        </div>

        <p style={styles.cardTitle}>{live.title}</p>
        <div style={styles.cardMeta}>
          {isLive && <span style={styles.metaItem}><Eye size={16} /> {live.viewers || 0}</span>}
          <span style={styles.price}>{live.price > 0 ? brl(live.price) : 'Grátis'}</span>
          {live.category && <span style={styles.metaMuted}>{live.category}</span>}
        </div>
        {action}
      </div>
    </div>
  );
}

const styles = {
  container: {
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    maxWidth: 1100,
    margin: '0 auto',
    position: 'relative',
  },
  glow: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    height: '360px',
    pointerEvents: 'none',
    background: 'radial-gradient(ellipse 80% 100% at 50% 0%, rgba(96, 36, 140, 0.55) 0%, rgba(40, 14, 70, 0.28) 45%, rgba(1, 2, 8, 0) 100%)',
  },
  pageTitle: { color: '#fff', fontSize: 34, fontWeight: 800, margin: '0 0 20px 0' },
  tabs: {
    display: 'flex',
    gap: 36,
    borderBottom: '1px solid #1a1a1a',
    marginBottom: 24,
  },
  tab: {
    position: 'relative',
    padding: '10px 0 12px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#666',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  tabActive: { color: '#fff' },
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#00ff00',
  },
  filters: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 22 },
  input: {
    padding: '9px 14px',
    borderRadius: 20,
    border: '1px solid #2a2a2a',
    backgroundColor: '#141414',
    color: '#fff',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    colorScheme: 'dark',
  },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%' },
  chip: (active) => ({
    padding: '7px 14px',
    borderRadius: 18,
    border: active ? '1px solid #00ff00' : '1px solid #2a2a2a',
    backgroundColor: active ? 'rgba(0,255,0,0.12)' : '#141414',
    color: active ? '#00ff00' : '#bbb',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }),
  muted: { color: '#777', fontSize: 14, margin: 0 },
  error: { color: '#ff4444', fontSize: 13 },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    padding: '60px 0',
    border: '1px dashed #1f1f1f',
    borderRadius: 14,
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 18 },
  card: {
    position: 'relative',
    aspectRatio: '3 / 4.4',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#000',
    border: '1px solid #1a1a1a',
  },
  cardMedia: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  cardEmpty: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(160deg, #0b0b12, #050508)',
  },
  cardShade: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(transparent 35%, rgba(0,0,0,0.85) 70%, rgba(0,0,0,0.97))',
  },
  prizeBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
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
  cardBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16 },
  liveBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#ff4444',
    color: '#fff',
    fontSize: 13,
    fontWeight: 800,
    borderRadius: 20,
    padding: '6px 14px',
  },
  liveBadgeDot: { width: 8, height: 8, borderRadius: '50%', backgroundColor: '#fff' },
  scheduledBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    color: '#00ff00',
    fontSize: 12,
    fontWeight: 800,
    borderRadius: 20,
    padding: '6px 14px',
  },
  creator: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 },
  creatorPhoto: { width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff' },
  creatorName: { color: '#fff', fontSize: 15, fontWeight: 700 },
  cardTitle: {
    color: '#fff',
    fontSize: 14,
    margin: '10px 0 6px 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cardMeta: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 },
  metaItem: { display: 'flex', alignItems: 'center', gap: 6, color: '#fff', fontSize: 14, fontWeight: 600 },
  price: { color: '#fff', fontSize: 14, fontWeight: 700 },
  metaMuted: { color: '#aaa', fontSize: 12 },
  watchBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    border: 'none',
    borderRadius: 24,
    padding: '12px 0',
    backgroundColor: '#fff',
    color: '#000',
    fontSize: 15,
    fontWeight: 800,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  paidTag: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    borderRadius: 24,
    padding: '11px 0',
    border: '1px solid #00ff00',
    color: '#00ff00',
    fontSize: 14,
    fontWeight: 700,
    boxSizing: 'border-box',
  },
};
