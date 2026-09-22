import React, { useEffect, useRef, useState } from 'react';
import {
  collection, query, where, orderBy, onSnapshot, doc, getDoc, addDoc,
  updateDoc, increment,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Send } from 'lucide-react';

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Agora';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function Chat() {
  const currentUserId = auth.currentUser?.uid;
  const [conversations, setConversations] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState(null); // { id, otherUser }

  // ✅ Lista de conversas — mesma lógica do ChatsScreen.js do App
  useEffect(() => {
    if (!currentUserId) return;

    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', currentUserId)
    );

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const convos = [];
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          const otherUserId = data.participants.find((id) => id !== currentUserId);
          let otherUserData = {};
          try {
            const otherUserDoc = await getDoc(doc(db, 'users', otherUserId));
            otherUserData = otherUserDoc.exists() ? otherUserDoc.data() : {};
          } catch (error) {
            console.error('[Chat] Erro ao carregar outro usuário:', error);
          }

          convos.push({
            id: docSnap.id,
            ...data,
            otherUser: {
              id: otherUserId,
              name: otherUserData.name || 'Usuário',
              photoURL: otherUserData.photoURL || null,
            },
            unreadCount: data.unreadCount?.[currentUserId] || 0,
          });
        }

        convos.sort((a, b) => new Date(b.lastMessageTime || 0) - new Date(a.lastMessageTime || 0));
        setConversations(convos);
        setLoadingList(false);
      },
      (error) => {
        console.error('[Chat] Erro ao carregar conversas:', error);
        setLoadingList(false);
      }
    );

    return unsubscribe;
  }, [currentUserId]);

  return (
    <div style={styles.wrap}>
      <aside style={styles.list}>
        <h2 style={styles.listTitle}>Mensagens</h2>
        {loadingList ? (
          <p style={styles.emptyText}>Carregando...</p>
        ) : conversations.length === 0 ? (
          <p style={styles.emptyText}>Nenhuma conversa ainda.</p>
        ) : (
          conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(c)}
              style={{
                ...styles.convoItem,
                ...(selected?.id === c.id ? styles.convoItemActive : {}),
              }}
            >
              <img
                src={c.otherUser.photoURL || 'https://via.placeholder.com/48'}
                alt={c.otherUser.name}
                style={styles.avatar}
              />
              <div style={styles.convoInfo}>
                <div style={styles.convoTopRow}>
                  <span style={styles.convoName}>{c.otherUser.name}</span>
                  <span style={styles.convoTime}>{formatTime(c.lastMessageTime)}</span>
                </div>
                <div style={styles.convoBottomRow}>
                  <span
                    style={{
                      ...styles.convoLastMessage,
                      ...(c.unreadCount > 0 ? styles.convoLastMessageUnread : {}),
                    }}
                  >
                    {c.lastMessage || 'Sem mensagens'}
                  </span>
                  {c.unreadCount > 0 && <span style={styles.badge}>{c.unreadCount}</span>}
                </div>
              </div>
            </button>
          ))
        )}
      </aside>

      <section style={styles.threadWrap}>
        {selected ? (
          <ChatThread
            conversationId={selected.id}
            otherUser={selected.otherUser}
            currentUserId={currentUserId}
          />
        ) : (
          <div style={styles.emptyThread}>
            <p style={styles.emptyText}>Selecione uma conversa</p>
          </div>
        )}
      </section>
    </div>
  );
}

