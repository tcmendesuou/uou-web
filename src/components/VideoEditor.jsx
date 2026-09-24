import React, { useEffect, useRef, useState } from 'react';
import { fetchFile } from '@ffmpeg/util';
import { getFFmpeg } from '../lib/ffmpeg';
import { X, Plus, Trash2, Scissors, Film } from 'lucide-react';

// ✅ Editor de vídeo v1 — corta/apara cada clipe e junta em sequência.
// Roda 100% no navegador via ffmpeg.wasm. Quando o UOU Web virar app
// desktop (Electron), esse mesmo componente pode trocar só o "motor"
// (chamar o ffmpeg nativo em vez do wasm) e manter a mesma interface.
//
// initialClips: [{ name, url, file? }] — `file` presente = arquivo local
// ainda não subiu pra nuvem; ausente = veio de uma URL do Storage (bruto
// já salvo). Em ambos os casos usamos `url` pra pré-visualizar e pegar a
// duração.
export default function VideoEditor({ initialClips, onClose, onExported }) {
  const [clips, setClips] = useState([]);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState('');
  const nextId = useRef(0);

  // Carrega o ffmpeg em segundo plano assim que o editor abre
  useEffect(() => {
    let cancelled = false;
    setProgressText('Carregando o editor...');
    getFFmpeg((msg) => {
      // ffmpeg manda muita coisa no log; só usamos pra debug no console
      console.debug('[ffmpeg]', msg);
    })
      .then(() => {
        if (!cancelled) {
          setFfmpegReady(true);
          setProgressText('');
        }
      })
      .catch((err) => {
        console.error('[VideoEditor] Erro ao carregar ffmpeg:', err);
        if (!cancelled) setError('Não foi possível carregar o editor. Verifique sua conexão e tente de novo.');
      });
    return () => { cancelled = true; };
  }, []);

  // Monta os clipes iniciais, lendo a duração de cada um
  useEffect(() => {
    (initialClips || []).forEach((clip) => addClip(clip));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addClip = (clip) => {
    const id = nextId.current++;
    const tempVideo = document.createElement('video');
    tempVideo.src = clip.url;
    tempVideo.onloadedmetadata = () => {
      const duration = tempVideo.duration || 0;
      setClips((prev) => [
        ...prev,
        {
          id,
          name: clip.name,
          url: clip.url,
          file: clip.file || null,
          duration,
          start: 0,
          end: duration,
        },
      ]);
    };
  };

  const handleAddMoreFiles = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      addClip({ name: file.name, url: URL.createObjectURL(file), file });
    });
    e.target.value = '';
  };

  const removeClip = (id) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
  };

  const updateClipRange = (id, field, value) => {
    setClips((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const num = Math.max(0, Math.min(Number(value), c.duration));
        if (field === 'start') return { ...c, start: Math.min(num, c.end) };
        return { ...c, end: Math.max(num, c.start) };
      })
    );
  };

  const formatTime = (secs) => {
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

    try {
      const ffmpeg = await getFFmpeg();
      const trimmedFiles = [];

      // 1. Escreve e corta cada clipe
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

      // 2. Junta os clipes em sequência (se tiver mais de um)
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
            <p style={styles.loadingText}>{progressText || 'Carregando...'}</p>
          </div>
        )}

        {error && <p style={styles.errorText}>{error}</p>}

        {ffmpegReady && (
          <>
            <div style={styles.clipsList}>
              {clips.length === 0 && (
                <p style={styles.emptyText}>Nenhum clipe ainda. Adicione um vídeo pra começar.</p>
              )}
              {clips.map((clip, index) => (
                <div key={clip.id} style={styles.clipRow}>
                  <video src={clip.url} style={styles.clipPreview} muted />
                  <div style={styles.clipInfo}>
                    <p style={styles.clipName}>
                      {index + 1}. {clip.name}
                    </p>
                    <p style={styles.clipDuration}>Duração total: {formatTime(clip.duration)}</p>

                    <div style={styles.trimRow}>
                      <label style={styles.trimLabel}>
                        Início
                        <input
                          type="number"
                          min={0}
                          max={clip.duration}
                          step={0.1}
                          value={clip.start.toFixed(1)}
                          onChange={(e) => updateClipRange(clip.id, 'start', e.target.value)}
                          style={styles.trimInput}
                        />
                      </label>
                      <label style={styles.trimLabel}>
                        Fim
                        <input
                          type="number"
                          min={0}
                          max={clip.duration}
                          step={0.1}
                          value={clip.end.toFixed(1)}
                          onChange={(e) => updateClipRange(clip.id, 'end', e.target.value)}
                          style={styles.trimInput}
                        />
                      </label>
                      <span style={styles.trimResult}>
                        → {formatTime(Math.max(0, clip.end - clip.start))} no post final
                      </span>
                    </div>
                  </div>
                  <button style={styles.removeClipBtn} onClick={() => removeClip(clip.id)} aria-label="Remover clipe">
                    <Trash2 size={16} color="#ff4444" />
                  </button>
                </div>
              ))}
            </div>

            <label style={styles.addClipBtn}>
              <Plus size={18} color="#f0f0f0" />
              <span>Adicionar mais um clipe</span>
              <input type="file" accept="video/*" multiple onChange={handleAddMoreFiles} style={styles.hiddenInput} />
            </label>

            <p style={styles.hintText}>
              O corte usa os pontos-chave do vídeo, então o início/fim pode variar em
              alguns décimos de segundo — dá pra ajustar fino depois, quando o editor
              virar nativo no app desktop.
            </p>

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
    width: 560,
    maxWidth: '92vw',
    maxHeight: '88vh',
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
    marginBottom: 18,
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
    display: 'flex',
    gap: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 10,
    alignItems: 'flex-start',
  },
  clipPreview: {
    width: 72,
    height: 96,
    objectFit: 'cover',
    borderRadius: 8,
    backgroundColor: '#000',
    flexShrink: 0,
  },
  clipInfo: {
    flex: 1,
    minWidth: 0,
  },
  clipName: {
    color: '#f0f0f0',
    fontSize: 13,
    fontWeight: 600,
    margin: '0 0 2px 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  clipDuration: {
    color: '#888',
    fontSize: 11,
    margin: '0 0 8px 0',
  },
  trimRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  trimLabel: {
    display: 'flex',
    flexDirection: 'column',
    fontSize: 10,
    color: '#999',
    gap: 3,
  },
  trimInput: {
    width: 64,
    backgroundColor: '#0d0d0d',
    border: '1px solid #2a2a2a',
    borderRadius: 6,
    padding: '5px 6px',
    color: '#f0f0f0',
    fontSize: 12,
  },
  trimResult: {
    color: '#52fa35',
    fontSize: 11,
    fontWeight: 600,
  },
  removeClipBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    flexShrink: 0,
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
    marginBottom: 12,
  },
  hiddenInput: {
    position: 'absolute',
    inset: 0,
    opacity: 0,
    cursor: 'pointer',
  },
  hintText: {
    color: '#666',
    fontSize: 11,
    lineHeight: 1.6,
    marginBottom: 18,
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
