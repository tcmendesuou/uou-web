import React, { useCallback, useEffect, useRef, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { X } from 'lucide-react';
import { db, auth } from '../firebase';
import { buildTicker, getNeighbor, storyFraction, storyViewKey, STORY_PHOTO_DURATION_MS } from '../lib/storyLogic';
import { isVideoUrl } from '../lib/liveLogic';

const mediaUrlOf = (s) => s.url || s.mediaUrl || s.imageUrl || s.videoUrl || '';
const isVideoStory = (s) =>
  s.mediaType === 'video' || s.type === 'video' || isVideoUrl(mediaUrlOf(s));

// Visualizador de Stories em tela cheia (igual ao do app): avança entre stories
// e entre usuários, barra de progresso, toque esquerda/direita, Esc fecha.
export default function StoryViewer({ rings, initialPos, onClose }) {
  const ticker = React.useMemo(() => buildTicker(rings), [rings]);
  const [pos, setPos] = useState(Math.min(initialPos || 0, Math.max(0, ticker.length - 1)));
  const [elapsed, setElapsed] = useState(0);
  const videoRef = useRef(null);
  const current = ticker[pos];
  const story = current?.story;
  const video = story ? isVideoStory(story) : false;

  const go = useCallback((delta) => {
    const next = getNeighbor(ticker, pos, delta);
    if (next === null) { if (delta > 0) onClose(); return; }
    setPos(next);
  }, [ticker, pos, onClose]);

  // Zera a barra e grava "visto" ao trocar de story (se falhar, só não marca como visto)
  useEffect(() => {
    setElapsed(0);
    const uid = auth.currentUser?.uid;
    if (!uid || !story) return;
    setDoc(
      doc(db, 'storyViews', storyViewKey(uid, story.id)),
      { viewerUid: uid, storyId: story.id, storyOwnerId: story.userId, viewedAt: new Date().toISOString() },
      { merge: true }
    ).catch((error) => console.error('[StoryViewer] Erro ao gravar visualização:', error));
  }, [story]);

  // Fotos: relógio próprio (5s ou durationMs). Vídeos: acompanha o próprio vídeo.
  useEffect(() => {
    if (!story || video) return undefined;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const ms = now - start;
      setElapsed(ms);
      if (storyFraction(story, ms) >= 1) { go(1); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [story, video, go]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  if (!story) return null;
  const siblings = current.ring.stories;
  const duration = story.durationMs || STORY_PHOTO_DURATION_MS;
  const fraction = video
    ? (videoRef.current?.duration ? Math.min(1, elapsed / (videoRef.current.duration * 1000)) : 0)
    : Math.min(1, elapsed / duration);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        {video ? (
          <video
            key={story.id}
            ref={videoRef}
            src={mediaUrlOf(story)}
            style={styles.media}
            autoPlay
            playsInline
            onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime * 1000)}
            onEnded={() => go(1)}
          />
        ) : (
          <img key={story.id} src={mediaUrlOf(story)} alt="" style={styles.media} />
        )}

        <div style={styles.bars}>
          {siblings.map((s, i) => (
            <div key={s.id} style={styles.barTrack}>
              <div
                style={{
                  ...styles.barFill,
                  width: `${i < current.storyIndex ? 100 : i === current.storyIndex ? fraction * 100 : 0}%`,
                }}
              />
            </div>
          ))}
        </div>

        <div style={styles.header}>
          {current.ring.userPhoto && <img src={current.ring.userPhoto} alt="" style={styles.avatar} />}
          <span style={styles.name}>{current.ring.userName}</span>
          <button type="button" onClick={onClose} style={styles.close} aria-label="Fechar">
            <X size={22} color="#fff" />
          </button>
        </div>

        {story.caption && <p style={styles.caption}>{story.caption}</p>}

        <div style={{ ...styles.tap, left: 0 }} onClick={() => go(-1)} />
        <div style={{ ...styles.tap, right: 0 }} onClick={() => go(1)} />
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.92)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  card: {
    position: 'relative', height: '92vh', aspectRatio: '9 / 16', maxWidth: '100vw',
    borderRadius: '16px', overflow: 'hidden', backgroundColor: '#000',
  },
  media: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },
  bars: { position: 'absolute', top: 10, left: 10, right: 10, display: 'flex', gap: 4, zIndex: 3 },
  barTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#fff' },
  header: {
    position: 'absolute', top: 22, left: 12, right: 12, display: 'flex', alignItems: 'center', gap: 10, zIndex: 4,
  },
  avatar: { width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' },
  name: { color: '#fff', fontSize: 14, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.8)', flex: 1 },
  close: { background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' },
  caption: {
    position: 'absolute', left: 0, right: 0, bottom: 0, margin: 0, padding: '40px 16px 20px',
    color: '#fff', fontSize: 14, background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', zIndex: 2,
  },
  tap: { position: 'absolute', top: 70, bottom: 70, width: '35%', zIndex: 2, cursor: 'pointer' },
};
