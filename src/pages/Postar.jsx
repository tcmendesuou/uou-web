import React, { useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, getDoc, doc, updateDoc } from 'firebase/firestore';
import { storage, db, auth } from '../firebase';
import { Images, Plus, X, Radio, Camera, Smile, MapPin, Music2, Maximize, RefreshCw } from 'lucide-react';
import LiveForm from '../components/LiveForm';

const MAX_MEDIA = 3;

export default function Postar() {
  const navigate = useNavigate();
  const location = useLocation();
  // ✅ Veio da aba Prontos (Criar): já tem o vídeo editado e salvo no
  // Storage — só falta a legenda, sem passar pelo picker/upload de novo.
  const readyVideo = location.state?.readyVideo || null;
  // ✅ Alternância Post | Live (a Live é criada aqui, no modo Criador)
  const [mode, setMode] = useState('post');

  if (readyVideo) {
    return <PostarVideoPronto video={readyVideo} onDone={() => navigate('/')} />;
  }

  return (
    <div>
      <div style={styles.modeTabs}>
        <button type="button" style={styles.modeTab(mode === 'post')} onClick={() => setMode('post')}>
          <Images size={16} /> Post
        </button>
        <button type="button" style={styles.modeTab(mode === 'live')} onClick={() => setMode('live')}>
          <Radio size={16} /> Live
        </button>
      </div>

      {mode === 'post' ? (
        <PostarNovo />
      ) : (
        <div style={styles.container}>
          <div style={styles.headerRow}>
            <h1 style={styles.pageTitle}>Nova Live</h1>
          </div>
          <LiveForm />
        </div>
      )}
    </div>
  );
}

function PostarVideoPronto({ video, onDone }) {
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  const handlePost = async () => {
    if (!caption.trim()) {
      setError('Adicione uma legenda');
      return;
    }
    setError('');
    setPosting(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};

      await addDoc(collection(db, 'posts'), {
        type: 'video',
        mediaUrl: video.url,
        mediaType: 'video',
        caption: caption.trim(),
        userId: auth.currentUser.uid,
        userName: userData?.name || 'Usuário',
        userPhoto: userData?.photoURL || null,
        likes: 0,
        commentsCount: 0,
        createdAt: new Date().toISOString(),
      });

      // Marca o vídeo na biblioteca como já postado (continua em Prontos,
      // só fica sinalizado — nada é apagado automaticamente).
      if (video.id) {
        try {
          await updateDoc(doc(db, 'creator_videos', video.id), { postedAt: new Date().toISOString() });
        } catch (e) {
          // não bloqueia o post se isso falhar
        }
      }

      onDone();
    } catch (err) {
      console.error('[Postar] Erro ao postar vídeo pronto:', err);
      setError('Não foi possível publicar o post. Tente novamente.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <h1 style={styles.pageTitle}>Postar Vídeo</h1>
        <button style={styles.postButton(!!caption.trim() && !posting)} onClick={handlePost} disabled={!caption.trim() || posting}>
          {posting ? 'Publicando...' : 'Postar'}
        </button>
      </div>

      {error && <p style={styles.errorText}>{error}</p>}

      <div style={styles.readyPreviewWrap}>
        <video src={video.url} style={styles.readyPreviewVideo} controls />
      </div>

      <div style={styles.captionWrap}>
        <textarea
          style={styles.captionInput}
          placeholder="Escreva uma legenda..."
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, 500))}
          rows={4}
        />
        <p style={styles.captionCounter}>{caption.length}/500</p>
      </div>
    </div>
  );
}

// ✅ Miniatura (capa) como no app: foto reduzida a 600px; vídeo = frame real.
// Se falhar, o post sai sem capa (igual ao app).
async function makeThumbBlob(file, type) {
  try {
    const url = URL.createObjectURL(file);
    try {
      let source; let w; let h;
      if (type === 'video') {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.src = url;
        await new Promise((resolve, reject) => {
          video.onloadeddata = resolve;
          video.onerror = reject;
        });
        video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
        await new Promise((resolve) => { video.onseeked = resolve; });
        source = video; w = video.videoWidth; h = video.videoHeight;
      } else {
        const img = new Image();
        img.src = url;
        await img.decode();
        source = img; w = img.naturalWidth; h = img.naturalHeight;
      }
      if (!w || !h) return null;
      const scale = Math.min(1, 600 / w);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.6));
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    console.error('[Criar] Não foi possível gerar a capa:', err);
    return null;
  }
}

