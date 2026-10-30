import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, orderBy, limit, onSnapshot, getDocs, where, doc, getDoc,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import {
  Heart, MessageCircle, Send, Lock, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Radio, Users, CalendarClock,
} from 'lucide-react';

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

// ✅ Todas as mídias do post (carrossel tem várias; os outros têm uma só)
// @usuário: igual ao app (userHandle, ou o nome sem acentos/espaços)
function toHandle(item) {
  if (item.userHandle) return item.userHandle;
  return String(item.userName || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, '.')
    .replace(/[^a-z0-9._]/g, '').replace(/^[._]+|[._]+$/g, '');
}

// ✅ Cabeçalho do criador, igual ao app: pílula com foto, nome e @usuário · data
// + botão "Seguindo" no canto direito.
function CreatorHeader({ item, following }) {
  const handle = toHandle(item);
  const mine = item.userId === auth.currentUser?.uid;
  return (
    <>
      <div style={styles.topInfo}>
        <img src={item.userPhoto || 'https://via.placeholder.com/40'} alt={item.userName} style={styles.avatar} />
        <div style={styles.creatorText}>
          <span style={styles.userName}>{item.userName}</span>
          <span style={styles.handleRow}>
            {handle ? `@${handle} · ` : ''}{timeAgo(item.createdAt)}
          </span>
        </div>
      </div>
      {following && !mine && <span style={styles.followingPill}>Seguindo</span>}
    </>
  );
}

// ✅ Cache de dados do dono (nome/foto): antes cada atualização do feed
// (um like, por exemplo) rebuscava o usuário de TODOS os posts no Firestore.
const USER_TTL_MS = 5 * 60 * 1000;
const userCache = new Map(); // uid -> { at, promise }
function getUserData(uid) {
  if (!uid) return Promise.resolve({});
  const hit = userCache.get(uid);
  if (hit && Date.now() - hit.at < USER_TTL_MS) return hit.promise;
  const promise = getDoc(doc(db, 'users', uid))
    .then((snap) => (snap.exists() ? snap.data() : {}))
    .catch((error) => { userCache.delete(uid); console.error('[PostFeed] Erro ao carregar usuário:', error); return {}; });
  userCache.set(uid, { at: Date.now(), promise });
  return promise;
}

function mediaListFor(post) {
  if (post.type === 'carousel' && post.mediaItems?.length) {
    return post.mediaItems
      .filter((m) => m?.url)
      .map((m) => ({ url: m.url, thumb: m.thumbnailUrl || null, isVideo: m.type === 'video' }));
  }
  return post.mediaUrl ? [{ url: post.mediaUrl, thumb: post.thumbnailUrl || null, isVideo: post.type === 'video' }] : [];
}

const isVideoUrl = (url) =>
  !!url && /\.(mp4|mov|webm)(\?|$)/i.test(decodeURIComponent(String(url)).split('#')[0]);

const brl = (v) => `R$ ${(Number(v) || 0).toFixed(2).replace('.', ',')}`;

// ✅ Lives no feed (igual ao app): lives no ar + agendadas de quem você segue
function useFeedLives(followingIds) {
  const [liveItems, setLiveItems] = useState([]);
  const [scheduledItems, setScheduledItems] = useState([]);

  const withUser = async (docSnap, extra) => {
    const live = docSnap.data();
    const userData = await getUserData(live.userId);
    return {
      id: `${extra.type}_${docSnap.id}`,
      liveId: docSnap.id,
      teaserUrl: live.teaserUrl || live.thumbnail || null,
      title: live.title,
      userId: live.userId,
      userName: userData.name || live.userName || 'Usuário',
      userPhoto: userData.photoURL || live.userPhoto || null,
      userHandle: userData.userHandle || userData.username || userData.handle || null,
      price: live.price || 0,
      category: live.category,
      viewers: live.viewers || 0,
      isPremium: !!live.isPremium,
      ...extra,
    };
  };

  useEffect(() => {
    let cancelled = false;
    const unsub = onSnapshot(
      query(collection(db, 'lives'), where('status', '==', 'live')),
      async (snap) => {
        const items = await Promise.all(
          snap.docs.map((d) =>
            withUser(d, { type: 'live_teaser', createdAt: d.data().startedAt || d.data().createdAt || new Date().toISOString() })
          )
        );
        if (!cancelled) setLiveItems(items);
      },
      (error) => console.error('[PostFeed] Erro ao carregar lives:', error)
    );
    return () => { cancelled = true; unsub(); };
  }, []);

  // Agendadas: só de quem você segue (como no app)
  useEffect(() => {
    if (!followingIds || followingIds.length === 0) { setScheduledItems([]); return undefined; }
    let cancelled = false;
    const unsub = onSnapshot(
      query(collection(db, 'lives'), where('status', '==', 'scheduled')),
      async (snap) => {
        const mine = snap.docs.filter((d) => followingIds.includes(d.data().userId));
        const items = await Promise.all(
          mine.map((d) =>
            withUser(d, {
              type: 'scheduled_teaser',
              scheduledFor: d.data().scheduledDate || d.data().scheduledFor || null,
              createdAt: d.data().createdAt || new Date().toISOString(),
            })
          )
        );
        if (!cancelled) setScheduledItems(items);
      },
      (error) => console.error('[PostFeed] Erro ao carregar lives agendadas:', error)
    );
    return () => { cancelled = true; unsub(); };
  }, [followingIds]);

  return { liveItems, scheduledItems };
}

