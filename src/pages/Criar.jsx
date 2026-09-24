import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, onSnapshot, addDoc, deleteDoc, doc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import { CheckCircle2, Video, MonitorUp, Trash2, Send, Scissors, Upload } from 'lucide-react';
import VideoEditor from '../components/VideoEditor';

const TABS = [
  { id: 'prontos', label: 'Prontos', icon: CheckCircle2 },
  { id: 'brutos', label: 'Brutos', icon: Video },
  { id: 'computador', label: 'Do Computador', icon: MonitorUp },
];

export default function Criar() {
  const navigate = useNavigate();
  const uid = auth.currentUser?.uid;
  const [activeTab, setActiveTab] = useState('prontos');
  const [videos, setVideos] = useState([]);
  const [uploadingRaw, setUploadingRaw] = useState(false);
  const [editorClips, setEditorClips] = useState(null); // null = editor fechado

  // ✅ Biblioteca pessoal de vídeos do criador (creator_videos) — separada
  // da coleção `posts`, que só recebe o vídeo quando ele efetivamente posta.
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'creator_videos'), where('userId', '==', uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = [];
      snapshot.forEach((docSnap) => items.push({ id: docSnap.id, ...docSnap.data() }));
      items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setVideos(items);
    });
    return () => unsubscribe();
  }, [uid]);

  const prontos = videos.filter((v) => v.status === 'ready');
  const brutos = videos.filter((v) => v.status === 'raw');

  // ✅ Upload de vídeo bruto (só salva o arquivo cru pra editar depois —
  // não passa pelo editor agora).
  const handleUploadRaw = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      setUploadingRaw(true);
      const fileName = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `creator_videos/${uid}/raw/${fileName}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'creator_videos'), {
        userId: uid,
        status: 'raw',
        storagePath: storageRef.fullPath,
        url,
        originalName: file.name,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Criar] Erro ao subir vídeo bruto:', err);
      alert('Não foi possível enviar o vídeo bruto.');
    } finally {
      setUploadingRaw(false);
    }
  };

  const handleDeleteVideo = async (video) => {
    if (!window.confirm('Excluir esse vídeo? Essa ação não pode ser desfeita.')) return;
    try {
      await deleteDoc(doc(db, 'creator_videos', video.id));
      if (video.storagePath) {
        try {
          await deleteObject(ref(storage, video.storagePath));
        } catch (e) {
          // ignora se já não existir
        }
      }
    } catch (err) {
      console.error('[Criar] Erro ao excluir vídeo:', err);
      alert('Não foi possível excluir o vídeo.');
    }
  };

  // ✅ Abre o editor com um bruto já salvo na nuvem
  const handleEditRaw = (video) => {
    setEditorClips([{ name: video.originalName || 'Vídeo', url: video.url }]);
  };

  // ✅ Abre o editor direto com arquivo(s) do computador — nada é
  // enviado pra nuvem até ele exportar (só sobe o resultado final).
  const handlePickFromComputer = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    e.target.value = '';
    setEditorClips(
      files.map((file) => ({ name: file.name, url: URL.createObjectURL(file), file }))
    );
  };

  // ✅ Editor terminou de exportar: sobe o vídeo final pra "Prontos"
  const handleExported = async (blob) => {
    try {
      const fileName = `${Date.now()}.mp4`;
      const storageRef = ref(storage, `creator_videos/${uid}/ready/${fileName}`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'creator_videos'), {
        userId: uid,
        status: 'ready',
        storagePath: storageRef.fullPath,
        url,
        originalName: fileName,
        createdAt: new Date().toISOString(),
      });

      setEditorClips(null);
      setActiveTab('prontos');
    } catch (err) {
      console.error('[Criar] Erro ao salvar vídeo exportado:', err);
      alert('O vídeo foi editado, mas não foi possível salvá-lo. Tente exportar de novo.');
    }
  };

  // ✅ Manda um vídeo pronto direto pra tela de Postar, sem re-upload
  const handlePostarVideo = (video) => {
    navigate('/postar', { state: { readyVideo: video } });
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.pageTitle}>Criar</h1>

      <div style={styles.tabsRow}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            style={{ ...styles.tabButton, ...(activeTab === tab.id ? styles.tabButtonActive : {}) }}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'prontos' && (
        <div>
          {prontos.length === 0 ? (
            <p style={styles.emptyText}>Nenhum vídeo pronto ainda. Edite um bruto ou importe do computador.</p>
          ) : (
            <div style={styles.grid}>
              {prontos.map((video) => (
                <div key={video.id} style={styles.card}>
                  <video src={video.url} style={styles.cardVideo} controls />
                  <div style={styles.cardActions}>
                    <button style={styles.primaryBtn} onClick={() => handlePostarVideo(video)}>
                      <Send size={14} /> Postar
                    </button>
                    <button style={styles.iconBtn} onClick={() => handleDeleteVideo(video)}>
                      <Trash2 size={16} color="#ff4444" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'brutos' && (
        <div>
          <label style={styles.uploadRawBtn}>
            <Upload size={18} />
            {uploadingRaw ? 'Enviando...' : 'Adicionar vídeo bruto'}
            <input
              type="file"
              accept="video/*"
              onChange={handleUploadRaw}
              disabled={uploadingRaw}
              style={styles.hiddenInput}
            />
          </label>

          {brutos.length === 0 ? (
            <p style={styles.emptyText}>Nenhum vídeo bruto salvo ainda.</p>
          ) : (
            <div style={styles.grid}>
              {brutos.map((video) => (
                <div key={video.id} style={styles.card}>
                  <video src={video.url} style={styles.cardVideo} muted />
                  <div style={styles.cardActions}>
                    <button style={styles.primaryBtn} onClick={() => handleEditRaw(video)}>
                      <Scissors size={14} /> Editar
                    </button>
                    <button style={styles.iconBtn} onClick={() => handleDeleteVideo(video)}>
                      <Trash2 size={16} color="#ff4444" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'computador' && (
        <div style={styles.computerTab}>
          <MonitorUp size={40} color="#52fa35" style={{ marginBottom: 14 }} />
          <p style={styles.computerText}>
            Escolha um ou mais vídeos do seu computador pra editar agora. Nada é
            enviado pra nuvem até você exportar o resultado final.
          </p>
          <label style={styles.uploadRawBtn}>
            <MonitorUp size={18} />
            Escolher vídeos
            <input
              type="file"
              accept="video/*"
              multiple
              onChange={handlePickFromComputer}
              style={styles.hiddenInput}
            />
          </label>
        </div>
      )}

      {editorClips && (
        <VideoEditor
          initialClips={editorClips}
          onClose={() => setEditorClips(null)}
          onExported={handleExported}
        />
      )}
    </div>
  );
}

const styles = {
  container: {
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    maxWidth: 900,
    margin: '0 auto',
  },
  pageTitle: {
    color: '#f0f0f0',
    fontSize: 22,
    fontWeight: 700,
    margin: '0 0 20px 0',
  },
  tabsRow: {
    display: 'flex',
    gap: 10,
    marginBottom: 24,
    borderBottom: '1px solid #1a1a1a',
    paddingBottom: 16,
  },
  tabButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    borderRadius: 20,
    border: 'none',
    backgroundColor: 'transparent',
    color: '#999',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  tabButtonActive: {
    backgroundColor: 'rgba(82,250,53,0.12)',
    color: '#52fa35',
  },
  emptyText: {
    color: '#666',
    fontSize: 13,
    padding: '30px 0',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 16,
  },
  card: {
    backgroundColor: '#0d0d0d',
    border: '1px solid #1a1a1a',
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardVideo: {
    width: '100%',
    aspectRatio: '9 / 16',
    objectFit: 'cover',
    backgroundColor: '#000',
    display: 'block',
  },
  cardActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    gap: 8,
  },
  primaryBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#52fa35',
    color: '#000',
    border: 'none',
    borderRadius: 8,
    padding: '8px 0',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 6,
    display: 'flex',
  },
  uploadRawBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 10,
    padding: '12px 20px',
    color: '#f0f0f0',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    position: 'relative',
    marginBottom: 20,
  },
  hiddenInput: {
    position: 'absolute',
    inset: 0,
    opacity: 0,
    cursor: 'pointer',
  },
  computerTab: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '50px 20px',
  },
  computerText: {
    color: '#999',
    fontSize: 13,
    lineHeight: 1.6,
    maxWidth: 380,
    marginBottom: 20,
  },
};
