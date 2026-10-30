// src/components/LiveChat.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { sendLiveMessage } from '../lib/liveLogic';

// Cada pessoa ganha sempre a mesma cor (calculada a partir do id/nome)
const NAME_COLORS = ['#52fa35', '#4da6ff', '#ffd700', '#ff7ac8', '#ff9f43', '#b388ff', '#2ee6d6', '#ff6b6b', '#c6f432', '#7fb8ff'];
const colorFor = (key) => {
  let h = 0;
  for (const ch of String(key || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length];
};

export default function LiveChat({ liveId, userName, messages, disabled = false }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending || disabled) return;
    setSending(true);
    try {
      await sendLiveMessage(liveId, userName, text);
      setText('');
    } catch (err) {
      console.error('[live] erro ao enviar mensagem:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={styles.box}>
      <div style={styles.title}>Chat da live</div>
      <div style={styles.list}>
        {messages.length === 0 && <p style={styles.empty}>Seja o primeiro a comentar.</p>}
        {messages.map((m) => (
          <p key={m.id} style={styles.msg}>
            <span style={{ ...styles.user, color: colorFor(m.userId || m.userName) }}>{m.userName || 'Usuário'}: </span>
            {m.text}
          </p>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} style={styles.form}>
        <input
          style={styles.input}
          placeholder={disabled ? 'Comentários desativados' : 'Mensagem...'}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          disabled={disabled}
        />
        <button
          type="submit"
          style={styles.send(!!text.trim() && !sending && !disabled)}
          disabled={!text.trim() || sending || disabled}
          aria-label="Enviar mensagem"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

const styles = {
  box: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    backgroundColor: '#0d0d0d',
    border: '1px solid #1a1a1a',
    borderRadius: 14,
    overflow: 'hidden',
  },
  title: {
    padding: '14px 16px',
    color: '#f0f0f0',
    fontSize: 14,
    fontWeight: 700,
    borderBottom: '1px solid #1a1a1a',
  },
  list: { flex: 1, overflowY: 'auto', padding: '10px 16px' },
  empty: { color: '#666', fontSize: 13 },
  msg: { color: '#ddd', fontSize: 13, lineHeight: 1.45, margin: '0 0 8px 0', wordBreak: 'break-word' },
  user: { color: '#52fa35', fontWeight: 700 },
  form: { display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #1a1a1a' },
  input: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 10,
    padding: '10px 12px',
    color: '#f0f0f0',
    fontSize: 14,
    outline: 'none',
    fontFamily: 'inherit',
  },
  send: (enabled) => ({
    width: 42,
    borderRadius: 10,
    border: 'none',
    backgroundColor: enabled ? '#52fa35' : '#1a1a1a',
    color: enabled ? '#000' : '#555',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: enabled ? 'pointer' : 'default',
  }),
};
