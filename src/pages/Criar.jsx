import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, onSnapshot, addDoc, deleteDoc, doc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import { CheckCircle2, Video, MonitorUp, Trash2, Send, Scissors, Upload, Film } from 'lucide-react';
import VideoEditor from '../components/VideoEditor';
import Panel from '../components/Panel';

const CSS = `
.uou-edit-grid{display:grid;gap:4px;grid-template-columns:300px minmax(0,1fr);grid-template-areas:"proj lib";height:calc(100vh - 190px);min-height:520px}
@media (max-width:900px){.uou-edit-grid{grid-template-columns:minmax(0,1fr);grid-template-areas:"lib" "proj";height:auto}}
`;

const TABS = [
  { id: 'prontos', label: 'Prontos', icon: CheckCircle2 },
  { id: 'brutos', label: 'Brutos', icon: Video },
  { id: 'computador', label: 'Do Computador', icon: MonitorUp },
];

const videoName = (v) => (v.originalName || v.name || v.title || 'Vídeo sem nome').replace(/\.[^.]+$/, '');

export default function Criar() {
  const navigate = useNavigate();
  const uid = auth.currentUser?.uid;
  const [activeTab, setActiveTab] = useState('prontos');
  const [videos, setVideos] = useState([]);
  const [uploadingRaw, setUploadingRaw] = useState(false);
  const [editorClips, setEditorClips] = useState(null); // null = editor fechado
  const [editorProject, setEditorProject] = useState(null); // projeto salvo aberto no editor
  const [projects, setProjects] = useState([]);

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

  // ✅ Projetos de edição em andamento (rascunhos salvos pelo editor)
  useEffect(() => {
    if (!uid) return undefined;
    const q = query(collection(db, 'editor_projects'), where('userId', '==', uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = [];
        snapshot.forEach((docSnap) => items.push({ id: docSnap.id, ...docSnap.data() }));
        items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        setProjects(items);
      },
      (err) => console.error('[Criar] Erro ao carregar projetos:', err)
    );
    return () => unsubscribe();
  }, [uid]);

  const handleDeleteProject = async (project) => {
    if (!window.confirm(`Excluir o projeto "${project.name || 'Projeto sem título'}"? Essa ação não pode ser desfeita.`)) return;
    try {
      await deleteDoc(doc(db, 'editor_projects', project.id));
      // apaga também os vídeos do computador que subiram junto com o projeto
      for (const m of project.media || []) {
        if (m.storagePath) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await deleteObject(ref(storage, m.storagePath));
          } catch (e) {
            // ignora se já não existir
          }
        }
      }
    } catch (err) {
      console.error('[Criar] Erro ao excluir projeto:', err);
      alert('Não foi possível excluir o projeto.');
    }
  };

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
        originalName: editorProject?.name || `Vídeo editado ${new Date().toLocaleDateString('pt-BR')}`,
        createdAt: new Date().toISOString(),
      });

      setEditorClips(null);
      setEditorProject(null);
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
      <style>{CSS}</style>
      <div style={styles.titleRow}>
        <h1 style={{ ...styles.pageTitle, margin: 0 }}>Editar</h1>
        <button style={styles.openEditorBtn} onClick={() => setEditorClips([])}>
          <Scissors size={16} /> Abrir editor
        </button>
      </div>

      <div className="uou-edit-grid">
        <Panel area="proj" title="Projetos em andamento">
          {projects.length === 0 ? (
            <p style={styles.emptyText}>Seus projetos de edição aparecem aqui para você continuar depois.</p>
          ) : (
            <div style={styles.projectList}>
              {projects.map((p) => (
                <div key={p.id} style={styles.projectRow}>
                  <button style={styles.projectOpen} onClick={() => { setEditorClips(null); setEditorProject(p); }}>
                    <div style={{ ...styles.projectThumb, backgroundImage: p.thumb ? `url("${p.thumb}")` : 'none' }}>
                      {!p.thumb && <Film size={18} color="#444" />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={styles.projectName}>{p.name || 'Projeto sem título'}</p>
                      <p style={styles.projectMeta}>
                        {Math.round(p.duration || 0)}s · {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('pt-BR') : ''}
                      </p>
                    </div>
                  </button>
                  <button style={styles.iconBtn} onClick={() => handleDeleteProject(p)} aria-label="Excluir projeto">
                    <Trash2 size={15} color="#ff4444" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel area="lib" tabs={TABS} activeTab={activeTab} onTab={setActiveTab}>
          {activeTab === 'prontos' && (
            <div>
              {prontos.length === 0 ? (
                <p style={styles.emptyText}>Nenhum vídeo pronto ainda. Edite um bruto ou importe do computador.</p>
              ) : (
                <div style={styles.grid}>
                  {prontos.map((video) => (
                    <div key={video.id} style={styles.card}>
                      <video src={video.url} style={styles.cardVideo} controls />
                      <p style={styles.cardName} title={videoName(video)}>{videoName(video)}</p>
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
                      <p style={styles.cardName} title={videoName(video)}>{videoName(video)}</p>
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
        </Panel>
      </div>

      {(editorClips || editorProject) && (
        <VideoEditor
          key={editorProject?.id || 'novo'}
          initialClips={editorClips || []}
          project={editorProject}
          onClose={() => { setEditorClips(null); setEditorProject(null); }}
          onExported={handleExported}
        />
      )}
    </div>
  );
}

const styles = {
  container: {
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    maxWidth: 1300,
    margin: '0 auto',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: '0 0 20px 0',
  },
  openEditorBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(82, 250, 53, 0.1)',
    color: '#52fa35',
    border: '1px solid #52fa35',
    borderRadius: 10,
    padding: '10px 18px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  pageTitle: {
    color: '#f0f0f0',
    fontSize: 22,
    fontWeight: 700,
    margin: '0 0 20px 0',
  },
  projectList: { display: 'flex', flexDirection: 'column', gap: 4 },
  projectRow: { display: 'flex', alignItems: 'center', gap: 4, padding: '4px 4px 4px 0', borderRadius: 6, backgroundColor: '#222224' },
  projectOpen: {
    display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, padding: 6, border: 'none', background: 'none',
    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
  },
  projectThumb: {
    width: 42, height: 42, borderRadius: 6, backgroundColor: '#2f2f33', backgroundSize: 'cover', backgroundPosition: 'center',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  projectName: { color: '#f0f0f0', fontSize: 13, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  projectMeta: { color: '#777', fontSize: 11, margin: '2px 0 0 0' },
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
    backgroundColor: '#222224',
    borderRadius: 6,
    overflow: 'hidden',
  },
  cardVideo: {
    width: '100%',
    aspectRatio: '9 / 16',
    objectFit: 'cover',
    backgroundColor: '#000',
    display: 'block',
  },
  cardName: { color: '#f0f0f0', fontSize: 12, fontWeight: 600, margin: 0, padding: '8px 10px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
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
    backgroundColor: 'rgba(82, 250, 53, 0.1)',
    color: '#52fa35',
    border: '1px solid #52fa35',
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
    backgroundColor: '#2a2a2d',
    border: '1px solid #3a3a3d',
    borderRadius: 8,
    padding: '10px 18px',
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
