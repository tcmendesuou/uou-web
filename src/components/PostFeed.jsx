import React, { useEffect, useState } from 'react';
import {
  collection, query, orderBy, limit, onSnapshot, getDocs, where, doc, getDoc,
} from 'firebase/firestore';
import { db, auth } from '../firebase';

// ✅ Mesma lógica de data relativa do HomeScreen.js do App
function timeAgo(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'agora mesmo';
  if (diffMins < 60) return `há ${diffMins}min`;
  if (diffHours < 24) return `há ${diffHours}h`;
  if (diffDays < 7) return `há ${diffDays}d`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function thumbnailFor(post) {
  if (post.type === 'carousel' && post.mediaItems?.length) {
    const first = post.mediaItems[0];
    return { url: first.url, isVideo: first.type === 'video' };
  }
  return { url: post.mediaUrl, isVideo: post.type === 'video' };
}

export default function PostFeed({ selectedTab, searchText }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    let unsubscribe = () => {};
    let cancelled = false;

    // ✅ Busca o nome/foto do dono de cada post, igual o App faz
    const attachUserData = async (rawDocs) => {
      const promises = rawDocs.map(async (docSnap) => {
        const post = docSnap.data();
        let userData = {};
        try {
          const userDoc = await getDoc(doc(db, 'users', post.userId));
          userData = userDoc.exists() ? userDoc.data() : {};
        } catch (error) {
          console.error('[PostFeed] Erro ao carregar dono do post:', error);
        }
        return {
          id: docSnap.id,
          ...post,
          userName: userData.name || 'Usuário',
          userPhoto: userData.photoURL || null,
        };
      });
      return Promise.all(promises);
    };

    if (selectedTab === 'para-voce') {
      // ✅ Pra Você: tudo, sem filtro (igual ao App)
      const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(30));
      unsubscribe = onSnapshot(
        q,
        async (snapshot) => {
          const withUsers = await attachUserData(snapshot.docs);
          if (!cancelled) {
            setPosts(withUsers);
            setLoading(false);
          }
        },
        (error) => {
          console.error('[PostFeed] Erro ao carregar Pra Você:', error);
          setLoading(false);
        }
      );
    } else if (selectedTab === 'viral') {
      // ✅ Viral: ordenado por likes (igual loadViralPosts do App)
      const q = query(collection(db, 'posts'), orderBy('likes', 'desc'), limit(30));
      unsubscribe = onSnapshot(
        q,
        async (snapshot) => {
          const withUsers = await attachUserData(snapshot.docs);
          if (!cancelled) {
            setPosts(withUsers);
            setLoading(false);
          }
        },
        (error) => {
          console.error('[PostFeed] Erro ao carregar Viral:', error);
          setLoading(false);
        }
      );
    } else if (selectedTab === 'seguindo') {
      // ✅ Seguindo: só de quem o usuário segue (igual filterLivesByTab do App)
      (async () => {
        try {
          const user = auth.currentUser;
          if (!user) {
            if (!cancelled) { setPosts([]); setLoading(false); }
            return;
          }
          const followsSnap = await getDocs(
            query(collection(db, 'follows'), where('followerId', '==', user.uid))
          );
          const followingIds = followsSnap.docs.map((d) => d.data().followingId);

          if (followingIds.length === 0) {
            if (!cancelled) { setPosts([]); setLoading(false); }
            return;
          }

          const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50));
          unsubscribe = onSnapshot(
            q,
            async (snapshot) => {
              const filteredDocs = snapshot.docs.filter((d) => followingIds.includes(d.data().userId));
              const withUsers = await attachUserData(filteredDocs);
              if (!cancelled) {
                setPosts(withUsers);
                setLoading(false);
              }
            },
            (error) => {
              console.error('[PostFeed] Erro ao carregar Seguindo:', error);
              setLoading(false);
            }
          );
        } catch (error) {
          console.error('[PostFeed] Erro ao montar Seguindo:', error);
          if (!cancelled) setLoading(false);
        }
      })();
    }

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [selectedTab]);

  const visiblePosts = searchText
    ? posts.filter(
        (p) =>
          p.caption?.toLowerCase().includes(searchText.toLowerCase()) ||
          p.userName?.toLowerCase().includes(searchText.toLowerCase())
      )
    : posts;

  if (loading) {
    return <p style={styles.emptyText}>Carregando...</p>;
  }

  if (visiblePosts.length === 0) {
    return <p style={styles.emptyText}>Nada por aqui ainda.</p>;
  }

  return (
    <div style={styles.grid}>
      {visiblePosts.map((post) => {
        const { url, isVideo } = thumbnailFor(post);
        return (
          <div key={post.id} style={styles.card}>
            <div style={styles.mediaWrap}>
              {isVideo ? (
                <video src={url} style={styles.media} muted />
              ) : (
                <img src={url} alt={post.caption || ''} style={styles.media} />
              )}
              <div style={styles.overlay}>
                <span>❤️ {post.likes || 0}</span>
                <span>💬 {post.commentsCount || 0}</span>
              </div>
            </div>
            <div style={styles.footer}>
              <img
                src={post.userPhoto || 'https://via.placeholder.com/28'}
                alt={post.userName}
                style={styles.avatar}
              />
              <div>
                <p style={styles.userName}>{post.userName}</p>
                <p style={styles.date}>{timeAgo(post.createdAt)}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '16px',
  },
  card: {
    backgroundColor: '#0d0d0d',
    borderRadius: '12px',
    overflow: 'hidden',
    border: '1px solid #1a1a1a',
  },
  mediaWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: '9 / 14',
    backgroundColor: '#000',
  },
  media: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    gap: '12px',
    padding: '8px 10px',
    background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
    fontSize: '12px',
    color: '#fff',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
  },
  avatar: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  userName: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#fff',
    margin: 0,
  },
  date: {
    fontSize: '11px',
    color: '#777',
    margin: 0,
  },
  emptyText: {
    fontSize: '14px',
    color: '#666',
  },
};