const SUGGESTED_TAGS = ['#butter', '#bastidores', '#novo'];
const uniqueSuffix = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// Tela "Criar" igual ao app: área de mídia + folha com legenda, sugestões,
// miniaturas, ações e botão Publicar.
function PostarNovo() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [mediaList, setMediaList] = useState([]); // [{file, previewUrl, type}]
  const [active, setActive] = useState(0);
  const [caption, setCaption] = useState('');
  const [exclusive, setExclusive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState('');

  const pickFiles = () => fileInputRef.current?.click();

  const handlePickFiles = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // permite escolher o mesmo arquivo de novo depois
    if (files.length === 0) return;
    const remaining = MAX_MEDIA - mediaList.length;
    if (remaining <= 0) {
      setError(`Você pode adicionar no máximo ${MAX_MEDIA} mídias.`);
      return;
    }
    const newItems = files.slice(0, remaining).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      type: file.type.startsWith('video') ? 'video' : 'photo',
    }));
    setMediaList((prev) => [...prev, ...newItems].slice(0, MAX_MEDIA));
    setError('');
  };

  const removeMedia = (index) => {
    setMediaList((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].previewUrl);
      updated.splice(index, 1);
      return updated;
    });
    setActive(0);
  };

  const uploadOne = async (item, index, total) => {
    setUploadProgress(`Enviando mídia ${index + 1} de ${total}...`);
    const uid = auth.currentUser.uid;
    const ext = item.type === 'video' ? 'mp4' : 'jpg';
    const storageRef = ref(storage, `posts/${uid}/post_${uniqueSuffix()}.${ext}`);
    await uploadBytes(storageRef, item.file);
    const url = await getDownloadURL(storageRef);

    let thumbnailUrl = null;
    const thumbBlob = await makeThumbBlob(item.file, item.type);
    if (thumbBlob) {
      try {
        const thumbRef = ref(storage, `thumbnails/${uid}/thumb_${uniqueSuffix()}.jpg`);
        await uploadBytes(thumbRef, thumbBlob);
        thumbnailUrl = await getDownloadURL(thumbRef);
      } catch (err) {
        console.error('[Criar] Erro ao enviar a capa:', err);
      }
    }
    return { type: item.type, url, thumbnailUrl };
  };

  const handlePost = async () => {
    setError('');
    if (mediaList.length === 0) return;

    setUploading(true);
    try {
      const uploaded = [];
      for (let i = 0; i < mediaList.length; i++) {
        uploaded.push(await uploadOne(mediaList[i], i, mediaList.length));
      }
      setUploadProgress('Salvando post...');

      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};
      const base = {
        exclusive,
        caption: caption.trim(),
        userId: auth.currentUser.uid,
        userName: userData?.name || 'Usuário',
        userPhoto: userData?.photoURL || null,
        likes: 0,
        commentsCount: 0,
        createdAt: new Date().toISOString(),
      };

      // Igual ao app: 1 mídia = foto/vídeo com capa; 2 ou 3 = carrossel
      if (uploaded.length === 1) {
        const one = uploaded[0];
        await addDoc(collection(db, 'posts'), {
          type: one.type === 'video' ? 'video' : 'photo',
          mediaType: one.type,
          mediaUrl: one.url,
          thumbnailUrl: one.thumbnailUrl,
          ...base,
        });
      } else {
        await addDoc(collection(db, 'posts'), {
          type: 'carousel',
          mediaItems: uploaded,
          mediaUrl: uploaded[0].url,
          mediaType: uploaded[0].type,
          ...base,
        });
      }

      mediaList.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      navigate('/');
    } catch (err) {
      console.error('[Criar] Erro ao criar post:', err);
      setError('Não foi possível criar o post. Tente novamente.');
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const blocked = mediaList.length === 0 || uploading;
  const current = mediaList[Math.min(active, mediaList.length - 1)];

  return (
    <div style={ns.page}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={handlePickFiles}
        style={{ display: 'none' }}
      />

      <div style={ns.topBar}>
        <button type="button" style={ns.roundBtn} onClick={() => navigate(-1)} aria-label="Fechar">
          <X size={20} color="#fff" />
        </button>
        <span style={ns.titlePill}>Novo post</span>
        <button type="button" style={ns.draftsChip} onClick={() => window.alert('Nenhum rascunho ainda.')}>
          Rascunhos
        </button>
      </div>

      {/* Área de mídia */}
      {current ? (
        <div style={ns.stage}>
          {current.type === 'video' ? (
            <video key={current.previewUrl} src={current.previewUrl} style={ns.stageMedia} controls playsInline />
          ) : (
            <img src={current.previewUrl} alt="" style={ns.stageMedia} />
          )}
          <button type="button" style={ns.swapChip} onClick={pickFiles}>
            <RefreshCw size={12} /> Trocar
          </button>
        </div>
      ) : (
        <button type="button" style={ns.emptyPlate} onClick={pickFiles}>
          <span style={ns.emptyIcon}><Camera size={20} color="#fff" /></span>
          <span style={ns.emptyTitle}>Adicionar mídia</span>
          <span style={ns.emptySub}>Foto, vídeo ou galeria</span>
        </button>
      )}

      {error && <p style={ns.error}>{error}</p>}

      {/* Folha inferior */}
      <div style={ns.sheet}>
        <div style={ns.audienceRow}>
          <span style={ns.audienceLabel}>{exclusive ? 'Só assinantes podem ver' : 'Todos podem ver'}</span>
          <div style={ns.audienceRight}>
            <span style={ns.audienceHint}>Assinantes</span>
            <button
              type="button"
              role="switch"
              aria-checked={exclusive}
              aria-label="Exclusivo para assinantes"
              onClick={() => setExclusive((v) => !v)}
              style={{ ...ns.switchTrack, backgroundColor: exclusive ? '#00FF00' : '#333' }}
            >
              <span style={{ ...ns.switchKnob, left: exclusive ? 18 : 2 }} />
            </button>
          </div>
        </div>

        <textarea
          style={ns.caption}
          placeholder="Escreva uma legenda..."
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, 500))}
          rows={2}
        />

        <div style={ns.suggestRow}>
          <span style={ns.suggestLabel}>Sugestões</span>
          {SUGGESTED_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              style={ns.suggestTag}
              onClick={() => setCaption((prev) => (prev ? `${prev} ${tag}` : tag).slice(0, 500))}
            >
              {tag}
            </button>
          ))}
        </div>

        <div style={ns.thumbRow}>
          {[0, 1, 2].map((slot) => {
            const item = mediaList[slot];
            if (item) {
              return (
                <div
                  key={item.previewUrl}
                  style={{ ...ns.thumb, ...(slot === active ? ns.thumbActive : {}) }}
                  onClick={() => setActive(slot)}
                >
                  {item.type === 'video' ? (
                    <video src={item.previewUrl} style={ns.thumbMedia} muted />
                  ) : (
                    <img src={item.previewUrl} alt="" style={ns.thumbMedia} />
                  )}
                  <button
                    type="button"
                    style={ns.thumbRemove}
                    onClick={(e) => { e.stopPropagation(); removeMedia(slot); }}
                    aria-label="Remover mídia"
                  >
                    <X size={11} color="#fff" />
                  </button>
                </div>
              );
            }
            return (
              <button key={`empty-${slot}`} type="button" style={ns.thumbEmpty} onClick={pickFiles}>
                {slot === mediaList.length && <Plus size={16} color="rgba(255,255,255,0.45)" />}
              </button>
            );
          })}
        </div>

        <div style={ns.actionRow}>
          {[
            { label: 'Marcar', icon: Smile },
            { label: 'Local', icon: MapPin },
            { label: 'Música', icon: Music2 },
            { label: 'Capa', icon: Maximize },
          ].map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              style={ns.action}
              onClick={() => window.alert(`${label}: em breve na web.`)}
            >
              <Icon size={17} color="#fff" />
              <span style={ns.actionLabel}>{label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          style={{ ...ns.publish, ...(blocked ? ns.publishDisabled : {}) }}
          onClick={handlePost}
          disabled={blocked}
        >
          {uploading ? 'Enviando...' : 'Publicar'}
        </button>
      </div>

      {uploading && (
        <div style={styles.uploadingOverlay}>
          <div style={styles.spinner} />
          <p style={styles.uploadingText}>{uploadProgress}</p>
        </div>
      )}
    </div>
  );
}

