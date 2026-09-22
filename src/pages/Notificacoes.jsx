import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Heart, MessageCircle, UserPlus, Bell } from 'lucide-react';

// ✅ Mesma lógica de data relativa usada no resto do site (e no App)
function timeAgo(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'agora mesmo';
  if (diffMins < 60) return `há ${diffMins}min`;
  if (diffHours < 24) return `há ${diffHours}h`;
  if (diffDays < 7) return `há ${diffDays}d`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function iconFor(type) {
  if (type === 'like') return { Icon: Heart, color: '#FF4444' };
  if (type === 'comment') return { Icon: MessageCircle, color: '#52fa35' };
  if (type === 'follow' || type === 'follow_request') return { Icon: UserPlus, color: '#52fa35' };
  return { Icon: Bell, color: '#ccc' };
}

export default function Notificacoes() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = [];
        snapshot.forEach((docSnap) => data.push({ id: docSnap.id, ...docSnap.data() }));
        setNotifications(data);
        setLoading(false);
      },
      (error) => {
        console.error('[Notificacoes] Erro ao carregar notificações:', error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const markAsRead = async (notification) => {
    if (notification.read) return;
    try {
      await updateDoc(doc(db, 'notifications', notification.id), { read: true });
    } catch (error) {
      console.error('[Notificacoes] Erro ao marcar como lida:', error);
    }
  };

  if (loading) {
    return <p style={styles.emptyText}>Carregando...</p>;
  }

  return (
    <div>
      <h1 style={styles.title}>Notificações</h1>

      {notifications.length === 0 ? (
        <p style={styles.emptyText}>Nenhuma notificação ainda.</p>
      ) : (
        <div style={styles.list}>
          {notifications.map((n) => {
            const { Icon, color } = iconFor(n.type);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => markAsRead(n)}
                style={{ ...styles.item, ...(n.read ? {} : styles.itemUnread) }}
              >
                <img
                  src={n.fromUserPhoto || 'https://via.placeholder.com/44'}
                  alt={n.fromUserName || ''}
                  style={styles.avatar}
                />
                <div style={styles.iconBadge}>
                  <Icon size={14} color={color} />
                </div>
                <div style={styles.textBlock}>
                  <p style={styles.text}>
                    <span style={styles.fromName}>{n.fromUserName || 'Alguém'}</span> {n.message}
                  </p>
                  <p style={styles.date}>{timeAgo(n.createdAt)}</p>
                </div>
                {!n.read && <span style={styles.dot} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#fff',
    margin: 0,
    marginBottom: '24px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxWidth: '560px',
  },
  item: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px',
    borderRadius: '12px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
  },
  itemUnread: {
    backgroundColor: 'rgba(82, 250, 53, 0.06)',
  },
  avatar: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
  },
  iconBadge: {
    marginLeft: '-30px',
    marginTop: '24px',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    backgroundColor: '#000',
    border: '1px solid #1a1a1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
  },
  text: {
    fontSize: '14px',
    color: '#f0f0f0',
    margin: 0,
    marginBottom: '4px',
  },
  fromName: {
    fontWeight: '700',
  },
  date: {
    fontSize: '12px',
    color: '#888',
    margin: 0,
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#52fa35',
    flexShrink: 0,
  },
  emptyText: {
    fontSize: '14px',
    color: '#666',
  },
};
