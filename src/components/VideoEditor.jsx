import React, { useEffect, useRef, useState } from 'react';
import { fetchFile } from '@ffmpeg/util';
import { getFFmpeg } from '../lib/ffmpeg';
import { generateThumbnails } from '../lib/videoThumbnails';
import ClipTimeline from './ClipTimeline';
import {
  X, Plus, Trash2, Scissors, Film, Play, Pause, ChevronUp, ChevronDown, ListVideo,
} from 'lucide-react';

// ✅ Editor de vídeo v2 — timeline visual estilo CapCut/TikTok: arrasta as
// alças verdes pra cortar, clica na faixa pra pular o preview pra ali, e dá
// pra tocar a sequência inteira dos clipes já juntos. O motor por trás
// continua o ffmpeg.wasm (mesmo de antes) — só a interface mudou.
export default function VideoEditor({ initialClips, onClose, onExported }) {
  const [clips, setClips] = useState([]);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState('');

  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sequenceMode, setSequenceMode] = useState(false);
  const [playhead, setPlayhead] = useState(0);

  const nextId = useRef(0);
  const videoRef = useRef(null);
  const loadedUrlRef = useRef(null);
  const isPlayingRef = useRef(false);
  const sequenceModeRef = useRef(false);
  const clipsRef = useRef([]);
  clipsRef.current = clips;
  isPlayingRef.current = isPlaying;
  sequenceModeRef.current = sequenceMode;

  // Carrega o ffmpeg em segundo plano assim que o editor abre
  useEffect(() => {
    let cancelled = false;
    getFFmpeg().then(() => { if (!cancelled) setFfmpegReady(true); }).catch((err) => {
      console.error('[VideoEditor] Erro ao carregar ffmpeg:', err);
      if (!cancelled) setError('Não foi possível carregar o editor. Verifique sua conexão e tente de novo.');
    });
    return () => { cancelled = true; };
  }, []);

  // Monta os clipes iniciais
  useEffect(() => {
    (initialClips || []).forEach((clip) => addClip(clip));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addClip = (clip) => {
    const id = nextId.current++;
    const tempVideo = document.createElement('video');
    tempVideo.src = clip.url;
    tempVideo.onloadedmetadata = async () => {
      const duration = tempVideo.duration || 0;
      const newClip = {
        id, name: clip.name, url: clip.url, file: clip.file || null,
        duration, start: 0, end: duration, thumbnails: [],
      };
      setClips((prev) => [...prev, newClip]);

      const thumbs = await generateThumbnails(clip.url, duration, 10);
      setClips((prev) => prev.map((c) => (c.id === id ? { ...c, thumbnails: thumbs } : c)));
    };
  };

  const handleAddMoreFiles = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => addClip({ name: file.name, url: URL.createObjectURL(file), file }));
    e.target.value = '';
  };

  const removeClip = (id) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
  };

  const moveClip = (index, direction) => {
    setClips((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const updateClipRange = (id, start, end) => {
    setClips((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        return {
          ...c,
          start: start !== undefined ? start : c.start,
          end: end !== undefined ? end : c.end,
        };
      })
    );
  };

  // ✅ Carrega o clipe ativo no player compartilhado sempre que o índice muda
  useEffect(() => {
    const clip = clips[activeIndex];
    const video = videoRef.current;
    if (!clip || !video) return;

    const seekAndMaybePlay = () => {
      video.currentTime = clip.start;
      setPlayhead(clip.start);
      if (isPlayingRef.current) video.play().catch(() => {});
    };

    if (loadedUrlRef.current !== clip.url) {
      loadedUrlRef.current = clip.url;
      video.src = clip.url;
      video.addEventListener('loadedmetadata', seekAndMaybePlay, { once: true });
    } else {
      seekAndMaybePlay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, clips.length]);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    const clip = clipsRef.current[activeIndex];
    if (!video || !clip) return;
    setPlayhead(video.currentTime);

    if (video.currentTime >= clip.end) {
      if (sequenceModeRef.current && activeIndex < clipsRef.current.length - 1) {
        setActiveIndex((i) => i + 1);
      } else if (sequenceModeRef.current) {
        video.pause();
        setIsPlaying(false);
        setSequenceMode(false);
      } else {
        // loop dentro do corte atual (preview do clipe sozinho)
        video.currentTime = clip.start;
      }
    }
  };

  const togglePlayClip = () => {
    const video = videoRef.current;
    if (!video) return;
    setSequenceMode(false);
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      const clip = clips[activeIndex];
      if (clip && video.currentTime >= clip.end) video.currentTime = clip.start;
      video.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const playSequence = () => {
    if (clips.length === 0) return;
    setSequenceMode(true);
    setIsPlaying(true);
    if (activeIndex !== 0) {
      setActiveIndex(0);
    } else {
      const video = videoRef.current;
      if (video) {
        video.currentTime = clips[0].start;
        video.play().catch(() => {});
      }
    }
  };

  const selectClip = (index) => {
    const video = videoRef.current;
    if (video) video.pause();
    setIsPlaying(false);
    setSequenceMode(false);
    setActiveIndex(index);
  };

  const handleSeekOnClip = (index, time) => {
    setSequenceMode(false);
    setIsPlaying(false);
    const video = videoRef.current;
    if (index === activeIndex && video) {
      video.pause();
      video.currentTime = time;
      setPlayhead(time);
    } else {
      setActiveIndex(index);
      // o efeito de troca de clipe já ajusta o currentTime pro início;
      // aplicamos o tempo exato depois que o vídeo carregar
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.currentTime = time;
          setPlayhead(time);
        }
      }, 50);
    }
  };

  const formatTime = (secs) => {
    if (!isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleExport = async () => {
    if (clips.length === 0) {
      setError('Adicione pelo menos um clipe.');
      return;
    }
    setError('');
    setExporting(true);
    videoRef.current?.pause();
    setIsPlaying(false);

    try {
      const ffmpeg = await getFFmpeg();
      const trimmedFiles = [];

      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        setProgressText(`Processando clipe ${i + 1} de ${clips.length}...`);

        const inputName = `input_${i}.mp4`;
        const outputName = `trimmed_${i}.mp4`;
        const data = await fetchFile(clip.file || clip.url);
        await ffmpeg.writeFile(inputName, data);

        await ffmpeg.exec([
          '-i', inputName,
          '-ss', String(clip.start),
          '-to', String(clip.end),
          '-c', 'copy',
          outputName,
        ]);

        trimmedFiles.push(outputName);
      }

      let finalFile = trimmedFiles[0];

      if (trimmedFiles.length > 1) {
        setProgressText('Juntando os clipes...');
        const listContent = trimmedFiles.map((f) => `file '${f}'`).join('\n');
        await ffmpeg.writeFile('list.txt', listContent);
        await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'output.mp4']);
        finalFile = 'output.mp4';
      }

      setProgressText('Finalizando...');
      const outputData = await ffmpeg.readFile(finalFile);
      const blob = new Blob([outputData.buffer], { type: 'video/mp4' });

      onExported(blob);
    } catch (err) {
      console.error('[VideoEditor] Erro ao exportar:', err);
      setError('Não foi possível exportar o vídeo. Tente com clipes menores ou verifique o formato.');
    } finally {
      setExporting(false);
      setProgressText('');
    }
  };

  const activeClip = clips[activeIndex];

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <div style={styles.headerTitleRow}>
            <Scissors size={20} color="#52fa35" />
            <h2 style={styles.title}>Editor de Vídeo</h2>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Fechar editor">
            <X size={22} color="#fff" />
          </button>
        </div>

        {!ffmpegReady && !error && (
          <div style={styles.loadingBox}>
            <div style={styles.spinner} />
            <p style={styles.loadingText}>Carregando o editor...</p>
          </div>
        )}

        {error && <p style={styles.errorText}>{error}</p>}

        {ffmpegReady && (
          <>
            {/* Preview compartilhado */}
            <div style={styles.previewWrap}>
              <video
                ref={videoRef}
                style={styles.previewVideo}
                onTimeUpdate={handleTimeUpdate}
                playsInline
              />
              {!activeClip && <div style={styles.previewEmpty}>Adicione um vídeo pra começar</div>}
            </div>

            {activeClip && (
              <div style={styles.transportRow}>
                <button style={styles.transportBtn} onClick={togglePlayClip} aria-label={isPlaying ? 'Pausar' : 'Tocar'}>
                  {isPlaying && !sequenceMode ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <span style={styles.transportTime}>
                  {formatTime(playhead)} / clipe {activeIndex + 1} de {clips.length}
                </span>
                <button style={styles.sequenceBtn} onClick={playSequence}>
                  <ListVideo size={15} /> {sequenceMode && isPlaying ? 'Tocando sequência...' : 'Tocar sequência completa'}
                </button>
              </div>
            )}

            {/* Lista de clipes com timeline visual */}
            <div style={styles.clipsList}>
              {clips.length === 0 && (
                <p style={styles.emptyText}>Nenhum clipe ainda. Adicione um vídeo pra começar.</p>
              )}
              {clips.map((clip, index) => (
                <div
                  key={clip.id}
                  style={{ ...styles.clipRow, ...(index === activeIndex ? styles.clipRowActive : {}) }}
                  onClick={() => selectClip(index)}
                >
                  <div style={styles.clipHeader}>
                    <span style={styles.clipName}>
                      {index + 1}. {clip.name}
                    </span>
                    <span style={styles.clipDuration}>
                      {formatTime(clip.end - clip.start)} selecionado (de {formatTime(clip.duration)})
                    </span>
                  </div>

                  <ClipTimeline
                    clip={clip}
                    playheadTime={index === activeIndex ? playhead : null}
                    onChangeRange={(start, end) => updateClipRange(clip.id, start, end)}
                    onSeek={(time) => handleSeekOnClip(index, time)}
                  />

                  <div style={styles.clipActions} onClick={(e) => e.stopPropagation()}>
                    <button style={styles.smallIconBtn} onClick={() => moveClip(index, -1)} disabled={index === 0}>
                      <ChevronUp size={14} color={index === 0 ? '#444' : '#f0f0f0'} />
                    </button>
                    <button style={styles.smallIconBtn} onClick={() => moveClip(index, 1)} disabled={index === clips.length - 1}>
                      <ChevronDown size={14} color={index === clips.length - 1 ? '#444' : '#f0f0f0'} />
                    </button>
                    <button style={styles.smallIconBtn} onClick={() => removeClip(clip.id)}>
                      <Trash2 size={14} color="#ff4444" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <label style={styles.addClipBtn}>
              <Plus size={18} color="#f0f0f0" />
              <span>Adicionar mais um clipe</span>
              <input type="file" accept="video/*" multiple onChange={handleAddMoreFiles} style={styles.hiddenInput} />
            </label>

            <button
              style={styles.exportBtn(clips.length > 0 && !exporting)}
              onClick={handleExport}
              disabled={clips.length === 0 || exporting}
            >
              <Film size={18} />
              {exporting ? (progressText || 'Exportando...') : 'Exportar e salvar em Prontos'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(1,2,8,0.92)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
  },
  panel: {
    width: 640,
    maxWidth: '94vw',
    maxHeight: '90vh',
    overflowY: 'auto',
    backgroundColor: '#0d0d0d',
    border: '1px solid #1a1a1a',
    borderRadius: 16,
    padding: 24,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    color: '#f0f0f0',
    fontSize: 18,
    fontWeight: 700,
    margin: 0,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
  },
  loadingBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
    padding: '40px 0',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid #1a1a1a',
    borderTopColor: '#52fa35',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    color: '#999',
    fontSize: 13,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 13,
    marginBottom: 14,
  },
  previewWrap: {
    position: 'relative',
    width: '100%',
    maxWidth: 220,
    aspectRatio: '9 / 16',
    margin: '0 auto 12px',
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    backgroundColor: '#000',
  },
  previewEmpty: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#555',
    fontSize: 11,
    textAlign: 'center',
    padding: 10,
  },
  transportRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  transportBtn: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: 'none',
    backgroundColor: '#52fa35',
    color: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  transportTime: {
    color: '#999',
    fontSize: 12,
  },
  sequenceBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 20,
    padding: '6px 14px',
    color: '#f0f0f0',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  clipsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginBottom: 16,
  },
  emptyText: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    padding: '20px 0',
  },
  clipRow: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 10,
    border: '1px solid transparent',
    cursor: 'pointer',
  },
  clipRowActive: {
    border: '1px solid #52fa35',
  },
  clipHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
    gap: 8,
  },
  clipName: {
    color: '#f0f0f0',
    fontSize: 12,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  clipDuration: {
    color: '#52fa35',
    fontSize: 11,
    fontWeight: 600,
    flexShrink: 0,
  },
  clipActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 8,
  },
  smallIconBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
  },
  addClipBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
    border: '1px dashed #333',
    borderRadius: 10,
    padding: '12px 0',
    color: '#f0f0f0',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    position: 'relative',
    marginBottom: 16,
  },
  hiddenInput: {
    position: 'absolute',
    inset: 0,
    opacity: 0,
    cursor: 'pointer',
  },
  exportBtn: (enabled) => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: enabled ? '#52fa35' : '#1a1a1a',
    color: enabled ? '#000' : '#555',
    border: 'none',
    borderRadius: 10,
    padding: '13px 0',
    fontSize: 14,
    fontWeight: 700,
    cursor: enabled ? 'pointer' : 'default',
  }),
};

if (typeof document !== 'undefined' && !document.getElementById('uou-spin-keyframes')) {
  const styleTag = document.createElement('style');
  styleTag.id = 'uou-spin-keyframes';
  styleTag.innerHTML = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(styleTag);
}
