import React, { useRef, useState } from 'react';

const MIN_CLIP_LENGTH = 0.3; // segundos — não deixa cortar um clipe pra quase nada

// ✅ Uma faixa de timeline visual pra um único clipe: mostra a tira de
// miniaturas, duas alças arrastáveis (início/fim) e um "cabeçote" (playhead)
// que segue a reprodução. Clicar em qualquer ponto da faixa pula o preview
// pra ali.
export default function ClipTimeline({ clip, playheadTime, onChangeRange, onSeek }) {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(null); // 'start' | 'end' | null

  const timeAtClientX = (clientX) => {
    const rect = trackRef.current.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return fraction * clip.duration;
  };

  const startDrag = (handle) => (e) => {
    e.stopPropagation();
    setDragging(handle);

    const handleMove = (moveEvent) => {
      const clientX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const time = timeAtClientX(clientX);
      if (handle === 'start') {
        onChangeRange(Math.min(time, clip.end - MIN_CLIP_LENGTH));
      } else {
        onChangeRange(undefined, Math.max(time, clip.start + MIN_CLIP_LENGTH));
      }
    };
    const stopDrag = () => {
      setDragging(null);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', stopDrag);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', stopDrag);
  };

  const handleTrackClick = (e) => {
    if (dragging) return;
    const time = timeAtClientX(e.clientX);
    onSeek(Math.min(Math.max(time, clip.start), clip.end));
  };

  const pct = (t) => `${(t / clip.duration) * 100}%`;

  return (
    <div ref={trackRef} style={styles.track} onClick={handleTrackClick}>
      {/* Miniaturas de fundo */}
      <div style={styles.thumbRow}>
        {(clip.thumbnails || []).map((src, i) => (
          <img key={i} src={src} alt="" style={styles.thumbImg} draggable={false} />
        ))}
        {(!clip.thumbnails || clip.thumbnails.length === 0) && <div style={styles.thumbPlaceholder} />}
      </div>

      {/* Sombra nas partes cortadas fora */}
      <div style={{ ...styles.dimOverlay, left: 0, width: pct(clip.start) }} />
      <div style={{ ...styles.dimOverlay, left: pct(clip.end), right: 0, width: 'auto' }} />

      {/* Área selecionada */}
      <div style={{ ...styles.selectedRange, left: pct(clip.start), width: `calc(${pct(clip.end)} - ${pct(clip.start)})` }} />

      {/* Cabeçote de reprodução */}
      {playheadTime != null && (
        <div style={{ ...styles.playhead, left: pct(Math.min(Math.max(playheadTime, clip.start), clip.end)) }} />
      )}

      {/* Alças de corte */}
      <div style={{ ...styles.handle, left: pct(clip.start) }} onMouseDown={startDrag('start')} onTouchStart={startDrag('start')} />
      <div style={{ ...styles.handle, left: pct(clip.end) }} onMouseDown={startDrag('end')} onTouchStart={startDrag('end')} />
    </div>
  );
}

const styles = {
  track: {
    position: 'relative',
    height: 56,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
    cursor: 'pointer',
    userSelect: 'none',
  },
  thumbRow: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
  },
  thumbImg: {
    flex: 1,
    height: '100%',
    objectFit: 'cover',
    pointerEvents: 'none',
  },
  thumbPlaceholder: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  dimOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    pointerEvents: 'none',
  },
  selectedRange: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    border: '2px solid #52fa35',
    boxSizing: 'border-box',
    pointerEvents: 'none',
  },
  playhead: {
    position: 'absolute',
    top: -3,
    bottom: -3,
    width: 2,
    backgroundColor: '#fff',
    boxShadow: '0 0 4px rgba(255,255,255,0.8)',
    pointerEvents: 'none',
  },
  handle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 12,
    marginLeft: -6,
    backgroundColor: '#52fa35',
    borderRadius: 4,
    cursor: 'ew-resize',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
  },
};
