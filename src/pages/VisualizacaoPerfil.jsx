import React, { useEffect, useState } from 'react';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Heart, MessageCircle, X, Play } from 'lucide-react';

// Mostra o perfil do criador exatamente como ele aparece pra quem visita —
// sem os botões de editar, configurações, trocar senha ou sair da conta
// (isso fica só na aba Perfil). Reaproveita a mesma leitura de dados.
export default function VisualizacaoPerfil() {
  const uid = auth.currentUser?.uid;

  const [userData, setUserData] = useState(null);
  const [galleryPosts, setGalleryPosts] = useState([]);
  const [selectedMedia, setSelectedMedia] = useState(null);

  useEffect(() => {
    if (!uid) return;
    const loadUserData = async () => {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) setUserData(userDoc.data());
    };
    loadUserData();
  }, [uid]);

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
        <h1 style={styles.pageTitle}>Visualização do Perfil</h1>
        <span style={styles.previewBadge}>Como os outros veem</span>
      </div>

      <div style={styles.profileSection}>
        <div style={styles.profileTopRow}>
          <div style={styles.photoColumn}>
            <img
              src={userData.photoURL || 'https://via.placeholder.com/120'}
              alt="Foto de perfil"
              style={styles.profilePhoto}
            />
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
            <div key={post.id} style={styles.galleryItem} onClick={() => setSelectedMedia(post)}>
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

      {selectedMedia && (
        <div style={styles.mediaModalOverlay} onClick={() => setSelectedMedia(null)}>
          <div style={styles.mediaModalContent} onClick={(e) => e.stopPropagation()}>
            <button style={styles.mediaModalClose} onClick={() => setSelectedMedia(null)}>
              <X size={26} color="#fff" />
            </button>

            {selectedMedia.mediaType === 'video' ? (
              <video src={selectedMedia.mediaUrl} controls autoPlay loop style={styles.mediaModalMedia} />
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
              {selectedMedia.caption && <p style={styles.mediaModalCaption}>{selectedMedia.caption}</p>}
            </div>
          </div>
        </div>
      )}
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
  previewBadge: {
    color: '#52fa35',
    fontSize: 12,
    fontWeight: 600,
    backgroundColor: 'rgba(82,250,53,0.1)',
    padding: '5px 12px',
    borderRadius: 20,
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
  profilePhoto: {
    width: 84,
    height: 84,
    borderRadius: 42,
    objectFit: 'cover',
    border: '2px solid #52fa35',
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
};
