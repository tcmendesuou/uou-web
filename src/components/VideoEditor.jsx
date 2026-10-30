// src/components/VideoEditor.jsx
// Editor de vídeo próprio do UOU. Importa vídeos, corta nas pontas, divide, apaga,
// reordena, toca a sequência e exporta um MP4 (no navegador, sem servidor).
// Uso: <VideoEditor initialClips={[{ name, url, file? }]} onClose={...} onExported={(blob) => ...} />
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { exportTimeline } from '../lib/editorExport';
import {
  X, Plus, Play, Pause, Scissors, Trash2, Undo2, Redo2, SkipBack, Download, Type, Music2,
  Sparkles, Gauge, Subtitles, Blend, ZoomIn, ZoomOut, Film, ChevronLeft, ChevronRight, Video, CheckCircle2, MonitorUp,
} from 'lucide-react';

const GREEN = '#52fa35';
const MIN_CLIP = 0.2; // segundos
const RATIOS = [
  { id: '9:16', w: 9, h: 16 },
  { id: '1:1', w: 1, h: 1 },
  { id: '16:9', w: 16, h: 9 },
];
const TOOLS = [
  { id: 'texto', label: 'Texto', icon: Type },
  { id: 'audio', label: 'Áudio', icon: Music2 },
  { id: 'filtros', label: 'Filtros', icon: Sparkles },
  { id: 'velocidade', label: 'Velocidade', icon: Gauge },
  { id: 'legendas', label: 'Legendas', icon: Subtitles },
  { id: 'transicoes', label: 'Transições', icon: Blend },
];

const fmt = (s) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 10);
  return `${m}:${String(sec).padStart(2, '0')}.${cs}`;
};

let idCounter = 1;
const newId = () => idCounter++;

// Miniaturas de um vídeo: 1 quadro a cada `step` segundos (máx. 60 quadros)
async function makeThumbs(url, duration) {
  const count = Math.min(60, Math.max(1, Math.ceil(duration)));
  const step = duration / count;
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  if (!url.startsWith('blob:')) video.crossOrigin = 'anonymous';
  video.src = url;
  await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
  const canvas = document.createElement('canvas');
  const ratio = (video.videoWidth || 16) / (video.videoHeight || 9);
  canvas.height = 60;
  canvas.width = Math.round(60 * ratio);
  const ctx = canvas.getContext('2d');
  const thumbs = [];
  for (let i = 0; i < count; i++) {
    video.currentTime = Math.min(duration - 0.05, i * step + step / 2);
    await new Promise((resolve) => { video.onseeked = resolve; });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    thumbs.push(canvas.toDataURL('image/jpeg', 0.55));
  }
  return { thumbs, step, ratio };
}