// Estilos da tela Criar (copiados do app: CameraScreen.js)
const ns = {
  page: {
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    maxWidth: 480,
    margin: '0 auto',
  },
  topBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  roundBtn: {
    width: 38, height: 38, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(5,5,6,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  titlePill: {
    padding: '9px 22px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(5,5,6,0.55)', color: '#fff', fontSize: 15, fontWeight: 600,
  },
  draftsChip: {
    padding: '9px 18px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(5,5,6,0.55)', color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  emptyPlate: {
    width: '100%', height: 280, borderRadius: 16, border: '1px dashed rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit',
  },
  emptyIcon: {
    width: 46, height: 46, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.10)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  emptyTitle: { color: '#fff', fontSize: 15, fontWeight: 600 },
  emptySub: { color: 'rgba(255,255,255,0.5)', fontSize: 12.5 },
  stage: {
    position: 'relative', width: '100%', height: 340, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000',
    border: '1px solid rgba(255,255,255,0.12)',
  },
  stageMedia: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },
  swapChip: {
    position: 'absolute', right: 10, bottom: 10, display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', borderRadius: 999, border: 'none', backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
  },
  error: { color: '#ff4444', fontSize: 13, margin: '10px 0 0 0' },
  sheet: {
    marginTop: 18, padding: 18, backgroundColor: 'rgba(8,8,10,0.76)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 26,
  },
  audienceRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  audienceLabel: { color: '#fff', fontSize: 13 },
  audienceRight: { display: 'flex', alignItems: 'center', gap: 8 },
  audienceHint: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  switchTrack: {
    position: 'relative', width: 40, height: 24, borderRadius: 12, border: 'none', padding: 0, cursor: 'pointer',
  },
  switchKnob: {
    position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', backgroundColor: '#fff',
    transition: 'left 0.15s',
  },
  caption: {
    width: '100%', marginTop: 12, minHeight: 42, padding: 0, border: 'none', outline: 'none', resize: 'none',
    backgroundColor: 'transparent', color: '#fff', fontSize: 14, lineHeight: '21px', fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  suggestRow: { marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  suggestLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 11 },
  suggestTag: {
    color: '#00CED1', fontSize: 12, background: 'transparent', border: 'none', padding: 0,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  thumbRow: { marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 },
  thumb: {
    position: 'relative', width: 52, height: 52, borderRadius: 10, overflow: 'hidden', backgroundColor: '#0a0a0a',
    cursor: 'pointer', boxSizing: 'border-box',
  },
  thumbActive: { border: '2px solid rgba(255,255,255,0.9)' },
  thumbMedia: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  thumbRemove: {
    position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', border: 'none',
    backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', padding: 0,
  },
  thumbEmpty: {
    width: 52, height: 52, borderRadius: 10, border: '1px dashed rgba(255,255,255,0.25)',
    backgroundColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', padding: 0,
  },
  actionRow: {
    marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.10)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  action: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  },
  actionLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10 },
  publish: {
    marginTop: 14, height: 52, width: '100%', borderRadius: 999, border: 'none',
    backgroundColor: '#00FF00', color: '#000', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
  publishDisabled: { backgroundColor: '#333', color: '#999', cursor: 'default' },
};

const styles = {
  modeTabs: {
    display: 'flex',
    gap: 8,
    maxWidth: 560,
    margin: '0 auto 20px',
    padding: 4,
    backgroundColor: '#0d0d0d',
    border: '1px solid #1a1a1a',
    borderRadius: 12,
  },
  modeTab: (active) => ({
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 0',
    border: 'none',
    borderRadius: 9,
    backgroundColor: active ? '#52fa35' : 'transparent',
    color: active ? '#000' : '#aaa',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
  }),
  container: {
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    maxWidth: 560,
    margin: '0 auto',
    position: 'relative',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  pageTitle: {
    color: '#f0f0f0',
    fontSize: 22,
    fontWeight: 700,
    margin: 0,
  },
  postButton: (enabled) => ({
    backgroundColor: enabled ? '#52fa35' : '#1a1a1a',
    color: enabled ? '#000' : '#555',
    border: 'none',
    borderRadius: 10,
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 700,
    cursor: enabled ? 'pointer' : 'default',
  }),
  errorText: {
    color: '#ff4444',
    fontSize: 13,
    marginBottom: 14,
  },
  previewRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 18,
    flexWrap: 'wrap',
  },
  readyPreviewWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 20,
  },
  readyPreviewVideo: {
    width: '100%',
    maxWidth: 320,
    aspectRatio: '9 / 16',
    borderRadius: 12,
    backgroundColor: '#000',
    objectFit: 'contain',
  },
  mediaThumb: {
    position: 'relative',
    width: 110,
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    flexShrink: 0,
  },
  thumbMedia: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  videoBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  },
  removeButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    border: 'none',
    borderRadius: '50%',
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  thumbIndex: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    width: 20,
    height: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
  },
  addButtonsRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 8,
  },
  addButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: '14px 0',
    border: '1px solid #2a2a2a',
    cursor: 'pointer',
    position: 'relative',
  },
  addButtonDisabled: {
    borderColor: '#1a1a1a',
    backgroundColor: '#111',
    cursor: 'default',
  },
  addButtonText: {
    color: '#f0f0f0',
    fontSize: 14,
    fontWeight: 600,
  },
  addButtonTextDisabled: {
    color: '#444',
    fontSize: 14,
    fontWeight: 600,
  },
  hiddenInput: {
    position: 'absolute',
    inset: 0,
    opacity: 0,
    cursor: 'pointer',
  },
  mediaCounter: {
    color: '#777',
    fontSize: 12,
    textAlign: 'center',
    margin: '10px 0 20px',
  },
  captionWrap: {
    marginBottom: 20,
  },
  captionInput: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 12,
    padding: 14,
    color: '#f0f0f0',
    fontSize: 14,
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    resize: 'vertical',
    boxSizing: 'border-box',
    outline: 'none',
  },
  captionCounter: {
    color: '#666',
    fontSize: 11,
    textAlign: 'right',
    margin: '4px 0 0 0',
  },
  tips: {
    padding: 16,
    backgroundColor: '#0d0d0d',
    borderRadius: 12,
    borderLeft: '3px solid #52fa35',
    marginBottom: 20,
  },
  tipsTitle: {
    color: '#f0f0f0',
    fontSize: 13,
    fontWeight: 700,
    margin: '0 0 8px 0',
  },
  tipText: {
    color: '#999',
    fontSize: 12,
    lineHeight: 1.7,
    margin: 0,
  },
  emptyHint: {
    display: 'none',
  },
  uploadingOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(1,2,8,0.92)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    zIndex: 1000,
  },
  spinner: {
    width: 36,
    height: 36,
    border: '3px solid #1a1a1a',
    borderTopColor: '#52fa35',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  uploadingText: {
    color: '#fff',
    fontSize: 14,
  },
};

// Injeta a animação do spinner uma única vez
if (typeof document !== 'undefined' && !document.getElementById('uou-spin-keyframes')) {
  const styleTag = document.createElement('style');
  styleTag.id = 'uou-spin-keyframes';
  styleTag.innerHTML = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(styleTag);
}