export default function PostFeed({ selectedTab, searchText }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [followingIds, setFollowingIds] = useState(null); // null = ainda carregando
  const { liveItems, scheduledItems } = useFeedLives(followingIds);

  // Quem você segue (usado para 'Seguindo' e para as lives agendadas)
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) { setFollowingIds([]); return; }
    getDocs(query(collection(db, 'follows'), where('followerId', '==', user.uid)))
      .then((snap) => setFollowingIds(snap.docs.map((d) => d.data().followingId)))
      .catch((error) => { console.error('[PostFeed] Erro ao carregar follows:', error); setFollowingIds([]); });
  }, []);

  useEffect(() => {
    setLoading(true);
    setCurrentIndex(0);
    let unsubscribe = () => {};
    let cancelled = false;

    // ✅ Busca o nome/foto do dono de cada post, igual o App faz
    const attachUserData = async (rawDocs) => {
      const promises = rawDocs.map(async (docSnap) => {
        const post = docSnap.data();
        const userData = await getUserData(post.userId);
        return {
          id: docSnap.id,
          ...post,
          userName: userData.name || 'Usuário',
          userPhoto: userData.photoURL || null,
          userHandle: userData.userHandle || userData.username || userData.handle || null,
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

  // ✅ Feed combinado: posts + lives (as lives entram em "Pra Você" e "Seguindo")
  let combined = posts;
  if (selectedTab === 'para-voce') {
    combined = [...posts, ...liveItems, ...scheduledItems];
  } else if (selectedTab === 'seguindo') {
    const ids = followingIds || [];
    combined = [
      ...posts,
      ...liveItems.filter((l) => ids.includes(l.userId)),
      ...scheduledItems.filter((l) => ids.includes(l.userId)),
    ];
  }
  if (selectedTab !== 'viral') {
    combined = [...combined].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const q = (searchText || '').toLowerCase();
  const visiblePosts = q
    ? combined.filter(
        (p) =>
          p.caption?.toLowerCase().includes(q) ||
          p.title?.toLowerCase().includes(q) ||
          p.userName?.toLowerCase().includes(q)
      )
    : combined;

  // ✅ Se a busca/aba mudar a lista, garante que o índice não fica "fora" do array
  useEffect(() => {
    if (currentIndex >= visiblePosts.length) {
      setCurrentIndex(Math.max(0, visiblePosts.length - 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblePosts.length]);

  // ✅ Pré-carrega a foto do próximo post: ao avançar, já está no cache
  useEffect(() => {
    const next = visiblePosts[currentIndex + 1];
    if (!next || next.type === 'live_teaser' || next.type === 'scheduled_teaser') return;
    const m = mediaListFor(next)[0];
    if (m && !m.isVideo) new Image().src = m.thumb || m.url;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, visiblePosts.length]);

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
        {post.type === 'live_teaser' || post.type === 'scheduled_teaser' ? (
          <LiveTeaserCard key={post.id} item={post} onWheel={handleWheel} following={(followingIds || []).includes(post.userId)} />
        ) : (
          <PostCard key={post.id} post={post} onWheel={handleWheel} following={(followingIds || []).includes(post.userId)} />
        )}

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

function PostCard({ post, onWheel, following }) {
  const medias = mediaListFor(post);
  const [slide, setSlide] = useState(0);
  const safeSlide = Math.min(slide, Math.max(0, medias.length - 1));
  const current = medias[safeSlide] || { url: null, isVideo: false };
  const { url, thumb, isVideo } = current;
  const photoSrc = thumb || url;
  const videoRef = useRef(null);
  const [paused, setPaused] = useState(false);
  // Post exclusivo para assinantes: a web ainda não tem assinatura, então só o dono vê
  const locked = !!post.exclusive && post.userId !== auth.currentUser?.uid;
  const many = !locked && medias.length > 1;

  const togglePlay = () => {
    if (!isVideo) return;
    setPaused((p) => !p);
  };

  useEffect(() => {
    if (!videoRef.current) return;
    if (paused) videoRef.current.pause();
    else videoRef.current.play().catch(() => {});
  }, [paused, safeSlide]);

  const go = (delta) => (e) => {
    e.stopPropagation();
    setPaused(false);
    setSlide((i) => Math.min(Math.max(i + delta, 0), medias.length - 1));
  };

  return (
    <div style={styles.card} onWheel={onWheel}>
      <div style={styles.mediaBox} onClick={togglePlay}>
        {locked ? (
          <div style={styles.lockedBox}>
            <Lock size={34} color="#52fa35" />
            <p style={styles.lockedTitle}>Conteúdo exclusivo para assinantes</p>
            <p style={styles.lockedSub}>Assine pelo app para ver este post.</p>
          </div>
        ) : isVideo ? (
          <video key={url} ref={videoRef} src={url} poster={thumb || undefined} preload="auto" style={styles.mediaContain} autoPlay loop muted={false} playsInline />
        ) : (
          <>
            {/* fundo desfocado preenche as sobras; a foto aparece INTEIRA por cima */}
            <img src={photoSrc} alt="" aria-hidden decoding="async" style={styles.mediaBlur} />
            <img src={photoSrc} alt={post.caption || ''} decoding="async" style={styles.mediaContain} />
          </>
        )}
      </div>

      {/* Info do criador — topo, igual ao app */}
      <CreatorHeader item={post} following={following} />

      {/* Carrossel: contador, setas e bolinhas */}
      {many && (
        <>
          {safeSlide > 0 && (
            <button type="button" onClick={go(-1)} style={{ ...styles.slideArrow, left: 10 }} aria-label="Mídia anterior">
              <ChevronLeft size={20} />
            </button>
          )}
          {safeSlide < medias.length - 1 && (
            <button type="button" onClick={go(1)} style={{ ...styles.slideArrow, right: 10 }} aria-label="Próxima mídia">
              <ChevronRight size={20} />
            </button>
          )}
          <div style={styles.dots}>
            {medias.map((_, i) => (
              <span key={i} style={{ ...styles.dot, ...(i === safeSlide ? styles.dotActive : {}) }} />
            ))}
          </div>
        </>
      )}

      {/* Ações — lado direito */}
      <div style={styles.actions}>
        <div style={styles.actionButton}>
          <Heart size={32} color="#fff" />
          <span style={styles.actionText}>{post.likes || 0}</span>
        </div>
        <div style={styles.actionButton}>
          <MessageCircle size={28} color="#fff" />
          <span style={styles.actionText}>{post.commentsCount || 0}</span>
        </div>
        <div style={styles.actionButton}>
          <Send size={28} color="#fff" />
        </div>
        <img
          src="/donor-button.png"
          alt="Apoiar com doação"
          style={styles.donorButton}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      </div>

      {/* Legenda — embaixo, com degradê */}
      <div style={styles.bottomInfo}>
        {!locked && post.caption && <p style={styles.caption}>{post.caption}</p>}
      </div>
    </div>
  );
}

// ✅ Card de live no feed (ao vivo ou agendada), igual ao teaser do app
function LiveTeaserCard({ item, onWheel, following }) {
  const navigate = useNavigate();
  const isLive = item.type === 'live_teaser';
  const mine = item.userId === auth.currentUser?.uid;
  const when = item.scheduledFor
    ? new Date(item.scheduledFor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';

  const open = () => {
    if (!isLive && !mine) return; // agendada ainda não pode ser assistida
    navigate(mine ? `/transmitir/${item.liveId}` : `/lives/${item.liveId}`);
  };

  const media = item.teaserUrl;

  return (
    <div style={{ ...styles.card, cursor: isLive || mine ? 'pointer' : 'default' }} onWheel={onWheel} onClick={open}>
      <div style={styles.mediaBox}>
        {media && isVideoUrl(media) ? (
          <video src={media} style={styles.media} autoPlay loop muted playsInline />
        ) : media ? (
          <img src={media} alt="" style={styles.media} />
        ) : (
          <div style={styles.teaserEmpty}>
            <Radio size={56} color="#2a2a2a" />
          </div>
        )}
      </div>

      <CreatorHeader item={item} following={following} />

      <div style={styles.liveBadgeWrap}>
        {isLive ? (
          <span style={styles.liveBadge}>AO VIVO</span>
        ) : (
          <span style={styles.scheduledBadge}><CalendarClock size={12} /> AGENDADA</span>
        )}
        {isLive && (
          <span style={styles.viewersBadge}><Users size={12} /> {item.viewers || 0}</span>
        )}
      </div>

      <div style={styles.bottomInfo}>
        <p style={styles.liveTitle}>{item.title}</p>
        <p style={styles.date}>
          {item.category ? `${item.category} · ` : ''}
          {item.price > 0 ? brl(item.price) : 'Grátis'}
          {item.isPremium ? ' · Premiada' : ''}
          {!isLive && when ? ` · ${when}` : ''}
        </p>
        {(isLive || mine) && (
          <button type="button" style={styles.watchBtn} onClick={(e) => { e.stopPropagation(); open(); }}>
            <Radio size={15} /> {mine ? 'Continuar transmissão' : 'Assistir ao vivo'}
          </button>
        )}
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
  lockedBox: {
    width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: '8px', padding: '0 28px', textAlign: 'center', boxSizing: 'border-box',
    background: 'linear-gradient(160deg, #0b0b12, #050508)',
  },
  lockedTitle: { color: '#fff', fontSize: '15px', fontWeight: '700', margin: '6px 0 0 0' },
  lockedSub: { color: '#888', fontSize: '12px', margin: 0 },
  mediaBlur: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    filter: 'blur(28px) brightness(0.55)',
    transform: 'scale(1.15)',
  },
  mediaContain: {
    position: 'relative',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
  },
  slideCounter: {
    position: 'absolute',
    top: '18px',
    right: '16px',
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontSize: '12px',
    fontWeight: '700',
    borderRadius: '12px',
    padding: '4px 10px',
  },
  slideArrow: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    border: 'none',
    backgroundColor: 'rgba(0,0,0,0.55)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 3,
  },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '70px',
    display: 'flex',
    justifyContent: 'center',
    gap: '6px',
    zIndex: 2,
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '3px',
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: '20px',
  },
  teaserEmpty: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(160deg, #0b0b12, #050508)',
  },
  liveBadgeWrap: {
    position: 'absolute',
    top: '20px',
    right: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  liveBadge: {
    backgroundColor: '#e5262b',
    color: '#fff',
    fontSize: '11px',
    fontWeight: '800',
    borderRadius: '8px',
    padding: '4px 9px',
  },
  scheduledBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: 'rgba(0,0,0,0.65)',
    color: '#52fa35',
    fontSize: '11px',
    fontWeight: '800',
    borderRadius: '8px',
    padding: '4px 9px',
  },
  viewersBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: 'rgba(0,0,0,0.65)',
    color: '#fff',
    fontSize: '12px',
    fontWeight: '600',
    borderRadius: '8px',
    padding: '4px 9px',
  },
  liveTitle: {
    color: '#fff',
    fontSize: '16px',
    fontWeight: '700',
    margin: '0 0 4px 0',
  },
  watchBtn: {
    marginTop: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    border: 'none',
    borderRadius: '12px',
    padding: '11px 0',
    backgroundColor: '#52fa35',
    color: '#000',
    fontSize: '14px',
    fontWeight: '800',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  topInfo: {
    position: 'absolute',
    top: '10px',
    left: '8px',
    right: '104px',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: '5px 8px',
    borderRadius: '25px',
    width: 'fit-content',
    maxWidth: 'calc(100% - 112px)',
  },
  avatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '2px solid #fff',
    flexShrink: 0,
  },
  creatorText: { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 },
  userName: {
    color: '#fff',
    fontSize: '14px',
    fontWeight: '700',
    textShadow: '0 1px 3px rgba(0,0,0,0.75)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  handleRow: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: '12px',
    textShadow: '0 1px 3px rgba(0,0,0,0.75)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  followingPill: {
    position: 'absolute',
    top: '14px',
    right: '12px',
    zIndex: 20,
    height: '30px',
    padding: '0 16px',
    display: 'flex',
    alignItems: 'center',
    borderRadius: '15px',
    backgroundColor: '#2a1a5e',
    color: '#fff',
    fontSize: '12px',
    fontWeight: '700',
  },
  actions: {
    position: 'absolute',
    right: '12px',
    bottom: '90px',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
    padding: '16px 9px 6px',
    borderRadius: '26px',
    backgroundColor: 'rgba(0,0,0,0.22)',
    border: '1px solid rgba(255,255,255,0.12)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
  },
  donorButton: { width: '40px', height: '40px', display: 'block' },
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
    padding: '40px 59px 16px 15px',
    background: 'linear-gradient(transparent, rgba(0,0,0,0.8), rgba(0,0,0,0.95))',
  },
  caption: {
    color: '#fff',
    fontSize: '13px',
    lineHeight: '18px',
    textShadow: '0 1px 3px rgba(0,0,0,0.75)',
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
