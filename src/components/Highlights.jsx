import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, limit, onSnapshot, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { groupRings, buildTicker, firstUnseenIndex, isRingFullySeen } from '../lib/storyLogic';
import StoryViewer from './StoryViewer';

// ✅ Bloco "highlight" da Home (igual ao app): lives de quem você segue + Stories de 24h.
export default function Highlights() {
  const navigate = useNavigate();
  const [followingLives, setFollowingLives] = useState([]);
  const [rings, setRings] = useState([]);
  const [seenKeys, setSeenKeys] = useState(new Set());
  const [viewerPos, setViewerPos] = useState(null);

  // Stories (24h): mesmas coleções do app — stories + storyViews (já vistos)
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    const storiesRef = { current: [] };
    const seenRef = { current: new Set() };
    const rebuild = () => { setRings(groupRings(storiesRef.current)); setSeenKeys(new Set(seenRef.current)); };
    const unsubStories = onSnapshot(
      query(collection(db, 'stories'), orderBy('createdAt', 'desc'), limit(50)),
      (snap) => { storiesRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() })); rebuild(); },
      (error) => console.error('[Highlights] Erro ao carregar stories:', error)
    );
    let unsubSeen = () => {};
    if (uid) {
      unsubSeen = onSnapshot(
        query(collection(db, 'storyViews'), where('viewerUid', '==', uid)),
        (snap) => { seenRef.current = new Set(snap.docs.map((d) => d.id)); rebuild(); },
        (error) => console.error('[Highlights] Erro ao carregar stories vistos:', error)
      );
    }
    return () => { unsubStories(); unsubSeen(); };
  }, []);

  // Seu story primeiro (se ativo), depois os demais — igual ao app
  const orderedRings = useMemo(() => {
    const uid = auth.currentUser?.uid;
    return [...rings.filter((r) => r.userId === uid), ...rings.filter((r) => r.userId !== uid)];
  }, [rings]);

  const openRing = (ring) => {
    const ticker = buildTicker(rings);
    const ringStart = ticker.findIndex((t) => t.ringIndex === rings.indexOf(ring));
    if (ringStart === -1) return;
    setViewerPos(Math.min(ringStart + firstUnseenIndex(ring, seenKeys), ticker.length - 1));
  };

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    (async () => {
      const user = auth.currentUser;
      if (!user) return;
      try {
        const followsSnap = await getDocs(
          query(collection(db, 'follows'), where('followerId', '==', user.uid))
        );
        const followingIds = followsSnap.docs.map((d) => d.data().followingId);
        if (cancelled || followingIds.length === 0) return;

        unsubscribe = onSnapshot(
          query(collection(db, 'lives'), where('status', '==', 'live')),
          async (snap) => {
            const mine = snap.docs.filter((d) => followingIds.includes(d.data().userId));
            const items = await Promise.all(
              mine.map(async (d) => {
                const live = d.data();
                let userData = {};
                try {
                  const u = await getDoc(doc(db, 'users', live.userId));
                  userData = u.exists() ? u.data() : {};
                } catch (error) {
                  console.error('[Highlights] Erro ao carregar usuário da live:', error);
                }
                return {
                  id: d.id,
                  userName: userData.name || live.userName || 'Usuário',
                  userPhoto: userData.photoURL || live.userPhoto || null,
                };
              })
            );
            if (!cancelled) setFollowingLives(items);
          },
          (error) => console.error('[Highlights] Erro ao carregar lives:', error)
        );
      } catch (error) {
        console.error('[Highlights] Erro ao carregar quem você segue:', error);
      }
    })();

    return () => { cancelled = true; unsubscribe(); };
  }, []);

  // Nada ao vivo e sem Stories: não ocupa espaço na Home
  if (followingLives.length === 0 && rings.length === 0) return null;

  return (
    <div style={styles.container}>
      {followingLives.map((live) => (
        <button
          key={live.id}
          type="button"
          style={styles.item}
          onClick={() => navigate(`/lives/${live.id}`)}
          title={`${live.userName} está ao vivo`}
        >
          <div style={styles.ring}>
            {live.userPhoto ? (
              <img src={live.userPhoto} alt={live.userName} style={styles.photo} />
            ) : (
              <div style={{ ...styles.photo, backgroundColor: '#1a1a1a' }} />
            )}
            <span style={styles.liveDot} />
          </div>
          <span style={styles.name}>{live.userName}</span>
        </button>
      ))}

      {orderedRings.map((ring) => {
        const seen = isRingFullySeen(ring, seenKeys);
        return (
          <button key={ring.userId} type="button" style={styles.item} onClick={() => openRing(ring)} title={ring.userName}>
            <div style={{ ...styles.storyRing, ...(seen ? styles.storyRingSeen : styles.storyRingNew) }}>
              {ring.userPhoto ? (
                <img src={ring.userPhoto} alt={ring.userName} style={styles.storyPhoto} />
              ) : (
                <div style={{ ...styles.storyPhoto, backgroundColor: '#222' }} />
              )}
            </div>
            <span style={styles.name}>{ring.userId === auth.currentUser?.uid ? 'Seu highlight' : ring.userName}</span>
          </button>
        );
      })}

      {viewerPos !== null && (
        <StoryViewer rings={rings} initialPos={viewerPos} onClose={() => setViewerPos(null)} />
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '18px',
    paddingBottom: '20px',
    marginBottom: '20px',
    borderBottom: '1px solid #1a1a1a',
    overflowX: 'auto',
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    width: '70px',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    fontFamily: 'inherit',
    flexShrink: 0,
  },
  ring: {
    position: 'relative',
    width: '62px',
    height: '62px',
    borderRadius: '50%',
    border: '3px solid #52fa35',
    padding: '2px',
    boxSizing: 'border-box',
  },
  photo: {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'block',
  },
  liveDot: {
    position: 'absolute',
    right: '-2px',
    bottom: '-2px',
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    backgroundColor: '#52fa35',
    border: '2px solid #010208',
  },
  storyRing: {
    width: '62px', height: '62px', borderRadius: '50%', padding: '3px', boxSizing: 'border-box',
  },
  storyRingNew: { background: 'linear-gradient(135deg, #FEDA75, #FA7E1E, #D62976, #962FBF)' },
  storyRingSeen: { background: '#3a3a3a' },
  storyPhoto: {
    width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block',
    border: '2px solid #010208', boxSizing: 'border-box',
  },
  name: {
    color: '#e0e0e0',
    fontSize: '12px',
    maxWidth: '70px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};
