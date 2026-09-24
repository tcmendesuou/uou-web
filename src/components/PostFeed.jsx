import React, { useEffect, useRef, useState } from 'react';
import {
  collection, query, orderBy, limit, onSnapshot, getDocs, where, doc, getDoc,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Heart, MessageCircle, Send, ChevronUp, ChevronDown } from 'lucide-react';

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

function mediaFor(post) {
  if (post.type === 'carousel' && post.mediaItems?.length) {
    const first = post.mediaItems[0];
    return { url: first.url, isVideo: first.type === 'video' };
  }
  return { url: post.mediaUrl, isVideo: post.type === 'video' };
}

export default function PostFeed({ selectedTab, searchText }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setLoading(true);
    setCurrentIndex(0);
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
      const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(30));
      unsubscribe = onSnapshot(
        q,
        async (snapshot) => {
          const withUsers = await attachUserData(snapshot.docs);
          if (!cancelled) { setPosts(withUsers); setLoading(false); }
        },
        (error) => { console.error('[PostFeed] Erro ao carregar Pra Você:', error); setLoading(false); }
      );
    } else if (selectedTab === 'viral') {
      const q = query(collection(db, 'posts'), orderBy('likes', 'desc'), limit(30));
      unsubscribe = onSnapshot(
        q,
        async (snapshot) => {
          const withUsers = await attachUserData(snapshot.docs);
          if (!cancelled) { setPosts(withUsers); setLoading(false); }
        },
        (error) => { console.error('[PostFeed] Erro ao carregar Viral:', error); setLoading(false); }
      );
    } else if (selectedTab === 'seguindo') {
      (async () => {
        try {
          const user = auth.currentUser;
          if (!user) { if (!cancelled) { setPosts([]); setLoading(false); } return; }
          const followsSnap = await getDocs(
            query(collection(db, 'follows'), where('followerId', '==', user.uid))
          );
          const followingIds = followsSnap.docs.map((d) => d.data().followingId);

          if (followingIds.length === 0) { if (!cancelled) { setPosts([]); setLoading(false); } return; }

          const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50));
          unsubscribe = onSnapshot(
            q,
            async (snapshot) => {
              const filteredDocs = snapshot.docs.filter((d) => followingIds.includes(d.data().userId));
              const withUsers = await attachUserData(filteredDocs);
              if (!cancelled) { setPosts(withUsers); setLoading(false); }
            },
            (error) => { console.error('[PostFeed] Erro ao carregar Seguindo:', error); setLoading(false); }
          );
        } catch (error) {
          console.error('[PostFeed] Erro ao montar Seguindo:', error);
          if (!cancelled) setLoading(false);
        }
      })();
    }

    return () => { cancelled = true; unsubscribe(); };
  }, [selectedTab]);

  const visiblePosts = searchText
    ? posts.filter(
        (p) =>
          p.caption?.toLowerCase().includes(searchText.toLowerCase()) ||
          p.userName?.toLowerCase().includes(searchText.toLowerCase())
      )
    : posts;

  // ✅ Se a busca/aba mudar a lista, garante que o índice não fica "fora" do array
  useEffect(() => {
    if (currentIndex >= visiblePosts.length) {
      setCurrentIndex(Math.max(0, visiblePosts.length - 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblePosts.length]);

  const goNext = () => setCurrentIndex((i) => Math.min(i + 1, visiblePosts.length - 1));
  const goPrev = () => setCurrentIndex((i) => Math.max(i - 1, 0));

  const handleWheel = (e) => {
    if (e.deltaY > 20) goNext();
    else if (e.deltaY < -20) goPrev();
  };

  if (loading) {
    return <p style={styles.emptyText}>Carregando...</p>;
  }

  if (visiblePosts.length === 0) {
    return <p style={styles.emptyText}>Nada por aqui ainda.</p>;
  }

  const post = visiblePosts[currentIndex];

  return (
    <div style={styles.viewerWrap}>
      {/* ✅ As setas ficam "penduradas" fora do card via position:absolute,
          então não entram no cálculo de centralização — o card fica
          exatamente no centro do container (mesmo eixo do logo e das abas). */}
      <div style={styles.cardSlot}>
        <PostCard post={post} onWheel={handleWheel} />

        <div style={styles.navButtons}>
          <button
            type="button"
            onClick={goPrev}
            disabled={currentIndex === 0}
            style={{ ...styles.navButton, ...(currentIndex === 0 ? styles.navButtonDisabled : {}) }}
            aria-label="Post anterior"
          >
            <ChevronUp size={22} />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={currentIndex === visiblePosts.length - 1}
            style={{
              ...styles.navButton,
              ...(currentIndex === visiblePosts.length - 1 ? styles.navButtonDisabled : {}),
            }}
            aria-label="Próximo post"
          >
            <ChevronDown size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}

function PostCard({ post, onWheel }) {
  const { url, isVideo } = mediaFor(post);
  const videoRef = useRef(null);
  const [paused, setPaused] = useState(false);

  const togglePlay = () => {
    if (!isVideo) return;
    setPaused((p) => !p);
  };

  useEffect(() => {
    if (!videoRef.current) return;
    if (paused) videoRef.current.pause();
    else videoRef.current.play().catch(() => {});
  }, [paused]);

  return (
    <div style={styles.card} onWheel={onWheel}>
      <div style={styles.mediaBox} onClick={togglePlay}>
        {isVideo ? (
          <video ref={videoRef} src={url} style={styles.media} autoPlay loop muted={false} playsInline />
        ) : (
          <img src={url} alt={post.caption || ''} style={styles.media} />
        )}
      </div>

      {/* Info do criador — topo esquerdo */}
      <div style={styles.topInfo}>
        <img
          src={post.userPhoto || 'https://via.placeholder.com/40'}
          alt={post.userName}
          style={styles.avatar}
        />
        <span style={styles.userName}>{post.userName}</span>
      </div>

      {/* Ações — lado direito */}
      <div style={styles.actions}>
        <div style={styles.actionButton}>
          <Heart size={28} color="#fff" />
          <span style={styles.actionText}>{post.likes || 0}</span>
        </div>
        <div style={styles.actionButton}>
          <MessageCircle size={26} color="#fff" />
          <span style={styles.actionText}>{post.commentsCount || 0}</span>
        </div>
        <div style={styles.actionButton}>
          <Send size={24} color="#fff" />
        </div>
      </div>

      {/* Legenda — embaixo, com degradê */}
      <div style={styles.bottomInfo}>
        {post.caption && <p style={styles.caption}>{post.caption}</p>}
        <p style={styles.date}>{timeAgo(post.createdAt)}</p>
      </div>
    </div>
  );
}

const styles = {
  viewerWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardSlot: {
    position: 'relative',
  },
  card: {
    position: 'relative',
    height: '76vh',
    aspectRatio: '9 / 16',
    borderRadius: '16px',
    overflow: 'hidden',
    backgroundColor: '#000',
    border: '1px solid #1a1a1a',
    flexShrink: 0,
  },
  mediaBox: {
    width: '100%',
    height: '100%',
    cursor: 'pointer',
  },
  media: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  topInfo: {
    position: 'absolute',
    top: '16px',
    left: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '2px solid #52fa35',
  },
  userName: {
    color: '#fff',
    fontSize: '14px',
    fontWeight: '700',
    textShadow: '0 1px 4px rgba(0,0,0,0.8)',
  },
  actions: {
    position: 'absolute',
    right: '14px',
    bottom: '90px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
  },
  actionButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
  },
  actionText: {
    color: '#fff',
    fontSize: '12px',
    fontWeight: '600',
  },
  bottomInfo: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: '40px 16px 16px',
    background: 'linear-gradient(transparent, rgba(0,0,0,0.9))',
  },
  caption: {
    color: '#fff',
    fontSize: '13px',
    margin: 0,
    marginBottom: '4px',
  },
  date: {
    color: '#bbb',
    fontSize: '11px',
    margin: 0,
  },
  navButtons: {
    position: 'absolute',
    top: '50%',
    left: 'calc(100% + 20px)',
    transform: 'translateY(-50%)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  navButton: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    border: '1px solid #333',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  navButtonDisabled: {
    opacity: 0.3,
    cursor: 'default',
  },
  emptyText: {
    fontSize: '14px',
    color: '#666',
  },
};
