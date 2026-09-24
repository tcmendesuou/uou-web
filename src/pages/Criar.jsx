import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, getDoc, doc } from 'firebase/firestore';
import { storage, db, auth } from '../firebase';
import { Images, Plus, X, Play, ImageOff } from 'lucide-react';

const MAX_MEDIA = 3;

export default function Criar() {
  const navigate = useNavigate();
  const [mediaList, setMediaList] = useState([]); // [{file, previewUrl, type}]
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState('');

  const handlePickFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remaining = MAX_MEDIA - mediaList.length;
    if (remaining <= 0) {
      setError(`Você pode adicionar no máximo ${MAX_MEDIA} mídias.`);
      e.target.value = '';
      return;
    }

    const newItems = files.slice(0, remaining).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      type: file.type.startsWith('video') ? 'video' : 'photo',
    }));

    setMediaList((prev) => [...prev, ...newItems].slice(0, MAX_MEDIA));
    setError('');
    e.target.value = ''; // permite selecionar o mesmo arquivo de novo depois
  };

  const removeMedia = (index) => {
    setMediaList((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].previewUrl);
      updated.splice(index, 1);
      return updated;
    });
  };

  const uploadSingleMedia = async (item, index) => {
    setUploadProgress(`Enviando mídia ${index + 1} de ${mediaList.length}...`);
    const fileExtension = item.type === 'video' ? 'mp4' : 'jpg';
    const fileName = `${Date.now()}_${index}.${fileExtension}`;
    const storageRef = ref(storage, `posts/${auth.currentUser.uid}/${fileName}`);
    await uploadBytes(storageRef, item.file);
    const downloadURL = await getDownloadURL(storageRef);
    return { url: downloadURL, type: item.type };
  };

  const handlePost = async () => {
    setError('');
    if (mediaList.length === 0) {
      setError('Selecione pelo menos uma foto ou vídeo');
      return;
    }
    if (!caption.trim()) {
      setError('Adicione uma legenda');
      return;
    }

    setUploading(true);
    try {
      const uploadedItems = [];
      for (let i = 0; i < mediaList.length; i++) {
        const uploaded = await uploadSingleMedia(mediaList[i], i);
        uploadedItems.push(uploaded);
      }

      setUploadProgress('Salvando post...');

      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};

      await addDoc(collection(db, 'posts'), {
        type: 'carousel',
        mediaItems: uploadedItems,
        mediaUrl: uploadedItems[0].url,
        mediaType: uploadedItems[0].type,
        caption: caption.trim(),
        userId: auth.currentUser.uid,
        userName: userData?.name || 'Usuário',
        userPhoto: userData?.photoURL || null,
        likes: 0,
        commentsCount: 0,
        createdAt: new Date().toISOString(),
      });

      mediaList.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setMediaList([]);
      setCaption('');
      navigate('/');
    } catch (err) {
      console.error('[Criar] Erro ao criar post:', err);
      setError('Não foi possível criar o post. Tente novamente.');
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const canPost = mediaList.length > 0 && caption.trim().length > 0 && !uploading;

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <h1 style={styles.pageTitle}>Novo Post</h1>
        <button style={styles.postButton(canPost)} onClick={handlePost} disabled={!canPost}>
          {uploading ? 'Enviando...' : 'Postar'}
        </button>
      </div>

      {error && <p style={styles.errorText}>{error}</p>}

      {/* Preview das mídias selecionadas */}
      {mediaList.length > 0 && (
        <div style={styles.previewRow}>
          {mediaList.map((item, index) => (
            <div key={item.previewUrl} style={styles.mediaThumb}>
              {item.type === 'video' ? (
                <video src={item.previewUrl} style={styles.thumbMedia} muted />
              ) : (
                <img src={item.previewUrl} alt="" style={styles.thumbMedia} />
              )}
              {item.type === 'video' && (
                <div style={styles.videoBadge}>
                  <Play size={16} color="#fff" fill="#fff" />
                </div>
              )}
              <button
                type="button"
                style={styles.removeButton}
                onClick={() => removeMedia(index)}
                aria-label="Remover mídia"
              >
                <X size={14} color="#fff" />
              </button>
              <div style={styles.thumbIndex}>{index + 1}</div>
            </div>
          ))}
        </div>
      )}

      {/* Botões de adicionar mídia */}
      <div style={styles.addButtonsRow}>
        <label style={{ ...styles.addButton, ...(mediaList.length >= MAX_MEDIA ? styles.addButtonDisabled : {}) }}>
          <Images size={20} color={mediaList.length >= MAX_MEDIA ? '#444' : '#f0f0f0'} />
          <span style={mediaList.length >= MAX_MEDIA ? styles.addButtonTextDisabled : styles.addButtonText}>
            Selecionar várias
          </span>
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handlePickFiles}
            disabled={mediaList.length >= MAX_MEDIA}
            style={styles.hiddenInput}
          />
        </label>

        <label style={{ ...styles.addButton, ...(mediaList.length >= MAX_MEDIA ? styles.addButtonDisabled : {}) }}>
          <Plus size={20} color={mediaList.length >= MAX_MEDIA ? '#444' : '#f0f0f0'} />
          <span style={mediaList.length >= MAX_MEDIA ? styles.addButtonTextDisabled : styles.addButtonText}>
            Adicionar uma
          </span>
          <input
            type="file"
            accept="image/*,video/*"
            onChange={handlePickFiles}
            disabled={mediaList.length >= MAX_MEDIA}
            style={styles.hiddenInput}
          />
        </label>
      </div>

      <p style={styles.mediaCounter}>
        {mediaList.length}/{MAX_MEDIA} mídias selecionadas
        {mediaList.length === 0 && ' — selecione pelo menos 1'}
      </p>

      {/* Legenda */}
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

      {/* Dicas */}
      <div style={styles.tips}>
        <p style={styles.tipsTitle}>💡 Dicas:</p>
        <p style={styles.tipText}>• Adicione até 3 fotos ou vídeos no mesmo post</p>
        <p style={styles.tipText}>• Você pode misturar fotos e vídeos</p>
        <p style={styles.tipText}>• Vídeos ficam melhores em até 60 segundos</p>
      </div>

      {mediaList.length === 0 && (
        <div style={styles.emptyHint}>
          <ImageOff size={32} color="#333" />
        </div>
      )}

      {uploading && (
        <div style={styles.uploadingOverlay}>
          <div style={styles.spinner} />
          <p style={styles.uploadingText}>{uploadProgress}</p>
        </div>
      )}
    </div>
  );
}

const styles = {
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
