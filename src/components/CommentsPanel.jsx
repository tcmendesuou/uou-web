import React, { useState } from 'react';
import { X, Send, Trash2, MessageCircle, User } from 'lucide-react';
import { auth } from '../firebase';
import { usePostComments, sendPostComment, deletePostComment, commentTime } from '../lib/postActions';

// Janela de comentários do post (mesmos dados do app)
export default function CommentsPanel({ post, onClose }) {
  const comments = usePostComments(post.id, true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const uid = auth.currentUser?.uid;

  const send = async (e) => {
    e?.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    const t = text;
    setText('');
    try { await sendPostComment(post, t); } catch (err) { console.error(err); setText(t); }
    setSending(false);
  };

  const remove = async (id) => {
    if (!window.confirm('Apagar este comentário?')) return;
    try { await deletePostComment(post.id, id); } catch (err) { console.error(err); }
  };

  const n = comments?.length ?? post.commentsCount ?? 0;

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.head}>
          <strong>{n} {n === 1 ? 'comentário' : 'comentários'}</strong>
          <button type="button" style={s.close} onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </div>

        <div style={s.list}>
          {comments === null ? (
            <p style={s.empty}>Carregando...</p>
          ) : comments.length === 0 ? (
            <div style={s.emptyBox}>
              <MessageCircle size={44} color="#333" />
              <strong>Nenhum comentário ainda</strong>
              <span style={{ color: '#666', fontSize: 13 }}>Seja o primeiro a comentar!</span>
            </div>
          ) : comments.map((c) => (
            <div key={c.id} style={s.item}>
              {c.userPhoto
                ? <img src={c.userPhoto} alt="" style={s.avatar} />
                : <div style={{ ...s.avatar, ...s.avatarPh }}><User size={16} color="#666" /></div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div><span style={s.name}>{c.userName}</span><span style={s.time}>{commentTime(c.createdAt)}</span></div>
                <div style={s.text}>{c.text}</div>
              </div>
              {c.userId === uid && (
                <button type="button" style={s.del} onClick={() => remove(c.id)} aria-label="Apagar"><Trash2 size={16} /></button>
              )}
            </div>
          ))}
        </div>

        <form style={s.form} onSubmit={send}>
          <input
            style={s.input} placeholder="Adicionar comentário..." value={text} maxLength={500}
            onChange={(e) => setText(e.target.value)} disabled={sending} autoFocus
          />
          <button type="submit" disabled={!text.trim() || sending} style={{ ...s.send, ...(!text.trim() || sending ? s.sendOff : {}) }} aria-label="Enviar">
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}

const s = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { width: '100%', maxWidth: 480, height: '70vh', maxHeight: 640, background: '#000', border: '1px solid #1a1a1a', borderRadius: 16, display: 'flex', flexDirection: 'column', color: '#fff', fontFamily: 'inherit' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #1a1a1a', fontSize: 15 },
  close: { background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', display: 'flex' },
  list: { flex: 1, overflowY: 'auto', padding: 16 },
  empty: { color: '#666', textAlign: 'center', fontSize: 14 },
  emptyBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '40px 0' },
  item: { display: 'flex', gap: 12, marginBottom: 16 },
  avatar: { width: 32, height: 32, borderRadius: 16, objectFit: 'cover', flexShrink: 0 },
  avatarPh: { background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14, fontWeight: 600, marginRight: 8 },
  time: { fontSize: 12, color: '#666' },
  text: { fontSize: 14, lineHeight: '20px', marginTop: 2, wordBreak: 'break-word', whiteSpace: 'pre-wrap' },
  del: { background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', alignSelf: 'flex-start', padding: 4 },
  form: { display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #1a1a1a' },
  input: { flex: 1, background: '#1a1a1a', border: 'none', borderRadius: 20, padding: '10px 16px', color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'inherit' },
  send: { width: 40, height: 40, borderRadius: 20, border: '1px solid #52fa35', background: 'rgba(82,250,53,0.05)', color: '#52fa35', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  sendOff: { borderColor: '#222', color: '#555', background: '#111', cursor: 'default' },
};
