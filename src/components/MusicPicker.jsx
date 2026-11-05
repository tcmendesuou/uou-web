import React, { useEffect, useState } from 'react';
import { Search, X, Music2, PlusCircle } from 'lucide-react';
import { searchMusic } from '../lib/music';

const MIN = 2;

// Modal "Adicionar música": busca na iTunes e devolve a faixa escolhida (igual ao app).
export default function MusicPicker({ onClose, onSelect }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setErr('');
    const term = q.trim();
    if (term.length < MIN) { setResults([]); setBusy(false); return undefined; }
    setBusy(true);
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await searchMusic(term);
        if (alive) { setResults(r); setBusy(false); }
      } catch {
        if (alive) { setErr('Não foi possível buscar. Tente novamente.'); setBusy(false); }
      }
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = (t) => {
    onSelect({ trackName: t.trackName, artistName: t.artistName, artworkUrl: t.artworkUrl, previewUrl: t.previewUrl });
    onClose();
  };

  const term = q.trim();
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.box} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Adicionar música">
        <div style={s.header}>
          <span style={s.title}>Adicionar música</span>
          <button type="button" style={s.close} onClick={onClose} aria-label="Fechar"><X size={20} color="#fff" /></button>
        </div>
        <div style={s.search}>
          <Search size={16} color="#888" />
          <input style={s.input} autoFocus placeholder="Buscar música..." value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button type="button" style={s.clear} onClick={() => setQ('')} aria-label="Limpar"><X size={15} color="#888" /></button>}
        </div>
        <div style={s.list}>
          {busy ? <p style={s.hint}>Buscando...</p>
            : err ? <p style={{ ...s.hint, color: '#ff6b6b' }}>{err}</p>
            : term.length < MIN ? <p style={s.hint}>Digite pelo menos {MIN} letras para buscar</p>
            : results.length === 0 ? <p style={s.hint}>Nenhuma música encontrada</p>
            : results.map((t) => (
              <button key={t.trackId} type="button" style={s.row} onClick={() => pick(t)}>
                {t.artworkUrl ? <img src={t.artworkUrl} alt="" style={s.art} /> : <span style={s.artFb}><Music2 size={18} color="#fff" /></span>}
                <span style={s.texts}>
                  <span style={s.name}>{t.trackName}</span>
                  <span style={s.artist}>{t.artistName}</span>
                </span>
                <PlusCircle size={20} color="#b5b5bd" />
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  box: { width: '100%', maxWidth: 460, maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: '#1b1b1d', border: '1px solid #2a2a2d', borderRadius: 18, overflow: 'hidden', color: '#fff' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 10px' },
  title: { fontSize: 17, fontWeight: 800 },
  close: { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4 },
  search: { display: 'flex', alignItems: 'center', gap: 8, margin: '0 14px 8px', padding: '0 12px', background: '#222224', border: '1px solid #2a2a2d', borderRadius: 10 },
  input: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 15, padding: '10px 0', fontFamily: 'inherit' },
  clear: { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 2 },
  list: { overflowY: 'auto', minHeight: 140, paddingBottom: 8 },
  hint: { color: '#8a8a95', fontSize: 14, textAlign: 'center', margin: '40px 20px' },
  row: { width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'transparent', border: 'none', borderTop: '1px solid #2a2a2d', cursor: 'pointer', color: '#fff', fontFamily: 'inherit', textAlign: 'left' },
  art: { width: 44, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0 },
  artFb: { width: 44, height: 44, borderRadius: 6, background: '#2f2f33', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  texts: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' },
  name: { fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  artist: { fontSize: 12, color: '#999', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
};
