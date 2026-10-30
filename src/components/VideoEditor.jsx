// src/components/VideoEditor.jsx
// Editor de vídeo próprio do UOU. Importa vídeos, corta nas pontas, divide, apaga,
// reordena, toca a sequência e exporta um MP4 (no navegador, sem servidor).
// Uso: <VideoEditor initialClips={[{ name, url, file? }]} onClose={...} onExported={(blob) => ...} />
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, query, where, onSnapshot, addDoc, setDoc, doc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { exportTimeline } from '../lib/editorExport';
import { FILTERS, filterCss } from '../lib/editorFilters';
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

// Cabeçalho de painel (estilo Premiere): título em aba sublinhada e ≡ no canto.
// `inset` desfaz o recuo de painéis que têm padding.
function PanelHead({ title, inset = false }) {
  return (
    <div style={{ ...s.panelHead, ...(inset ? { margin: '-14px -14px 4px -14px' } : {}) }}>
      <span style={s.panelHeadTab}>{title}</span>
      <span style={s.panelHeadMenu} aria-hidden>≡</span>
    </div>
  );
}

// Projeto salvo → entradas da biblioteca do editor (as miniaturas são refeitas ao abrir)
const libraryFromProject = (project) => {
  const media = project?.media || [];
  (project?.clips || []).forEach((c) => { if (c.id >= idCounter) idCounter = c.id + 1; });
  media.forEach((m) => { if (m.id >= idCounter) idCounter = m.id + 1; });
  return media.map((m) => ({
    id: m.id, name: m.name, url: m.url, file: null, duration: m.duration || 0, thumbs: [], step: m.duration || 1, storagePath: m.storagePath,
  }));
};