function ChatThread({ conversationId, otherUser, currentUserId }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    const q = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMessages(msgs);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

        // ✅ Marca como lida qualquer mensagem do outro que chegou aberta
        snapshot.docs.forEach((d) => {
          const data = d.data();
          if (data.senderId !== currentUserId && data.read === false) {
            updateDoc(doc(db, 'conversations', conversationId, 'messages', d.id), { read: true }).catch(
              () => {}
            );
          }
        });
      },
      (error) => console.error('[Chat] Erro ao carregar mensagens:', error)
    );

    // ✅ Zera o contador de não lidas desse usuário ao abrir a conversa
    updateDoc(doc(db, 'conversations', conversationId), {
      [`unreadCount.${currentUserId}`]: 0,
    }).catch(() => {});

    return unsubscribe;
  }, [conversationId, currentUserId]);

  const sendMessage = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setText('');
    try {
      await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
        senderId: currentUserId,
        text: trimmed,
        createdAt: new Date().toISOString(),
        read: false,
      });
      await updateDoc(doc(db, 'conversations', conversationId), {
        lastMessage: trimmed,
        lastMessageTime: new Date().toISOString(),
        [`unreadCount.${otherUser.id}`]: increment(1),
      });
    } catch (error) {
      console.error('[Chat] Erro ao enviar mensagem:', error);
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={styles.thread}>
      <header style={styles.threadHeader}>
        <img
          src={otherUser.photoURL || 'https://via.placeholder.com/36'}
          alt={otherUser.name}
          style={styles.threadAvatar}
        />
        <span style={styles.threadName}>{otherUser.name}</span>
      </header>

      <div style={styles.messages}>
        {messages.length === 0 ? (
          <p style={styles.emptyText}>Nenhuma mensagem ainda. Envie a primeira!</p>
        ) : (
          messages.map((m) => {
            const isMe = m.senderId === currentUserId;
            return (
              <div key={m.id} style={{ ...styles.messageRow, ...(isMe ? styles.messageRowMe : {}) }}>
                <div style={{ ...styles.bubble, ...(isMe ? styles.bubbleMe : styles.bubbleOther) }}>
                  <p style={styles.bubbleText}>{m.text}</p>
                  <span style={styles.bubbleTime}>
                    {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form style={styles.inputRow} onSubmit={sendMessage}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Mensagem..."
          style={styles.input}
        />
        <button type="submit" style={styles.sendButton} disabled={sending || !text.trim()}>
          <Send size={18} color="#010208" />
        </button>
      </form>
    </div>
  );
}

const styles = {
  wrap: {
    display: 'flex',
    height: 'calc(100vh - 136px)',
    border: '1px solid #1a1a1a',
    borderRadius: '16px',
    overflow: 'hidden',
  },
  list: {
    width: '320px',
    flexShrink: 0,
    borderRight: '1px solid #1a1a1a',
    overflowY: 'auto',
    padding: '16px 0',
  },
  listTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#fff',
    margin: '0 20px 12px',
  },
  convoItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    padding: '12px 20px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
  },
  convoItemActive: {
    backgroundColor: 'rgba(82, 250, 53, 0.08)',
  },
  avatar: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
  },
  convoInfo: {
    flex: 1,
    minWidth: 0,
  },
  convoTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '4px',
  },
  convoName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#fff',
  },
  convoTime: {
    fontSize: '11px',
    color: '#888',
  },
  convoBottomRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },
  convoLastMessage: {
    fontSize: '13px',
    color: '#888',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  convoLastMessageUnread: {
    color: '#fff',
    fontWeight: '600',
  },
  badge: {
    backgroundColor: '#52fa35',
    color: '#010208',
    borderRadius: '10px',
    minWidth: '18px',
    height: '18px',
    fontSize: '11px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 5px',
    flexShrink: 0,
  },
  threadWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  emptyThread: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thread: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  threadHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 20px',
    borderBottom: '1px solid #1a1a1a',
  },
  threadAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  threadName: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#fff',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  messageRow: {
    display: 'flex',
    justifyContent: 'flex-start',
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '60%',
    padding: '10px 14px',
    borderRadius: '16px',
  },
  bubbleOther: {
    backgroundColor: '#1a1a1a',
    borderBottomLeftRadius: '4px',
  },
  bubbleMe: {
    backgroundColor: 'rgba(82, 250, 53, 0.18)',
    borderBottomRightRadius: '4px',
  },
  bubbleText: {
    fontSize: '14px',
    color: '#f0f0f0',
    margin: 0,
    marginBottom: '4px',
    wordBreak: 'break-word',
  },
  bubbleTime: {
    fontSize: '10px',
    color: '#999',
  },
  inputRow: {
    display: 'flex',
    gap: '10px',
    padding: '16px 20px',
    borderTop: '1px solid #1a1a1a',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    borderRadius: '20px',
    border: '1px solid #333',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
    fontFamily: 'inherit',
  },
  sendButton: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    border: 'none',
    backgroundColor: '#52fa35',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  emptyText: {
    fontSize: '14px',
    color: '#666',
    padding: '0 20px',
  },
};
