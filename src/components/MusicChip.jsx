import React from 'react';
import { Music2, ChevronRight, Pause, X } from 'lucide-react';

// Sticker de música do post (igual ao app): capa + faixa em negrito + artista + ícone.
// Parado mostra ">" ; tocando mostra pausa. Sem onToggle é só visual.
export default function MusicChip({ music, playing = false, onToggle, onRemove, style }) {
  if (!music?.trackName) return null;
  const inner = (
    <>
      {music.artworkUrl
        ? <img src={music.artworkUrl} alt="" style={s.art} />
        : <span style={s.artFallback}><Music2 size={15} color="#fff" /></span>}
      <span style={s.texts}>
        <span style={s.track}>{music.trackName}</span>
        {music.artistName && <span style={s.artist}>{music.artistName}</span>}
      </span>
      {playing ? <Pause size={13} color="rgba(255,255,255,0.85)" /> : <ChevronRight size={14} color="rgba(255,255,255,0.85)" />}
    </>
  );
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', ...style }}>
      {onToggle ? (
        <button type="button" style={{ ...s.chip, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onToggle(); }}
          aria-label={`${music.trackName}${music.artistName ? ` — ${music.artistName}` : ''}`}>{inner}</button>
      ) : <span style={s.chip}>{inner}</span>}
      {onRemove && (
        <button type="button" style={s.remove} onClick={onRemove} aria-label="Remover música"><X size={13} color="#fff" /></button>
      )}
    </span>
  );
}

const s = {
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.62)',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '4px 9px 4px 5px',
    maxWidth: '100%', fontFamily: 'inherit', color: '#fff', textAlign: 'left',
  },
  art: { width: 32, height: 32, borderRadius: 9, objectFit: 'cover', flexShrink: 0 },
  artFallback: { width: 32, height: 32, borderRadius: 9, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  texts: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  track: { fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  artist: { fontSize: 10, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  remove: { background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 999, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
};