export default function VideoEditor({ initialClips = [], project = null, onClose, onExported }) {
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const trackRef = useRef(null);

  const [library, setLibrary] = useState(() => libraryFromProject(project)); // [{id,name,url,duration,thumbs,step}]
  const [clips, setClips] = useState(() => (project?.clips || []).map((c) => ({ ...c }))); // [{id, srcId, in, out}]
  const [projectId, setProjectId] = useState(project?.id || null);
  const [name, setName] = useState(project?.name || 'Projeto sem título');
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [closing, setClosing] = useState(false);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [selected, setSelected] = useState(null);
  const [time, setTime] = useState(0); // posição na linha do tempo (s)
  const [playing, setPlaying] = useState(false);
  const [pps, setPps] = useState(70); // pixels por segundo (zoom)
  const [ratio, setRatio] = useState(() => RATIOS.find((r) => r.id === project?.ratio) || RATIOS[0]);
  const [tool, setTool] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [mediaTab, setMediaTab] = useState('brutos');
  const [cloud, setCloud] = useState([]); // vídeos da biblioteca do criador (Brutos e Prontos)
  const [exportPct, setExportPct] = useState(0);
  const [exportError, setExportError] = useState('');
  const cancelRef = useRef({ cancelled: false });

  const libRef = useRef(library); libRef.current = library;
  const cloudRef = useRef([]); cloudRef.current = cloud;
  const clipsRef = useRef(clips); clipsRef.current = clips;
  const timeRef = useRef(0);
  const nameRef = useRef(name); nameRef.current = name;
  const ratioRef = useRef(ratio); ratioRef.current = ratio;
  const projectIdRef = useRef(project?.id || null);
  const dirtyRef = useRef(false);
  const saveChain = useRef(Promise.resolve(true));
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

  async function importItems(items, insertAt = null) {
    let at = insertAt;
    for (const item of items) {
      const { url, name, file } = item;
      // Mesmo vídeo da nuvem já está no projeto: só reaproveita (não duplica a cópia)
      const existing = !file && libRef.current.find((l) => !l.file && l.url === url);
      if (existing) {
        addToTimeline(existing, at);
        if (at !== null) at += 1;
        continue;
      }
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.src = url;
      // eslint-disable-next-line no-await-in-loop
      const duration = await new Promise((resolve) => { v.onloadedmetadata = () => resolve(v.duration || 0); v.onerror = () => resolve(0); });
      if (!duration) continue;
      const id = newId();
      const entry = { id, name, url, file: file || null, duration, thumbs: [], step: duration };
      libRef.current = [...libRef.current, entry];
      setLibrary((prev) => [...prev, entry]);
      addToTimeline(entry, at);
      if (at !== null) at += 1;
      makeThumbs(url, duration)
        .then(({ thumbs, step }) => setLibrary((prev) => prev.map((l) => (l.id === id ? { ...l, thumbs, step } : l))))
        .catch((err) => {
          console.error('[Editor] miniaturas:', err);
          setLibrary((prev) => prev.map((l) => (l.id === id ? { ...l, noThumbs: true } : l)));
        });
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
    if (!project && initialClips.length) importItems(initialClips);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------- salvar projeto (rascunho) --------
  // Guarda a linha do tempo no Firestore. Vídeos do computador sobem junto (uma vez só),
  // para o projeto poder ser reaberto depois em qualquer lugar.
  const doSave = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return true;
    if (!clipsRef.current.length && !projectIdRef.current) return true;
    setSaveState('saving');
    try {
      const media = [];
      for (const l of libRef.current) {
        let url = l.remoteUrl || (l.file ? null : l.url);
        let path = l.storagePath;
        if (!url) {
          const r = storageRef(storage, `creator_videos/${uid}/project/${Date.now()}_${l.name}`);
          // eslint-disable-next-line no-await-in-loop
          await uploadBytes(r, l.file);
          // eslint-disable-next-line no-await-in-loop
          url = await getDownloadURL(r);
          path = r.fullPath;
          libRef.current = libRef.current.map((x) => (x.id === l.id ? { ...x, remoteUrl: url, storagePath: path } : x));
          setLibrary(libRef.current);
        }
        media.push({ id: l.id, name: l.name, url, duration: l.duration, storagePath: path });
      }
      const first = clipsRef.current[0];
      const thumb = libRef.current.find((l) => l.id === first?.srcId)?.thumbs?.[0];
      const data = JSON.parse(JSON.stringify({
        userId: uid,
        name: nameRef.current.trim() || 'Projeto sem título',
        ratio: ratioRef.current.id,
        clips: clipsRef.current.map((c) => ({ id: c.id, srcId: c.srcId, in: c.in, out: c.out, filter: c.filter })),
        media,
        duration: totalRef.current,
        thumb: thumb && thumb.length < 100000 ? thumb : null,
        updatedAt: new Date().toISOString(),
      }));
      if (projectIdRef.current) {
        await setDoc(doc(db, 'editor_projects', projectIdRef.current), data, { merge: true });
      } else {
        const created = await addDoc(collection(db, 'editor_projects'), { ...data, createdAt: data.updatedAt });
        projectIdRef.current = created.id;
        setProjectId(created.id);
      }
      dirtyRef.current = false;
      setSaveState('saved');
      return true;
    } catch (err) {
      console.error('[Editor] erro ao salvar projeto:', err);
      setSaveState('error');
      return false;
    }
  };
  const saveProject = () => {
    saveChain.current = saveChain.current.then(doSave, doSave);
    return saveChain.current;
  };

  // Salva sozinho 2 s depois de qualquer mudança
  const firstRunRef = useRef(true);
  useEffect(() => {
    if (firstRunRef.current) { firstRunRef.current = false; return undefined; }
    dirtyRef.current = true;
    const t = setTimeout(saveProject, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips, name, ratio, library.length]);

  // Projeto reaberto: refaz as miniaturas
  useEffect(() => {
    libraryFromProject(project).forEach((l) => {
      if (!l.duration) return;
      makeThumbs(l.url, l.duration)
        .then(({ thumbs, step }) => setLibrary((prev) => prev.map((x) => (x.id === l.id ? { ...x, thumbs, step } : x))))
        .catch((err) => {
          console.error('[Editor] miniaturas:', err);
          setLibrary((prev) => prev.map((x) => (x.id === l.id ? { ...x, noThumbs: true } : x)));
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = async () => {
    if (dirtyRef.current && auth.currentUser) {
      setClosing(true);
      const ok = await saveProject();
      setClosing(false);
      if (!ok && !window.confirm('Não foi possível salvar o projeto. Sair mesmo assim?')) return;
    }
    onClose?.();
  };

  // -------- exportar --------
  const handleExport = async () => {
    if (!clips.length || exporting) return;
    if (dirtyRef.current) saveProject();
    setPlaying(false);
    setExportError('');
    setExportPct(0);
    setExporting(true);
    cancelRef.current = { cancelled: false };
    try {
      const payload = layout.map((c) => {
        const src = srcOf(c.srcId);
        return { file: src.file || undefined, url: src.url, in: c.in, out: c.out, filter: filterCss(c.filter) };
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

  const lastAddRef = useRef({ srcId: null, at: 0 });
  function addToTimeline(entry, index = null) {
    // Segurança: o mesmo vídeo não entra duas vezes no mesmo instante (clique + soltar)
    const nowMs = Date.now();
    if (lastAddRef.current.srcId === entry.id && nowMs - lastAddRef.current.at < 900) return;
    lastAddRef.current = { srcId: entry.id, at: nowMs };
    const next = clipsRef.current.slice();
    const clip = { id: newId(), srcId: entry.id, in: 0, out: entry.duration };
    if (index === null || index > next.length) next.push(clip);
    else next.splice(index, 0, clip);
    clipsRef.current = next;
    commit(next);
  }

  // -------- arrastar da biblioteca (ou do computador) para a linha do tempo --------
  const [dropAt, setDropAt] = useState(null); // posição (s) do indicador verde
  const insertIndexAt = (t) => {
    let idx = 0;
    layoutRef.current.forEach((c, i) => { if (t > c.start + c.len / 2) idx = i + 1; });
    return idx;
  };
  const timeFromEvent = (e) => {
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, (e.clientX - rect.left + trackRef.current.scrollLeft) / pps);
  };
  const onTrackDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const t = timeFromEvent(e);
    const idx = insertIndexAt(t);
    const lay = layoutRef.current;
    setDropAt(idx >= lay.length ? totalRef.current : lay[idx].start);
  };
  const onTrackDrop = async (e) => {
    e.preventDefault();
    setDropAt(null);
    const index = insertIndexAt(timeFromEvent(e));
    const raw = e.dataTransfer.getData('application/x-uou-video');
    if (raw) {
      const data = JSON.parse(raw);
      if (data.kind === 'cloud') {
        const v = cloudRef.current.find((c) => c.id === data.id);
        if (v) await importItems([{ name: v.originalName || 'Vídeo', url: v.url }], index);
      } else if (data.kind === 'lib') {
        const entry = libRef.current.find((l) => l.id === data.id);
        if (entry) addToTimeline(entry, index);
      }
      return;
    }
    const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('video'));
    if (files.length) await importItems(files.map((file) => ({ name: file.name, url: URL.createObjectURL(file), file })), index);
  };
  const startDrag = (e, payload) => {
    e.dataTransfer.setData('application/x-uou-video', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
  };

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

  // Sem permissão (CORS) para ler os quadros: mostra o quadro de cada trecho direto do vídeo
  const fallbackCells = (c, src) => {
    const w = c.len * pps;
    const n = Math.max(1, Math.min(24, Math.ceil(w / 80)));
    const cw = w / n;
    return Array.from({ length: n }, (_, i) => (
      <video
        key={i}
        src={`${src.url}#t=${(c.in + ((i + 0.5) * cw) / pps).toFixed(2)}`}
        preload="metadata"
        muted
        style={{ position: 'absolute', top: 0, left: i * cw, width: cw, height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
      />
    ));
  };

  // -------- filtros --------
  const selectedClip = clips.find((c) => c.id === selected) || null;
  const activeClip = layout.find((c) => time >= c.start && time < c.start + c.len) || layout[layout.length - 1] || null;
  useEffect(() => {
    if (videoRef.current) videoRef.current.style.filter = filterCss(activeClip?.filter);
  }, [activeClip]);
  const applyFilter = (id) => {
    if (!selectedClip) return;
    const f = id === 'none' ? undefined : { id, amount: selectedClip.filter?.amount ?? 1 };
    commit(clips.map((c) => (c.id === selectedClip.id ? { ...c, filter: f } : c)));
  };
  const applyFilterToAll = () => {
    if (!selectedClip) return;
    commit(clips.map((c) => ({ ...c, filter: selectedClip.filter })));
  };
  const startAmountDrag = () => { setPast((p) => [...p.slice(-49), clipsRef.current]); setFuture([]); };
  const setAmount = (amount) => {
    if (!selectedClip?.filter) return;
    setClips(clipsRef.current.map((c) => (c.id === selectedClip.id ? { ...c, filter: { ...c.filter, amount } } : c)));
  };

  // -------- edição --------
  const splitAtPlayhead = () => {
    const t = timeRef.current;
    const idx = layout.findIndex((c) => t > c.start + MIN_CLIP && t < c.start + c.len - MIN_CLIP);
    if (idx === -1) return;
    const c = layout[idx];
    const cut = c.in + (t - c.start);
    const a = { id: newId(), srcId: c.srcId, in: c.in, out: cut, filter: c.filter };
    const b = { id: newId(), srcId: c.srcId, in: cut, out: c.out, filter: c.filter };
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
          <button type="button" style={s.iconBtn} onClick={handleClose} aria-label="Fechar"><X size={18} /></button>
          <Film size={18} color={GREEN} />
          <input
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => { e.target.select(); e.target.style.borderColor = GREEN; }}
            onBlur={(e) => { e.target.style.borderColor = 'transparent'; if (!name.trim()) setName('Projeto sem título'); }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); }}
            style={s.nameInput}
            aria-label="Nome do projeto"
          />
          <span style={s.betaTag}>beta</span>
          {saveState !== 'idle' && (
            <span style={{ ...s.saveText, color: saveState === 'error' ? '#ff6b6b' : '#666' }}>
              {saveState === 'saving' ? 'Salvando...' : saveState === 'saved' ? 'Projeto salvo' : 'Erro ao salvar'}
            </span>
          )}
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
        {/* Painel esquerdo: parte de cima = vídeos do projeto; parte de baixo = biblioteca */}
        <aside style={s.sidePanel}>
          <div style={s.sideTop}>
            <PanelHead title="Projeto" inset />
            <div style={s.libList}>
              {library.length === 0 && (
                <p style={s.hint}>Os vídeos usados nesta edição aparecem aqui. Arraste um vídeo da biblioteca para a linha do tempo.</p>
              )}
              {library.map((l) => (
                <div
                  key={l.id}
                  draggable
                  onDragStart={(e) => startDrag(e, { kind: 'lib', id: l.id })}
                  style={s.libItem}
                  onClick={() => addToTimeline(l)}
                  title="Clique para adicionar de novo, ou arraste para a linha do tempo"
                >
                  <div style={{ ...s.libThumb, backgroundImage: l.thumbs[0] ? `url(${l.thumbs[0]})` : 'none' }}>
                    {l.noThumbs && !l.thumbs[0] && <video src={`${l.url}#t=0.5`} preload="metadata" muted style={s.libThumbVideo} />}
                    <span style={s.libDur}>{fmt(l.duration).slice(0, -2)}</span>
                  </div>
                  <span style={s.libName}>{l.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={s.sideBottom}>
            <PanelHead title="Biblioteca" inset />
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

            {mediaTab === 'computador' ? (
              <button type="button" style={s.importBtn} onClick={() => fileRef.current?.click()}>
                <Plus size={18} /> Importar vídeos
              </button>
            ) : (
              <div style={s.libList}>
                {cloud.filter((v) => v.status === (mediaTab === 'brutos' ? 'raw' : 'ready')).length === 0 && (
                  <p style={s.hint}>
                    {mediaTab === 'brutos'
                      ? 'Nenhum vídeo bruto salvo ainda. Suas gravações do app aparecem aqui.'
                      : 'Nenhum vídeo pronto ainda. Exporte um vídeo e ele aparece aqui.'}
                  </p>
                )}
                {cloud.filter((v) => v.status === (mediaTab === 'brutos' ? 'raw' : 'ready')).map((v) => (
                  <div
                    key={v.id}
                    draggable
                    onDragStart={(e) => startDrag(e, { kind: 'cloud', id: v.id })}
                    style={s.libItem}
                    onClick={() => addCloud(v)}
                    title="Clique ou arraste para a linha do tempo"
                  >
                    <video src={`${v.url}#t=0.5`} preload="metadata" muted style={s.libThumbVideo} />
                    <span style={s.libName}>{v.originalName || 'Vídeo'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Prévia */}
        <section style={s.center}>
          <PanelHead title="Programa" />
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
          <PanelHead title="Ferramentas" inset />
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
          {tool === 'filtros' && (
            <div style={s.toolInfo}>
              <b>Filtros</b>
              {!selectedClip ? (
                <p style={{ ...s.hint, marginTop: 6 }}>Clique em um clipe na linha do tempo para aplicar um filtro.</p>
              ) : (
                <>
                  <div style={s.filterGrid}>
                    {FILTERS.map((f) => {
                      const on = (selectedClip.filter?.id || 'none') === f.id;
                      const thumb = srcOf(selectedClip.srcId)?.thumbs?.[0];
                      return (
                        <button key={f.id} type="button" style={s.filterBtn(on)} onClick={() => applyFilter(f.id)}>
                          <span style={{ ...s.filterThumb, backgroundImage: thumb ? `url(${thumb})` : 'none', filter: filterCss({ id: f.id, amount: 1 }) }} />
                          <span style={s.filterName}>{f.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedClip.filter && (
                    <label style={s.amountRow}>
                      <span style={s.hint}>Intensidade</span>
                      <input
                        type="range" min="0" max="1" step="0.01" style={{ flex: 1, minWidth: 0, width: '100%', accentColor: GREEN }}
                        value={selectedClip.filter.amount ?? 1}
                        onPointerDown={startAmountDrag}
                        onChange={(e) => setAmount(Number(e.target.value))}
                      />
                    </label>
                  )}
                  <button type="button" style={s.applyAll} onClick={applyFilterToAll}>Aplicar em todos os clipes</button>
                </>
              )}
            </div>
          )}
          {tool && tool !== 'filtros' && (
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
        <PanelHead title="Linha do tempo" />
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

        <div ref={trackRef} style={s.trackScroll} onDragOver={onTrackDragOver} onDragLeave={() => setDropAt(null)} onDrop={onTrackDrop}>
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
                      {src?.noThumbs && !src.thumbs.length && fallbackCells(c, src)}
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

            {dropAt !== null && <div style={{ ...s.dropLine, left: dropAt * pps }} />}

            {/* Agulha */}
            <div style={{ ...s.playhead, left: time * pps }}>
              <span style={s.playheadTop} />
            </div>
          </div>
        </div>
      </div>

      {closing && (
        <div style={s.overlay}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Salvando seu projeto...</p>
          <p style={s.hint}>Vídeos do computador estão sendo enviados. Não feche esta janela.</p>
        </div>
      )}

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
    backgroundColor: '#010208', color: '#f0f0f0',
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
  },
  topBar: {
    height: 54, flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
    padding: '0 16px',
  },
  topLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  iconBtn: {
    width: 34, height: 34, borderRadius: '50%', border: '1px solid #23242c', backgroundColor: '#111218',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  nameInput: {
    width: 210, fontSize: 14, fontWeight: 600, color: '#fff', backgroundColor: 'transparent', border: '1px solid transparent',
    borderRadius: 6, padding: '4px 8px', outline: 'none', fontFamily: 'inherit',
  },
  saveText: { fontSize: 11, marginLeft: 4 },
  betaTag: {
    fontSize: 10, fontWeight: 700, color: GREEN, border: `1px solid ${GREEN}`, borderRadius: 999, padding: '2px 8px',
  },
  ratioGroup: { display: 'flex', gap: 4, padding: 3, backgroundColor: '#111218', borderRadius: 10, border: '1px solid #1c1d25' },
  ratioBtn: (a) => ({
    border: a ? `1px solid ${GREEN}` : '1px solid transparent', borderRadius: 7, padding: '5px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
    backgroundColor: a ? 'rgba(82, 250, 53, 0.1)' : 'transparent', color: a ? GREEN : '#999', fontFamily: 'inherit',
  }),
  exportBtn: {
    justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 8, border: 'none', borderRadius: 10,
    padding: '9px 16px', backgroundColor: '#1a1b22', color: '#666', fontSize: 13, fontWeight: 700,
    cursor: 'not-allowed', fontFamily: 'inherit',
  },
  exportBtnOn: { backgroundColor: 'rgba(82, 250, 53, 0.1)', color: GREEN, border: `1px solid ${GREEN}`, padding: '8px 15px', cursor: 'pointer' },
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
  main: { flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '240px minmax(0, 1fr) 240px', gridTemplateRows: 'minmax(0, 1fr)', gap: 4, padding: '0 4px' },
  panel: { minHeight: 0, padding: 14, backgroundColor: '#1b1b1d', borderRadius: 3, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 },
  panelHead: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', height: 34, flexShrink: 0,
    borderBottom: '1px solid #2a2a2d',
  },
  panelHeadTab: { color: '#e6e6e6', fontSize: 12, fontWeight: 600, height: 34, lineHeight: '34px', borderBottom: '2px solid #e6e6e6', boxSizing: 'border-box' },
  panelHeadMenu: { color: '#777', fontSize: 15 },
  panelTitle: { margin: '0 0 2px 0', fontSize: 12, fontWeight: 700, color: '#8a8b95', letterSpacing: 0.4, textTransform: 'uppercase' },
  importBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', borderRadius: 12,
    border: '1px dashed #3a3a3d', backgroundColor: '#222224', color: '#fff', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  mediaTabs: { display: 'flex', gap: 4, padding: 3, backgroundColor: '#222224', borderRadius: 10, border: '1px solid #2a2a2d' },
  mediaTab: (a) => ({
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, border: 'none', borderRadius: 7,
    padding: '7px 0', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    backgroundColor: a ? 'rgba(82,250,53,0.14)' : 'transparent', color: a ? GREEN : '#8a8b95',
  }),
  libThumbVideo: { width: 64, height: 42, borderRadius: 7, backgroundColor: '#1a1b22', objectFit: 'cover', flexShrink: 0 },
  sidePanel: { minHeight: 0, display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden' },
  sideTop: { flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, backgroundColor: '#1b1b1d', borderRadius: 3 },
  sideBottom: {
    flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
    backgroundColor: '#1b1b1d', borderRadius: 3,
  },
  dropLine: { position: 'absolute', top: 26, bottom: 0, width: 3, marginLeft: -1, backgroundColor: GREEN, zIndex: 6, pointerEvents: 'none' },
  libList: { display: 'flex', flexDirection: 'column', gap: 8 },
  libItem: {
    display: 'flex', alignItems: 'center', gap: 10, padding: 6, borderRadius: 8, border: '1px solid #2a2a2d',
    backgroundColor: '#222224', cursor: 'pointer', textAlign: 'left', color: 'inherit', fontFamily: 'inherit',
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
  center: { display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden', backgroundColor: '#1b1b1d', borderRadius: 3 },
  stage: { flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflow: 'hidden' },
  screen: {
    position: 'relative', backgroundColor: '#000', borderRadius: 10, overflow: 'hidden', maxHeight: '100%',
    boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
  },
  video: { width: '100%', height: '100%', objectFit: 'contain', display: 'block', backgroundColor: '#000' },
  emptyScreen: {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 8,
  },
  transport: { height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, borderTop: '1px solid #2a2a2d' },
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
    border: a ? `1px solid ${GREEN}` : '1px solid #2a2a2d', backgroundColor: a ? 'rgba(82,250,53,0.08)' : '#222224',
    cursor: 'pointer', fontFamily: 'inherit',
  }),
  toolLabel: { fontSize: 11, color: '#ccc', fontWeight: 600 },
  filterGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 10 },
  filterBtn: (a) => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 4, borderRadius: 8, cursor: 'pointer',
    border: a ? `1px solid ${GREEN}` : '1px solid #2a2a2d', backgroundColor: a ? 'rgba(82,250,53,0.08)' : 'transparent', fontFamily: 'inherit',
  }),
  filterThumb: { width: '100%', aspectRatio: '1 / 1', borderRadius: 6, backgroundColor: '#222', backgroundSize: 'cover', backgroundPosition: 'center' },
  filterName: { fontSize: 10, color: '#ccc', fontWeight: 600 },
  amountRow: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 },
  applyAll: {
    marginTop: 12, width: '100%', padding: '8px 0', borderRadius: 8, border: '1px solid #2a2b35', backgroundColor: '#15161c',
    color: '#ddd', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
  toolInfo: { padding: 12, borderRadius: 10, backgroundColor: '#222224', border: '1px solid #2a2a2d', fontSize: 13 },
  shortcuts: { marginTop: 'auto', paddingTop: 12, borderTop: '1px solid #2a2a2d' },
  sc: { color: '#8a8b95', fontSize: 11.5, margin: '5px 0' },
  kbd: {
    backgroundColor: '#1a1b22', border: '1px solid #2a2b35', borderRadius: 5, padding: '1px 6px', fontSize: 10.5,
    color: '#ddd', marginRight: 6, fontFamily: 'inherit',
  },
  timeline: { height: 262, flexShrink: 0, display: 'flex', flexDirection: 'column', backgroundColor: '#1b1b1d', borderRadius: 3, margin: 4 },
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
  ruler: { position: 'relative', height: 26, borderBottom: '1px solid #2a2a2d', cursor: 'col-resize' },
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
