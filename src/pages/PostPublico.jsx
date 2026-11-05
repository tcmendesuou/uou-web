import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { Heart, MessageCircle, Lock } from 'lucide-react';
import { db, auth } from '../firebase';
import { usePostComments, commentTime } from '../lib/postActions';
import MusicChip from '../components/MusicChip';
import { useMusicPreview } from '../lib/music';

const isVideoUrl = (u) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u || '');

// Página pública de um post (link compartilhado): qualquer pessoa vê; para curtir/comentar, entra no UOU.
export default function PostPublico() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(undefined); // undefined carregando, null não existe
  const [author, setAuthor] = useState(null);
  const [slide, setSlide] = useState(0);
  const comments = usePostComments(postId, !!post);
  const logged = !!auth.currentUser;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'posts', postId));
        if (!alive) return;
        if (!snap.exists()) { setPost(null); return; }
        const p = { id: snap.id, ...snap.data() };
        setPost(p);
        const u = await getDoc(doc(db, 'users', p.userId)).catch(() => null);
        if (alive && u?.exists()) setAuthor(u.data());
      } catch { if (alive) setPost(null); }
    })();
    return () => { alive = false; };
  }, [postId]);

  const goApp = () => navigate(logged ? '/' : '/login');
  const musicPreview = useMusicPreview(postId, post?.music?.previewUrl);

  if (post === undefined) return <div style={s.page}><p style={s.muted}>Carregando...</p></div>;
  if (post === null) {
    return (
      <div style={s.page}>
        <p style={s.muted}>Este post não está disponível.</p>
        <button type="button" style={s.btn} onClick={goApp}>Ir para o UOU</button>
      </div>
    );
  }

  const medias = post.mediaItems?.length
    ? post.mediaItems.map((m) => ({ url: m.url, thumb: m.thumbnailUrl, video: m.type === 'video' || isVideoUrl(m.url) }))
    : [{ url: post.mediaUrl, thumb: post.thumbnailUrl, video: post.type === 'video' || post.mediaType === 'video' || isVideoUrl(post.mediaUrl) }];
  const m = medias[Math.min(slide, medias.length - 1)];
  const locked = !!post.exclusive && post.userId !== auth.currentUser?.uid;

  return (
    <div style={s.page}>
      <div style={s.wrap}>
        <div style={s.logo}>UOU</div>

        <div style={s.author}>
          <img src={author?.photoURL || post.userPhoto || 'https://via.placeholder.com/40'} alt="" style={s.avatar} />
          <strong>{author?.name || post.userName || 'Usuário'}</strong>
        </div>

        <div style={s.media}>
          {locked ? (
            <div style={s.locked}><Lock size={34} color="#52fa35" /><p>Conteúdo exclusivo para assinantes</p></div>
          ) : m.video ? (
            <video src={m.url} poster={m.thumb || undefined} controls playsInline style={s.mediaEl} />
          ) : (
            <img src={m.thumb || m.url} alt={post.caption || ''} style={s.mediaEl} />
          )}
        </div>
        {!locked && medias.length > 1 && (
          <div style={s.dots}>
            {medias.map((_, i) => (
              <button key={i} type="button" onClick={() => setSlide(i)} aria-label={`Mídia ${i + 1}`}
                style={{ ...s.dot, ...(i === slide ? s.dotOn : {}) }} />
            ))}
          </div>
        )}

        {!locked && post.music?.trackName && (
          <MusicChip music={post.music} playing={musicPreview.playing} onToggle={m.video ? undefined : musicPreview.toggle}
            style={{ background: '#222224', borderRadius: 14, marginBottom: 8 }} />
        )}
        {!locked && post.caption && <p style={s.caption}>{post.caption}</p>}

        <div style={s.counts}>
          <span style={s.count}><Heart size={18} /> {post.likes || 0}</span>
          <span style={s.count}><MessageCircle size={18} /> {post.commentsCount || 0}</span>
        </div>

        <button type="button" style={s.btn} onClick={goApp}>
          {logged ? 'Abrir o UOU para curtir e comentar' : 'Entrar no UOU para curtir e comentar'}
        </button>

        {comments && comments.length > 0 && (
          <div style={s.comments}>
            {comments.slice(0, 20).map((c) => (
              <div key={c.id} style={s.comment}>
                <strong>{c.userName}</strong> <span style={s.muted}>{commentTime(c.createdAt)}</span>
                <div>{c.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: '100vh', background: '#010208', color: '#f0f0f0', fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 14 },
  wrap: { width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 12, margin: 'auto 0' },
  logo: { color: '#52fa35', fontWeight: 800, fontSize: 22, letterSpacing: 2 },
  author: { display: 'flex', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, objectFit: 'cover' },
  media: { background: '#000', borderRadius: 14, overflow: 'hidden', border: '1px solid #1a1a1a' },
  mediaEl: { width: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block' },
  locked: { padding: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: '#bbb' },
  dots: { display: 'flex', justifyContent: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, border: 'none', background: '#333', padding: 0, cursor: 'pointer' },
  dotOn: { background: '#52fa35' },
  caption: { margin: 0, fontSize: 14, lineHeight: '20px', whiteSpace: 'pre-wrap' },
  counts: { display: 'flex', gap: 18, color: '#ccc', fontSize: 14 },
  count: { display: 'flex', alignItems: 'center', gap: 6 },
  btn: { background: 'rgba(82,250,53,0.05)', border: '1px solid #52fa35', color: '#52fa35', borderRadius: 12, padding: '12px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  comments: { display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6, borderTop: '1px solid #1a1a1a', paddingTop: 14 },
  comment: { fontSize: 14, lineHeight: '20px' },
  muted: { color: '#777', fontSize: 12 },
};