export default function VideoEditor({ initialClips = [], onClose, onExported }) {
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const trackRef = useRef(null);

  const [library, setLibrary] = useState([]); // [{id,name,url,duration,thumbs,step}]
  const [clips, setClips] = useState([]); // [{id, srcId, in, out}]
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [selected, setSelected] = useState(null);
  const [time, setTime] = useState(0); // posição na linha do tempo (s)
  const [playing, setPlaying] = useState(false);
  const [pps, setPps] = useState(70); // pixels por segundo (zoom)
  const [ratio, setRatio] = useState(RATIOS[0]);
  const [tool, setTool] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [mediaTab, setMediaTab] = useState('brutos');
  const [cloud, setCloud] = useState([]); // vídeos da biblioteca do criador (Brutos e Prontos)
  const [exportPct, setExportPct] = useState(0);
  const [exportError, setExportError] = useState('');
  const cancelRef = useRef({ cancelled: false });

  const libRef = useRef(library); libRef.current = library;
  const clipsRef = useRef(clips); clipsRef.current = clips;
  const timeRef = useRef(0);
  const playingRef = useRef(false);

  // Início de cada clipe na linha do tempo
  const layout = useMemo(() => {
    let acc = 0;
    return clips.map((c) => {
      const start = acc;
      acc += c.out - c.in;
      return { ...c, start, len: c.out - c.in };
    });
  }, [clips]);
  const total = layout.length ? layout[layout.length - 1].start + layout[layout.length - 1].len : 0;
  const layoutRef = useRef(layout); layoutRef.current = layout;
  const totalRef = useRef(total); totalRef.current = total;

  const srcOf = (srcId) => libRef.current.find((l) => l.id === srcId);

  // -------- histórico (desfazer / refazer) --------
  const commit = useCallback((next) => {
    setPast((p) => [...p.slice(-49), clipsRef.current]);
    setFuture([]);
    setClips(next);
  }, []);
  const undo = () => {
    setPast((p) => {
      if (!p.length) return p;
      setFuture((f) => [clipsRef.current, ...f]);
      setClips(p[p.length - 1]);
      return p.slice(0, -1);
    });
  };
  const redo = () => {
    setFuture((f) => {
      if (!f.length) return f;
      setPast((p) => [...p, clipsRef.current]);
      setClips(f[0]);
      return f.slice(1);
    });
  };

  // -------- importar vídeos --------
  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('video'));
    e.target.value = '';
    await importItems(files.map((file) => ({ name: file.name, url: URL.createObjectURL(file), file })));
  };

  async function importItems(items) {
    for (const item of items) {
      const { url, name, file } = item;
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.src = url;
      // eslint-disable-next-line no-await-in-loop
      const duration = await new Promise((resolve) => { v.onloadedmetadata = () => resolve(v.duration || 0); v.onerror = () => resolve(0); });
      if (!duration) continue;
      const id = newId();
      const entry = { id, name, url, file: file || null, duration, thumbs: [], step: duration };
      setLibrary((prev) => [...prev, entry]);
      addToTimeline(entry);
      makeThumbs(url, duration)
        .then(({ thumbs, step }) => setLibrary((prev) => prev.map((l) => (l.id === id ? { ...l, thumbs, step } : l))))
        .catch((err) => console.error('[Editor] miniaturas:', err));
    }
  }

  // Biblioteca do criador (mesma coleção da página Criar): Brutos e Prontos
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return undefined;
    return onSnapshot(
      query(collection(db, 'creator_videos'), where('userId', '==', uid)),
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setCloud(items);
      },
      (err) => console.error('[Editor] erro ao carregar biblioteca:', err)
    );
  }, []);

  const addCloud = (video) => {
    importItems([{ name: video.originalName || 'Vídeo', url: video.url }]);
  };

  // Clipes que já chegam abertos (vindos da página Criar)
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (initialClips.length) importItems(initialClips);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------- exportar --------
  const handleExport = async () => {
    if (!clips.length || exporting) return;
    setPlaying(false);
    setExportError('');
    setExportPct(0);
    setExporting(true);
    cancelRef.current = { cancelled: false };
    try {
      const payload = layout.map((c) => {
        const src = srcOf(c.srcId);
        return { file: src.file || undefined, url: src.url, in: c.in, out: c.out };
      });
      const blob = await exportTimeline(payload, {
        ratio: ratio.id,
        onProgress: setExportPct,
        signal: cancelRef.current,
      });
      if (onExported) await onExported(blob);
      else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'uou-video.mp4';
        a.click();
      }
    } catch (err) {
      if (err?.message !== 'cancelado') {
        console.error('[Editor] erro ao exportar:', err);
        setExportError(err?.message || 'Não foi possível exportar o vídeo.');
      }
    } finally {
      setExporting(false);
    }
  };

  function addToTimeline(entry) {
    commit([...clipsRef.current, { id: newId(), srcId: entry.id, in: 0, out: entry.duration }]);
  }

  // -------- player: uma única <video> reaproveitada por todos os clipes --------
  const activeIdxRef = useRef(-1);

  const loadClipAt = useCallback((idx, localTime, thenPlay) => {
    const video = videoRef.current;
    const clip = layoutRef.current[idx];
    if (!video || !clip) return;
    const src = srcOf(clip.srcId);
    if (!src) return;
    activeIdxRef.current = idx;
    const apply = () => {
      video.currentTime = localTime;
      if (thenPlay) video.play().catch(() => {});
    };
    if (video.dataset.srcId !== String(clip.srcId)) {
      video.dataset.srcId = String(clip.srcId);
      video.src = src.url;
      video.addEventListener('loadedmetadata', apply, { once: true });
    } else {
      apply();
    }
  }, []);

  const seek = useCallback((t, keepPlaying = false) => {
    const lay = layoutRef.current;
    if (!lay.length) { setTime(0); timeRef.current = 0; return; }
    const clamped = Math.min(Math.max(0, t), totalRef.current);
    let idx = lay.findIndex((c) => clamped < c.start + c.len);
    if (idx === -1) idx = lay.length - 1;
    const c = lay[idx];
    const local = Math.min(c.out, c.in + (clamped - c.start));
    timeRef.current = clamped;
    setTime(clamped);
    loadClipAt(idx, local, keepPlaying);
  }, [loadClipAt]);

  // Quando a lista de clipes muda, mantém o quadro mostrado coerente
  useEffect(() => {
    if (!playingRef.current) seek(Math.min(timeRef.current, total), false);
    if (!clips.length) {
      const v = videoRef.current;
      if (v) { v.pause(); v.removeAttribute('src'); delete v.dataset.srcId; v.load(); }
      activeIdxRef.current = -1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips]);

  // Laço de reprodução
  useEffect(() => {
    playingRef.current = playing;
    if (!playing) { videoRef.current?.pause(); return undefined; }
    let raf;
    const tick = () => {
      const video = videoRef.current;
      const lay = layoutRef.current;
      const idx = activeIdxRef.current;
      const clip = lay[idx];
      if (video && clip) {
        if (video.currentTime >= clip.out - 0.04) {
          if (idx < lay.length - 1) {
            const next = lay[idx + 1];
            timeRef.current = next.start;
            setTime(next.start);
            loadClipAt(idx + 1, next.in, true);
          } else {
            setPlaying(false);
            timeRef.current = totalRef.current;
            setTime(totalRef.current);
            return;
          }
        } else {
          const t = clip.start + Math.max(0, video.currentTime - clip.in);
          timeRef.current = t;
          setTime(t);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    const video = videoRef.current;
    if (video && video.paused) video.play().catch(() => {});
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, loadClipAt]);

  const togglePlay = () => {
    if (!clips.length) return;
    if (!playing && timeRef.current >= total - 0.05) seek(0, false);
    setPlaying((p) => !p);
  };

  // -------- edição --------
  const splitAtPlayhead = () => {
    const t = timeRef.current;
    const idx = layout.findIndex((c) => t > c.start + MIN_CLIP && t < c.start + c.len - MIN_CLIP);
    if (idx === -1) return;
    const c = layout[idx];
    const cut = c.in + (t - c.start);
    const a = { id: newId(), srcId: c.srcId, in: c.in, out: cut };
    const b = { id: newId(), srcId: c.srcId, in: cut, out: c.out };
    const next = clips.slice();
    next.splice(idx, 1, a, b);
    commit(next);
    setSelected(b.id);
  };

  const deleteSelected = () => {
    if (selected == null) return;
    commit(clips.filter((c) => c.id !== selected));
    setSelected(null);
  };

  const moveSelected = (dir) => {
    const idx = clips.findIndex((c) => c.id === selected);
    const target = idx + dir;
    if (idx === -1 || target < 0 || target >= clips.length) return;
    const next = clips.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    commit(next);
  };

  // Arrastar as alças de corte
  const trimDrag = (e, clipId, side) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const base = clipsRef.current;
    const original = base.find((c) => c.id === clipId);
    const src = srcOf(original.srcId);
    const before = base;
    let latest = base;
    const move = (ev) => {
      const dt = (ev.clientX - startX) / pps;
      latest = base.map((c) => {
        if (c.id !== clipId) return c;
        if (side === 'left') return { ...c, in: Math.min(c.out - MIN_CLIP, Math.max(0, original.in + dt)) };
        return { ...c, out: Math.max(c.in + MIN_CLIP, Math.min(src.duration, original.out + dt)) };
      });
      setClips(latest);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setPast((p) => [...p.slice(-49), before]);
      setFuture([]);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Clicar/arrastar na régua move a agulha
  const scrubFrom = (e) => {
    const rect = trackRef.current.getBoundingClientRect();
    const toTime = (clientX) => (clientX - rect.left + trackRef.current.scrollLeft) / pps;
    setPlaying(false);
    seek(toTime(e.clientX));
    const move = (ev) => seek(toTime(ev.clientX));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Atalhos
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.key === 's' || e.key === 'S') splitAtPlayhead();
      else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => () => libRef.current.forEach((l) => URL.revokeObjectURL(l.url)), []);

  const timelineWidth = Math.max(total * pps + 240, 800);
  const ticks = [];
  for (let s = 0; s <= Math.ceil(timelineWidth / pps); s++) ticks.push(s);
  const previewBox = ratio.w >= ratio.h
    ? { width: 'min(100%, 560px)', aspectRatio: `${ratio.w} / ${ratio.h}` }
    : { height: '100%', aspectRatio: `${ratio.w} / ${ratio.h}`, maxWidth: '100%' };

  return (
    <div style={s.root}>
      <input ref={fileRef} type="file" accept="video/*" multiple onChange={handleFiles} style={{ display: 'none' }} />

      {/* Barra superior */}
      <div style={s.topBar}>
        <div style={s.topLeft}>
          <button type="button" style={s.iconBtn} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
          <Film size={18} color={GREEN} />
          <span style={s.projectName}>Projeto sem título</span>
          <span style={s.betaTag}>beta</span>
        </div>
        <div style={s.ratioGroup}>
          {RATIOS.map((r) => (
            <button key={r.id} type="button" style={s.ratioBtn(ratio.id === r.id)} onClick={() => setRatio(r)}>{r.id}</button>
          ))}
        </div>
        <button
          type="button"
          style={{ ...s.exportBtn, ...(clips.length && !exporting ? s.exportBtnOn : {}) }}
          disabled={!clips.length || exporting}
          onClick={handleExport}
        >
          <Download size={16} /> {onExported ? 'Exportar e salvar em Prontos' : 'Exportar'}
        </button>
      </div>

      {/* Área principal */}
      <div style={s.main}>
        {/* Mídia: Brutos e Prontos (da nuvem) + vídeos do computador */}
        <aside style={s.panel}>
          <div style={s.mediaTabs}>
            {[
              { id: 'brutos', label: 'Brutos', icon: Video },
              { id: 'prontos', label: 'Prontos', icon: CheckCircle2 },
              { id: 'computador', label: 'Computador', icon: MonitorUp },
            ].map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" style={s.mediaTab(mediaTab === id)} onClick={() => setMediaTab(id)}>
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>

          {mediaTab === 'computador' && (
            <>
              <button type="button" style={s.importBtn} onClick={() => fileRef.current?.click()}>
                <Plus size={18} /> Importar vídeos
              </button>
              <div style={s.libList}>
                {library.length === 0 && <p style={s.hint}>Os vídeos que você importar ou adicionar aparecem aqui.</p>}
                {library.map((l) => (
                  <button key={l.id} type="button" style={s.libItem} onClick={() => addToTimeline(l)} title="Adicionar à linha do tempo">
                    <div style={{ ...s.libThumb, backgroundImage: l.thumbs[0] ? `url(${l.thumbs[0]})` : 'none' }}>
                      <span style={s.libDur}>{fmt(l.duration).slice(0, -2)}</span>
                    </div>
                    <span style={s.libName}>{l.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {mediaTab !== 'computador' && (
            <div style={s.libList}>
              {cloud.filter((v) => v.status === (mediaTab === 'brutos' ? 'raw' : 'ready')).length === 0 && (
                <p style={s.hint}>
                  {mediaTab === 'brutos'
                    ? 'Nenhum vídeo bruto salvo ainda. Suas gravações do app aparecem aqui.'
                    : 'Nenhum vídeo pronto ainda. Exporte um vídeo e ele aparece aqui.'}
                </p>
              )}
              {cloud.filter((v) => v.status === (mediaTab === 'brutos' ? 'raw' : 'ready')).map((v) => (
                <button key={v.id} type="button" style={s.libItem} onClick={() => addCloud(v)} title="Adicionar à linha do tempo">
                  <video src={`${v.url}#t=0.5`} preload="metadata" muted style={s.libThumbVideo} />
                  <span style={s.libName}>{v.originalName || 'Vídeo'}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* Prévia */}
        <section style={s.center}>
          <div style={s.stage}>
            <div style={{ ...s.screen, ...previewBox }}>
              <video ref={videoRef} style={s.video} playsInline />
              {clips.length === 0 && (
                <div style={s.emptyScreen}>
                  <Film size={34} color="#333" />
                  <p style={s.hint}>Sua prévia aparece aqui</p>
                </div>
              )}
            </div>
          </div>
          <div style={s.transport}>
            <span style={s.timeText}>{fmt(time)}</span>
            <button type="button" style={s.roundBtn} onClick={() => { setPlaying(false); seek(0); }} aria-label="Voltar ao início"><SkipBack size={16} /></button>
            <button type="button" style={s.playBtn} onClick={togglePlay} aria-label={playing ? 'Pausar' : 'Tocar'}>
              {playing ? <Pause size={20} fill="#000" /> : <Play size={20} fill="#000" />}
            </button>
            <span style={s.timeTextDim}>{fmt(total)}</span>
          </div>
        </section>

        {/* Ferramentas */}
        <aside style={s.panel}>
          <p style={s.panelTitle}>Ferramentas</p>
          <div style={s.toolGrid}>
            {TOOLS.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.id} type="button" style={s.toolBtn(tool === t.id)} onClick={() => setTool(tool === t.id ? null : t.id)}>
                  <Icon size={20} color="#fff" />
                  <span style={s.toolLabel}>{t.label}</span>
                </button>
              );
            })}
          </div>
          {tool && (
            <div style={s.toolInfo}>
              <b>{TOOLS.find((t) => t.id === tool).label}</b>
              <p style={s.hint}>Entra nas próximas etapas do editor.</p>
            </div>
          )}
          <div style={s.shortcuts}>
            <p style={s.panelTitle}>Atalhos</p>
            <p style={s.sc}><kbd style={s.kbd}>Espaço</kbd> tocar / pausar</p>
            <p style={s.sc}><kbd style={s.kbd}>S</kbd> dividir na agulha</p>
            <p style={s.sc}><kbd style={s.kbd}>Del</kbd> apagar clipe</p>
            <p style={s.sc}><kbd style={s.kbd}>Ctrl+Z</kbd> desfazer</p>
          </div>
        </aside>
      </div>

      {/* Linha do tempo */}
      <div style={s.timeline}>
        <div style={s.tlBar}>
          <div style={s.tlTools}>
            <button type="button" style={s.tlBtn} onClick={undo} disabled={!past.length} title="Desfazer"><Undo2 size={16} /></button>
            <button type="button" style={s.tlBtn} onClick={redo} disabled={!future.length} title="Refazer"><Redo2 size={16} /></button>
            <span style={s.sep} />
            <button type="button" style={s.tlBtnText} onClick={splitAtPlayhead} disabled={!clips.length}><Scissors size={15} /> Dividir</button>
            <button type="button" style={s.tlBtnText} onClick={deleteSelected} disabled={selected == null}><Trash2 size={15} /> Apagar</button>
            <button type="button" style={s.tlBtn} onClick={() => moveSelected(-1)} disabled={selected == null} title="Mover para trás"><ChevronLeft size={16} /></button>
            <button type="button" style={s.tlBtn} onClick={() => moveSelected(1)} disabled={selected == null} title="Mover para frente"><ChevronRight size={16} /></button>
          </div>
          <div style={s.zoom}>
            <ZoomOut size={15} color="#888" />
            <input type="range" min={20} max={200} value={pps} onChange={(e) => setPps(Number(e.target.value))} style={{ accentColor: GREEN }} />
            <ZoomIn size={15} color="#888" />
          </div>
        </div>

        <div ref={trackRef} style={s.trackScroll}>
          <div style={{ ...s.trackInner, width: timelineWidth }}>
            {/* Régua */}
            <div style={s.ruler} onPointerDown={scrubFrom}>
              {ticks.map((sec) => (
                <div key={sec} style={{ ...s.tick, left: sec * pps, height: sec % 5 === 0 ? 12 : 6 }}>
                  {sec % 5 === 0 && <span style={s.tickLabel}>{fmt(sec).slice(0, -2)}</span>}
                </div>
              ))}
            </div>

            {/* Faixa de vídeo */}
            <div style={s.videoTrack} onPointerDown={(e) => { if (e.target === e.currentTarget) { setSelected(null); scrubFrom(e); } }}>
              {layout.map((c) => {
                const src = srcOf(c.srcId);
                return (
                  <div
                    key={c.id}
                    style={{ ...s.clip, left: c.start * pps, width: c.len * pps, ...(selected === c.id ? s.clipSelected : {}) }}
                    onPointerDown={(e) => { e.stopPropagation(); setSelected(c.id); }}
                    onDoubleClick={() => { setPlaying(false); seek(c.start); }}
                  >
                    <div style={s.thumbsLayer}>
                      {src?.thumbs.map((t, i) => (
                        <div
                          key={i}
                          style={{
                            ...s.thumbCell,
                            left: (i * src.step - c.in) * pps,
                            width: src.step * pps,
                            backgroundImage: `url(${t})`,
                          }}
                        />
                      ))}
                    </div>
                    <span style={s.clipLabel}>{src?.name}</span>
                    {selected === c.id && (
                      <>
                        <div style={{ ...s.handle, left: 0 }} onPointerDown={(e) => trimDrag(e, c.id, 'left')}><span style={s.grip} /></div>
                        <div style={{ ...s.handle, right: 0 }} onPointerDown={(e) => trimDrag(e, c.id, 'right')}><span style={s.grip} /></div>
                      </>
                    )}
                  </div>
                );
              })}
              {clips.length === 0 && <p style={{ ...s.hint, padding: '26px 16px' }}>Os clipes que você importar aparecem aqui. Arraste as alças verdes para cortar.</p>}
            </div>

            {/* Agulha */}
            <div style={{ ...s.playhead, left: time * pps }}>
              <span style={s.playheadTop} />
            </div>
          </div>
        </div>
      </div>

      {exporting && (
        <div style={s.overlay}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Exportando seu vídeo...</p>
          <div style={s.barTrack}><div style={{ ...s.barFill, width: `${Math.round(exportPct * 100)}%` }} /></div>
          <p style={s.hint}>{Math.round(exportPct * 100)}% — não feche esta janela</p>
          <button type="button" style={s.cancelBtn} onClick={() => { cancelRef.current.cancelled = true; }}>Cancelar</button>
        </div>
      )}
      {exportError && !exporting && (
        <div style={s.overlay}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Não foi possível exportar</p>
          <p style={{ ...s.hint, maxWidth: 360, textAlign: 'center' }}>{exportError}</p>
          <button type="button" style={s.cancelBtn} onClick={() => setExportError('')}>Fechar</button>
        </div>
      )}
    </div>
  );
}

const s = {
  root: {
    position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', flexDirection: 'column',
    backgroundColor: '#07080c', color: '#f0f0f0',
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
  },
  topBar: {
    height: 54, flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
    padding: '0 16px', borderBottom: '1px solid #15161c',
  },
  topLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  iconBtn: {
    width: 34, height: 34, borderRadius: '50%', border: '1px solid #23242c', backgroundColor: '#111218',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  projectName: { fontSize: 14, fontWeight: 600 },
  betaTag: {
    fontSize: 10, fontWeight: 700, color: GREEN, border: `1px solid ${GREEN}`, borderRadius: 999, padding: '2px 8px',
  },
  ratioGroup: { display: 'flex', gap: 4, padding: 3, backgroundColor: '#111218', borderRadius: 10, border: '1px solid #1c1d25' },
  ratioBtn: (a) => ({
    border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
    backgroundColor: a ? GREEN : 'transparent', color: a ? '#000' : '#999', fontFamily: 'inherit',
  }),
  exportBtn: {
    justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 8, border: 'none', borderRadius: 10,
    padding: '9px 16px', backgroundColor: '#1a1b22', color: '#666', fontSize: 13, fontWeight: 700,
    cursor: 'not-allowed', fontFamily: 'inherit',
  },
  exportBtnOn: { backgroundColor: GREEN, color: '#000', cursor: 'pointer' },
  overlay: {
    position: 'absolute', inset: 0, zIndex: 20, backgroundColor: 'rgba(3,4,8,0.88)', display: 'flex',
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
  },
  barTrack: { width: 320, height: 8, borderRadius: 4, backgroundColor: '#1a1b22', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: GREEN, transition: 'width 0.2s' },
  cancelBtn: {
    border: '1px solid #2a2b35', backgroundColor: 'transparent', color: '#ccc', borderRadius: 10, padding: '8px 18px',
    cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
  },
  main: { flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '240px minmax(0, 1fr) 240px', gridTemplateRows: 'minmax(0, 1fr)' },
  panel: { minHeight: 0, padding: 14, borderRight: '1px solid #15161c', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 },
  panelTitle: { margin: '0 0 2px 0', fontSize: 12, fontWeight: 700, color: '#8a8b95', letterSpacing: 0.4, textTransform: 'uppercase' },
  importBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', borderRadius: 12,
    border: '1px dashed #34353f', backgroundColor: '#101117', color: '#fff', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  mediaTabs: { display: 'flex', gap: 4, padding: 3, backgroundColor: '#111218', borderRadius: 10, border: '1px solid #1c1d25' },
  mediaTab: (a) => ({
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, border: 'none', borderRadius: 7,
    padding: '7px 0', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    backgroundColor: a ? 'rgba(82,250,53,0.14)' : 'transparent', color: a ? GREEN : '#8a8b95',
  }),
  libThumbVideo: { width: 64, height: 42, borderRadius: 7, backgroundColor: '#1a1b22', objectFit: 'cover', flexShrink: 0 },
  libList: { display: 'flex', flexDirection: 'column', gap: 8 },
  libItem: {
    display: 'flex', alignItems: 'center', gap: 10, padding: 6, borderRadius: 10, border: '1px solid #1a1b22',
    backgroundColor: '#0d0e13', cursor: 'pointer', textAlign: 'left', color: 'inherit', fontFamily: 'inherit',
  },
  libThumb: {
    position: 'relative', width: 64, height: 42, borderRadius: 7, backgroundColor: '#1a1b22',
    backgroundSize: 'cover', backgroundPosition: 'center', flexShrink: 0,
  },
  libDur: {
    position: 'absolute', right: 3, bottom: 3, fontSize: 9, fontWeight: 700, backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 4, padding: '1px 4px',
  },
  libName: { fontSize: 12, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  hint: { color: '#666', fontSize: 12, margin: 0, lineHeight: 1.5 },
  center: { display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden', borderRight: '1px solid #15161c' },
  stage: { flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflow: 'hidden' },
  screen: {
    position: 'relative', backgroundColor: '#000', borderRadius: 10, overflow: 'hidden', maxHeight: '100%',
    border: '1px solid #1c1d25', boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
  },
  video: { width: '100%', height: '100%', objectFit: 'contain', display: 'block', backgroundColor: '#000' },
  emptyScreen: {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 8,
  },
  transport: { height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, borderTop: '1px solid #15161c' },
  timeText: { fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 62, textAlign: 'right' },
  timeTextDim: { fontSize: 13, color: '#666', fontVariantNumeric: 'tabular-nums', minWidth: 62 },
  roundBtn: {
    width: 34, height: 34, borderRadius: '50%', border: '1px solid #23242c', backgroundColor: '#111218', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  playBtn: {
    width: 44, height: 44, borderRadius: '50%', border: 'none', backgroundColor: GREEN, color: '#000',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  toolGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  toolBtn: (a) => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 0', borderRadius: 12,
    border: a ? `1px solid ${GREEN}` : '1px solid #1a1b22', backgroundColor: a ? 'rgba(82,250,53,0.08)' : '#0d0e13',
    cursor: 'pointer', fontFamily: 'inherit',
  }),
  toolLabel: { fontSize: 11, color: '#ccc', fontWeight: 600 },
  toolInfo: { padding: 12, borderRadius: 10, backgroundColor: '#0d0e13', border: '1px solid #1a1b22', fontSize: 13 },
  shortcuts: { marginTop: 'auto', paddingTop: 12, borderTop: '1px solid #15161c' },
  sc: { color: '#8a8b95', fontSize: 11.5, margin: '5px 0' },
  kbd: {
    backgroundColor: '#1a1b22', border: '1px solid #2a2b35', borderRadius: 5, padding: '1px 6px', fontSize: 10.5,
    color: '#ddd', marginRight: 6, fontFamily: 'inherit',
  },
  timeline: { height: 236, flexShrink: 0, display: 'flex', flexDirection: 'column', borderTop: '1px solid #15161c', backgroundColor: '#090a0e' },
  tlBar: { height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px' },
  tlTools: { display: 'flex', alignItems: 'center', gap: 6 },
  tlBtn: {
    width: 32, height: 32, borderRadius: 8, border: 'none', backgroundColor: 'transparent', color: '#ddd',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  tlBtnText: {
    display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 8, border: 'none',
    backgroundColor: '#14151b', color: '#ddd', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
  sep: { width: 1, height: 20, backgroundColor: '#23242c', margin: '0 4px' },
  zoom: { display: 'flex', alignItems: 'center', gap: 8 },
  trackScroll: { flex: 1, overflowX: 'auto', overflowY: 'hidden', position: 'relative' },
  trackInner: { position: 'relative', height: '100%' },
  ruler: { position: 'relative', height: 26, borderBottom: '1px solid #15161c', cursor: 'col-resize' },
  tick: { position: 'absolute', bottom: 0, width: 1, backgroundColor: '#2c2d37' },
  tickLabel: { position: 'absolute', top: -14, left: 4, fontSize: 9.5, color: '#6d6e79', whiteSpace: 'nowrap' },
  videoTrack: { position: 'relative', height: 84, margin: '14px 0 0 0' },
  clip: {
    position: 'absolute', top: 0, height: 72, borderRadius: 8, overflow: 'hidden', backgroundColor: '#1a1b22',
    border: '1px solid #2c2d37', cursor: 'pointer', boxSizing: 'border-box',
  },
  clipSelected: { border: `2px solid ${GREEN}` },
  thumbsLayer: { position: 'absolute', inset: 0 },
  thumbCell: { position: 'absolute', top: 0, bottom: 0, backgroundSize: 'cover', backgroundPosition: 'center' },
  clipLabel: {
    position: 'absolute', left: 8, top: 4, fontSize: 10, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px #000',
    maxWidth: 'calc(100% - 16px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pointerEvents: 'none',
  },
  handle: {
    position: 'absolute', top: 0, bottom: 0, width: 14, backgroundColor: GREEN, cursor: 'ew-resize',
    display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none',
  },
  grip: { width: 2, height: 22, borderRadius: 1, backgroundColor: '#000' },
  playhead: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#fff', pointerEvents: 'none', zIndex: 5 },
  playheadTop: {
    position: 'absolute', top: 0, left: -5, width: 12, height: 12, backgroundColor: '#fff', borderRadius: '3px 3px 6px 6px',
  },
};
