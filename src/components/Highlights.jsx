import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

// ✅ Bloco "highlight" da Home (igual ao app): lives ao vivo de quem você segue.
// Os Stories de 24h entram aqui na próxima etapa.
export default function Highlights() {
  const navigate = useNavigate();
  const [followingLives, setFollowingLives] = useState([]);

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

  // Nada ao vivo (e ainda sem Stories): não ocupa espaço na Home
  if (followingLives.length === 0) return null;

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
    border: '3px solid #e5262b',
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
    backgroundColor: '#e5262b',
    border: '2px solid #010208',
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
