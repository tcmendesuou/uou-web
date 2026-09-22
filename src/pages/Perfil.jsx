import React, { useEffect, useState } from 'react';
import {
  doc, getDoc, updateDoc, deleteDoc, collection, query, where, onSnapshot,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  EmailAuthProvider, reauthenticateWithCredential, updatePassword, signOut,
} from 'firebase/auth';
import { db, auth, storage } from '../firebase';
import {
  Camera, Settings, X, Heart, MessageCircle, Trash2, Key, LogOut, Play,
  Eye, EyeOff, Lock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Perfil() {
  const navigate = useNavigate();
  const uid = auth.currentUser?.uid;

  const [userData, setUserData] = useState(null);
  const [galleryPosts, setGalleryPosts] = useState([]);
  const [uploading, setUploading] = useState(false);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editIsPrivate, setEditIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const [selectedMedia, setSelectedMedia] = useState(null);
  const [mediaMenuOpen, setMediaMenuOpen] = useState(false);

  const isEmailPasswordUser = auth.currentUser?.providerData?.some(
    (p) => p.providerId === 'password'
  );

  // Carregar dados do usuário
  useEffect(() => {
    if (!uid) return;
    const loadUserData = async () => {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserData(data);
        setEditName(data.name || '');
        setEditBio(data.bio || '');
        setEditIsPrivate(!!data.isPrivate);
      }
    };
    loadUserData();
  }, [uid]);

  // Galeria de posts (fotos/vídeos)
  useEffect(() => {
    if (!uid) return;
    const postsQuery = query(collection(db, 'posts'), where('userId', '==', uid));
    const unsubscribe = onSnapshot(postsQuery, (snapshot) => {
      const posts = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.mediaUrl) posts.push({ id: docSnap.id, ...data });
      });
      posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setGalleryPosts(posts);
    });
    return () => unsubscribe();
  }, [uid]);

  const reloadUserData = async () => {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) setUserData(userDoc.data());
  };

  const handlePickPhoto = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        setUploading(true);
        const filename = `profiles/${uid}_${Date.now()}.jpg`;
        const storageRef = ref(storage, filename);
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);
        await updateDoc(doc(db, 'users', uid), { photoURL: downloadURL });
        await reloadUserData();
      } catch (error) {
        console.error('[Perfil] Erro ao fazer upload da foto:', error);
        alert('Não foi possível atualizar a foto');
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      await updateDoc(doc(db, 'users', uid), {
        name: editName,
        bio: editBio,
        isPrivate: editIsPrivate,
      });
      await reloadUserData();
      setEditModalOpen(false);
    } catch (error) {
      console.error('[Perfil] Erro ao atualizar perfil:', error);
      alert('Não foi possível atualizar o perfil');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setPasswordError('Preencha todos os campos');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('A nova senha deve ter no mínimo 6 caracteres');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('A nova senha e a confirmação não são iguais');
      return;
    }
    try {
      setChangingPassword(true);
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      setPasswordModalOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      alert('Sua senha foi alterada.');
    } catch (error) {
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setPasswordError('Senha atual incorreta');
      } else {
        setPasswordError('Não foi possível alterar a senha. Tente novamente.');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeletePost = async (post) => {
    if (!window.confirm('Excluir essa publicação? Essa ação não pode ser desfeita.')) return;
    try {
      await deleteDoc(doc(db, 'posts', post.id));
      if (post.mediaUrl) {
        try {
          const fileRef = ref(storage, post.mediaUrl);
          await deleteObject(fileRef);
        } catch (e) {
          // ignora se já não existir
        }
      }
      setSelectedMedia(null);
      setMediaMenuOpen(false);
    } catch (error) {
      console.error('[Perfil] Erro ao excluir post:', error);
      alert('Não foi possível excluir a publicação');
    }
  };

  const handleLogout = async () => {
    if (!window.confirm('Tem certeza que deseja sair?')) return;
    await signOut(auth);
    navigate('/login');
  };

  if (!userData) {
    return (
      <div style={styles.loadingContainer}>
        <p style={styles.loadingText}>Carregando...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <h1 style={styles.pageTitle}>Perfil</h1>
        <button style={styles.iconBtn} onClick={() => setEditModalOpen(true)}>
          <Settings size={20} color="#f0f0f0" />
        </button>
      </div>

      {/* Info do perfil */}
      <div style={styles.profileSection}>
        <div style={styles.profileTopRow}>
          <div style={styles.photoColumn}>
            <div style={styles.photoWrapper} onClick={handlePickPhoto}>
              <img
                src={userData.photoURL || 'https://via.placeholder.com/120'}
                alt="Foto de perfil"
                style={styles.profilePhoto}
              />
              <div style={styles.editPhotoButton}>
                <Camera size={14} color="#000" />
              </div>
              {uploading && (
                <div style={styles.uploadingOverlay}>
                  <p style={styles.uploadingText}>...</p>
                </div>
              )}
            </div>
            {userData.level && (
              <div style={styles.levelBadge}>
                <span style={styles.levelText}>Nível {userData.level}</span>
              </div>
            )}
          </div>

          <div style={styles.infoColumn}>
            <p style={styles.profileName}>{userData.name}</p>
            {userData.bio && <p style={styles.profileBio}>{userData.bio}</p>}
          </div>
        </div>

        <div style={styles.statsRow}>
          <div style={styles.statItem}>
            <p style={styles.statValue}>{userData.followers || 0}</p>
            <p style={styles.statLabel}>Seguidores</p>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.statItem}>
            <p style={styles.statValue}>{userData.following || 0}</p>
            <p style={styles.statLabel}>Seguindo</p>
          </div>
        </div>
      </div>

      {/* Galeria */}
      <div style={styles.galleryHeader}>
        <span style={styles.galleryHeaderText}>Publicações</span>
      </div>

      {galleryPosts.length === 0 ? (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>Nenhuma foto ou vídeo postado</p>
        </div>
      ) : (
        <div style={styles.galleryGrid}>
          {galleryPosts.map((post) => (
            <div
              key={post.id}
              style={styles.galleryItem}
              onClick={() => setSelectedMedia(post)}
            >
              <img
                src={post.mediaType === 'video' ? (post.thumbnailUrl || '') : post.mediaUrl}
                alt=""
                style={{
                  ...styles.galleryImage,
                  backgroundColor: post.mediaType === 'video' && !post.thumbnailUrl ? '#111' : 'transparent',
                }}
              />
              {post.mediaType === 'video' && (
                <div style={styles.videoIndicator}>
                  <Play size={18} color="#fff" fill="#fff" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal de visualização de mídia */}
      {selectedMedia && (
        <div style={styles.mediaModalOverlay} onClick={() => { setSelectedMedia(null); setMediaMenuOpen(false); }}>
          <div style={styles.mediaModalContent} onClick={(e) => e.stopPropagation()}>
            <button
              style={styles.mediaModalClose}
              onClick={() => { setSelectedMedia(null); setMediaMenuOpen(false); }}
            >
              <X size={26} color="#fff" />
            </button>

            <button
              style={styles.mediaModalMenuBtn}
              onClick={() => setMediaMenuOpen(!mediaMenuOpen)}
            >
              <Trash2 size={20} color="#fff" />
            </button>

            {mediaMenuOpen && (
              <div style={styles.mediaMenuBox}>
                <button
                  style={styles.mediaMenuItem}
                  onClick={() => handleDeletePost(selectedMedia)}
                >
                  <Trash2 size={16} color="#ff4444" />
                  <span style={{ color: '#ff4444' }}>Excluir publicação</span>
                </button>
              </div>
            )}

            {selectedMedia.mediaType === 'video' ? (
              <video
                src={selectedMedia.mediaUrl}
                controls
                autoPlay
                loop
                style={styles.mediaModalMedia}
              />
            ) : (
              <img src={selectedMedia.mediaUrl} alt="" style={styles.mediaModalMedia} />
            )}

            <div style={styles.mediaModalFooter}>
              <div style={styles.mediaModalStats}>
                <span style={styles.mediaModalStatItem}>
                  <Heart size={16} color="#ff4444" fill="#ff4444" />
                  {selectedMedia.likes || 0}
                </span>
                <span style={styles.mediaModalStatItem}>
                  <MessageCircle size={15} color="#ccc" />
                  {selectedMedia.commentsCount || 0}
                </span>
              </div>
              {selectedMedia.caption && (
                <p style={styles.mediaModalCaption}>{selectedMedia.caption}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de edição de perfil */}
      {editModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setEditModalOpen(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Editar Perfil</h2>
              <button style={styles.modalCloseBtn} onClick={() => setEditModalOpen(false)}>
                <X size={22} color="#fff" />
              </button>
            </div>

            <label style={styles.fieldLabel}>Nome</label>
            <input
              style={styles.input}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Nome"
            />

            <label style={styles.fieldLabel}>Bio</label>
            <textarea
              style={{ ...styles.input, ...styles.textArea }}
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              placeholder="Bio"
              rows={4}
            />

            <div style={styles.privacyRow}>
              <div style={{ flex: 1 }}>
                <p style={styles.privacyLabel}>Conta privada</p>
                <p style={styles.privacySubtext}>Só quem você aceitar vê suas postagens</p>
              </div>
              <button
                style={{
                  ...styles.switch,
                  backgroundColor: editIsPrivate ? '#52fa35' : '#333',
                }}
                onClick={() => setEditIsPrivate(!editIsPrivate)}
              >
                <div
                  style={{
                    ...styles.switchThumb,
                    transform: editIsPrivate ? 'translateX(18px)' : 'translateX(0px)',
                  }}
                />
              </button>
            </div>

            <button style={styles.saveButton} onClick={handleSaveProfile} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>

            {isEmailPasswordUser && (
              <button
                style={styles.changePasswordButton}
                onClick={() => { setEditModalOpen(false); setPasswordModalOpen(true); }}
              >
                <Key size={18} color="#fff" />
                <span>Alterar Senha</span>
              </button>
            )}

            <button style={styles.logoutButton} onClick={handleLogout}>
              <LogOut size={18} color="#ff4444" />
              <span>Sair da Conta</span>
            </button>
          </div>
        </div>
      )}

      {/* Modal de troca de senha */}
      {passwordModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setPasswordModalOpen(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Alterar Senha</h2>
              <button style={styles.modalCloseBtn} onClick={() => setPasswordModalOpen(false)}>
                <X size={22} color="#fff" />
              </button>
            </div>

            {passwordError && <p style={styles.errorText}>{passwordError}</p>}

            <PasswordField
              placeholder="Senha atual"
              value={currentPassword}
              onChange={setCurrentPassword}
              show={showCurrentPassword}
              onToggleShow={() => setShowCurrentPassword(!showCurrentPassword)}
            />
            <PasswordField
              placeholder="Nova senha (mín. 6 caracteres)"
              value={newPassword}
              onChange={setNewPassword}
              show={showNewPassword}
              onToggleShow={() => setShowNewPassword(!showNewPassword)}
            />
            <PasswordField
              placeholder="Confirmar nova senha"
              value={confirmNewPassword}
              onChange={setConfirmNewPassword}
              show={showConfirmPassword}
              onToggleShow={() => setShowConfirmPassword(!showConfirmPassword)}
            />

            <button
              style={styles.saveButton}
              onClick={handleChangePassword}
              disabled={changingPassword}
            >
              {changingPassword ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PasswordField({ placeholder, value, onChange, show, onToggleShow }) {
  return (
    <div style={styles.passwordFieldContainer}>
      <input
        style={{ ...styles.input, marginBottom: 0, flex: 1 }}
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button style={styles.passwordEyeButton} onClick={onToggleShow} type="button">
        {show ? <EyeOff size={18} color="#666" /> : <Eye size={18} color="#666" />}
      </button>
    </div>
  );
}

const styles = {
  container: {
    padding: '24px 32px 60px',
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    maxWidth: 720,
    margin: '0 auto',
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '60vh',
  },
  loadingText: {
    color: '#666',
    fontSize: 16,
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
  iconBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 8,
    display: 'flex',
    alignItems: 'center',
  },
  profileSection: {
    backgroundColor: '#0d0d0d',
    border: '1px solid #1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  profileTopRow: {
    display: 'flex',
    gap: 18,
  },
  photoColumn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  photoWrapper: {
    position: 'relative',
    cursor: 'pointer',
    width: 84,
    height: 84,
  },
  profilePhoto: {
    width: 84,
    height: 84,
    borderRadius: 42,
    objectFit: 'cover',
    border: '2px solid #52fa35',
  },
  editPhotoButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#52fa35',
    width: 26,
    height: 26,
    borderRadius: 13,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 42,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadingText: {
    color: '#fff',
    fontSize: 14,
    margin: 0,
  },
  levelBadge: {
    marginTop: 8,
    backgroundColor: 'rgba(82,250,53,0.12)',
    padding: '3px 8px',
    borderRadius: 10,
  },
  levelText: {
    color: '#52fa35',
    fontSize: 11,
    fontWeight: 700,
  },
  infoColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  profileName: {
    color: '#f0f0f0',
    fontSize: 19,
    fontWeight: 700,
    margin: '0 0 6px 0',
  },
  profileBio: {
    color: '#bbb',
    fontSize: 13,
    lineHeight: 1.5,
    margin: 0,
  },
  statsRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: 24,
    marginTop: 18,
    paddingTop: 16,
    borderTop: '1px solid #1a1a1a',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#333',
  },
  statValue: {
    color: '#f0f0f0',
    fontSize: 18,
    fontWeight: 700,
    margin: 0,
  },
  statLabel: {
    color: '#999',
    fontSize: 11,
    margin: '2px 0 0 0',
  },
  galleryHeader: {
    marginBottom: 12,
  },
  galleryHeaderText: {
    color: '#e0e0e0',
    fontSize: 14,
    fontWeight: 600,
  },
  emptyState: {
    display: 'flex',
    justifyContent: 'center',
    padding: '50px 0',
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
  },
  galleryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 4,
  },
  galleryItem: {
    position: 'relative',
    aspectRatio: '1 / 1',
    cursor: 'pointer',
    overflow: 'hidden',
    borderRadius: 4,
    backgroundColor: '#0d0d0d',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  videoIndicator: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  mediaModalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  mediaModalContent: {
    position: 'relative',
    maxWidth: '90vw',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  mediaModalClose: {
    position: 'absolute',
    top: -40,
    right: 0,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  },
  mediaModalMenuBtn: {
    position: 'absolute',
    top: -40,
    right: 44,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  },
  mediaMenuBox: {
    position: 'absolute',
    top: -4,
    right: 44,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    overflow: 'hidden',
    border: '1px solid #333',
    zIndex: 10,
  },
  mediaMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontSize: 13,
  },
  mediaModalMedia: {
    maxWidth: '90vw',
    maxHeight: '70vh',
    borderRadius: 8,
    objectFit: 'contain',
  },
  mediaModalFooter: {
    marginTop: 14,
    width: '100%',
  },
  mediaModalStats: {
    display: 'flex',
    gap: 20,
    justifyContent: 'center',
  },
  mediaModalStatItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    color: '#e0e0e0',
    fontSize: 13,
  },
  mediaModalCaption: {
    color: '#ccc',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#0d0d0d',
    border: '1px solid #1a1a1a',
    borderRadius: 16,
    padding: 24,
    width: 420,
    maxWidth: '90vw',
    maxHeight: '85vh',
    overflowY: 'auto',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  modalTitle: {
    color: '#f0f0f0',
    fontSize: 18,
    fontWeight: 700,
    margin: 0,
  },
  modalCloseBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
  },
  fieldLabel: {
    display: 'block',
    color: '#999',
    fontSize: 12,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 10,
    padding: '10px 12px',
    color: '#f0f0f0',
    fontSize: 14,
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    boxSizing: 'border-box',
    marginBottom: 12,
    outline: 'none',
  },
  textArea: {
    resize: 'vertical',
    minHeight: 80,
  },
  privacyRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 0',
    borderTop: '1px solid #1a1a1a',
    marginTop: 4,
  },
  privacyLabel: {
    color: '#f0f0f0',
    fontSize: 14,
    fontWeight: 600,
    margin: 0,
  },
  privacySubtext: {
    color: '#888',
    fontSize: 12,
    margin: '3px 0 0 0',
  },
  switch: {
    width: 40,
    height: 22,
    borderRadius: 11,
    border: 'none',
    cursor: 'pointer',
    position: 'relative',
    padding: 2,
    transition: 'background-color 0.15s ease',
  },
  switchThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    transition: 'transform 0.15s ease',
  },
  saveButton: {
    width: '100%',
    backgroundColor: '#52fa35',
    color: '#000',
    border: 'none',
    borderRadius: 10,
    padding: '12px 0',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 16,
  },
  changePasswordButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
    color: '#fff',
    border: '1px solid #2a2a2a',
    borderRadius: 10,
    padding: '12px 0',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 10,
  },
  logoutButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'transparent',
    color: '#ff4444',
    border: '1px solid rgba(255,68,68,0.3)',
    borderRadius: 10,
    padding: '12px 0',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 10,
  },
  passwordFieldContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  passwordEyeButton: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    padding: 4,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 13,
    marginBottom: 10,
  },
};
