// src/components/LiveForm.jsx
// Aba "Live" dentro de Postar (modo Criador): criar/agendar uma live e retomar
// lives que ficaram em andamento, agendadas ou em preparo.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { Radio, Trash2, ImagePlus, X } from 'lucide-react';
import { db, auth } from '../firebase';
import {
  LIVE_CATEGORIES, LIVE_DURATIONS, brl, parseMoney, calcShares, getLiveConfig,
  DEFAULT_LIVE_CONFIG, createLive, deleteLive,
} from '../lib/liveLogic';

const GREEN = '#52fa35';
const GOLD = '#FFD700';

export default function LiveForm() {
  const navigate = useNavigate();
  const uid = auth.currentUser?.uid;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Turismo');
  const [duration, setDuration] = useState('30');
  const [isPremium, setIsPremium] = useState(false);
  const [prizeSource, setPrizeSource] = useState('pot');
  const [prizePercent, setPrizePercent] = useState('50');
  const [prizeAmount, setPrizeAmount] = useState('');
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [teaserFile, setTeaserFile] = useState(null);
  const [teaserPreview, setTeaserPreview] = useState('');

  const [config, setConfig] = useState(DEFAULT_LIVE_CONFIG);
  const [wallet, setWallet] = useState(0);
  const [myLives, setMyLives] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    getLiveConfig().then(setConfig);
    if (!uid) return undefined;
    getDoc(doc(db, 'users', uid))
      .then((snap) => setWallet(snap.data()?.wallet || 0))
      .catch(() => {});
    const unsub = onSnapshot(
      query(collection(db, 'lives'), where('userId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((l) => ['live', 'scheduled', 'preparing'].includes(l.status))
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setMyLives(list);
      },
      (err) => console.error('[LiveForm] erro ao listar lives:', err)
    );
    return unsub;
  }, [uid]);

  useEffect(() => () => {
    if (teaserPreview) URL.revokeObjectURL(teaserPreview);
  }, [teaserPreview]);

  const pickTeaser = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');

    const apply = () => {
      setTeaserFile(file);
      setTeaserPreview(URL.createObjectURL(file));
    };

    if (file.type.startsWith('video')) {
      const url = URL.createObjectURL(file);
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        if (probe.duration > 10.5) {
          setError('O vídeo do teaser pode ter no máximo 10 segundos.');
        } else {
          apply();
        }
      };
      probe.onerror = () => {
        URL.revokeObjectURL(url);
        setError('Não foi possível ler esse vídeo.');
      };
      probe.src = url;
    } else {
      apply();
    }
  };

  const clearTeaser = () => {
    setTeaserFile(null);
    setTeaserPreview('');
  };

  const priceValue = parseMoney(price);
  const creatorPerViewer = priceValue > 0 ? calcShares(priceValue, config).creatorValue : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const result = await createLive(
        {
          title, description, price, category, duration, isPremium,
          prizeSource, prizeAmount, prizePercent, isScheduled, scheduledAt, teaserFile,
          commentsEnabled,
        },
        wallet
      );
      if (result.scheduled) {
        setSuccess('Live agendada com sucesso! Seus seguidores foram avisados.');
        setTitle('');
        setDescription('');
        setPrice('');
        setIsScheduled(false);
        setScheduledAt('');
        clearTeaser();
      } else {
        navigate(`/transmitir/${result.id}`);
      }
    } catch (err) {
      console.error('[LiveForm] erro ao criar live:', err);
      setError(err.message || 'Não foi possível criar a live.');
    } finally {
      setSaving(false);
    }
  };

  const removePending = async (live) => {
    if (!window.confirm(`Excluir a live "${live.title}"?`)) return;
    try {
      await deleteLive(live.id);
    } catch (err) {
      console.error('[LiveForm] erro ao excluir live:', err);
      setError('Não foi possível excluir a live.');
    }
  };

  const minDateTime = (() => {
    const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  })();

  return (
    <div>
      {/* Lives em andamento / agendadas / em preparo */}
      {myLives.length > 0 && (
        <div style={styles.pendingBox}>
          <p style={styles.pendingTitle}>Suas lives</p>
          {myLives.map((live) => (
            <div key={live.id} style={styles.pendingRow}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={styles.pendingName}>{live.title}</p>
                <p style={styles.pendingMeta}>
                  {live.status === 'live' && 'No ar agora'}
                  {live.status === 'scheduled' &&
                    `Agendada para ${new Date(live.scheduledDate).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
                  {live.status === 'preparing' && 'Em preparo (não foi ao ar)'}
                </p>
              </div>
              <button type="button" style={styles.smallPrimary} onClick={() => navigate(`/transmitir/${live.id}`)}>
                <Radio size={15} /> {live.status === 'live' ? 'Continuar' : 'Iniciar'}
              </button>
              {live.status !== 'live' && (
                <button type="button" style={styles.iconBtn} onClick={() => removePending(live)} aria-label="Excluir live">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {error && <p style={styles.error}>{error}</p>}
        {success && <p style={styles.success}>{success}</p>}

        <Field label="Título da live">
          <input
            style={styles.input}
            placeholder="Ex: Passeio por Paris"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 100))}
          />
        </Field>

        <Field label="Descrição">
          <textarea
            style={{ ...styles.input, resize: 'vertical' }}
            rows={3}
            placeholder="Conte mais sobre sua live..."
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 500))}
          />
        </Field>

        <Field label="Preço (R$)">
          <input
            style={styles.input}
            inputMode="decimal"
            placeholder="10,00"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.,]/g, ''))}
          />
          {creatorPerViewer > 0 && (
            <div style={styles.earnBox}>
              <strong style={{ color: GREEN, fontSize: 13 }}>
                Você receberá {brl(creatorPerViewer)} por espectador
              </strong>
              <span style={{ color: '#666', fontSize: 11 }}>Após descontos operacionais</span>
            </div>
          )}
        </Field>

        {/* Live premiada */}
        <div style={{ marginBottom: 20 }}>
          <div style={styles.switchRow}>
            <div>
              <p style={styles.label}>Live Premiada</p>
              <p style={styles.sub}>Sorteie um prêmio para os espectadores</p>
            </div>
            <Switch on={isPremium} onChange={setIsPremium} label="Live premiada" />
          </div>

          {isPremium && (
            <div style={styles.prizeBox}>
              <p style={{ color: GOLD, fontSize: 13, fontWeight: 700, margin: '0 0 12px 0' }}>De onde vem o prêmio?</p>

              <Radio2 checked={prizeSource === 'pot'} onClick={() => setPrizeSource('pot')} label="% do pote da live" />
              {prizeSource === 'pot' && (
                <div style={{ margin: '0 0 12px 30px' }}>
                  <p style={styles.sub}>Percentual do pote para o prêmio</p>
                  <input
                    style={styles.input}
                    inputMode="decimal"
                    value={prizePercent}
                    onChange={(e) => setPrizePercent(e.target.value.replace(/[^0-9.,]/g, ''))}
                  />
                  <p style={{ ...styles.sub, marginTop: 6 }}>
                    Ao entrar ao vivo, {brl(priceValue)} saem da sua carteira como garantia do prêmio mínimo
                    (o que não for usado volta pra você).
                  </p>
                </div>
              )}

              <Radio2 checked={prizeSource === 'wallet'} onClick={() => setPrizeSource('wallet')} label="Da minha carteira" />
              {prizeSource === 'wallet' && (
                <div style={{ marginLeft: 30 }}>
                  <p style={styles.sub}>
                    Saldo disponível: <span style={{ color: GREEN }}>{brl(wallet)}</span>
                  </p>
                  <p style={{ ...styles.sub, margin: '4px 0 6px 0' }}>
                    O valor do prêmio fica travado na sua carteira ao entrar ao vivo.
                  </p>
                  <input
                    style={styles.input}
                    inputMode="decimal"
                    placeholder="Valor do prêmio"
                    value={prizeAmount}
                    onChange={(e) => setPrizeAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <Field label="Categoria">
          <div style={styles.chips}>
            {LIVE_CATEGORIES.map((cat) => (
              <button key={cat} type="button" style={styles.chip(category === cat)} onClick={() => setCategory(cat)}>
                {cat}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Duração estimada">
          <div style={styles.chips}>
            {LIVE_DURATIONS.map((d) => (
              <button key={d.value} type="button" style={styles.chip(duration === d.value)} onClick={() => setDuration(d.value)}>
                {d.label}
              </button>
            ))}
          </div>
          <p style={{ ...styles.sub, marginTop: 8 }}>A live é encerrada automaticamente quando esse tempo acaba.</p>
        </Field>

        <div style={{ ...styles.switchRow, marginBottom: 20 }}>
          <div>
            <p style={styles.label}>Comentários</p>
            <p style={styles.sub}>{commentsEnabled ? 'Os espectadores podem comentar' : 'Comentários desativados'}</p>
          </div>
          <Switch on={commentsEnabled} onChange={setCommentsEnabled} label="Comentários" />
        </div>

        <div style={{ ...styles.switchRow, marginBottom: 16 }}>
          <p style={styles.label}>Agendar para depois</p>
          <Switch on={isScheduled} onChange={setIsScheduled} label="Agendar" />
        </div>
        {isScheduled && (
          <Field label="Data e hora">
            <input
              type="datetime-local"
              style={{ ...styles.input, colorScheme: 'dark' }}
              min={minDateTime}
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </Field>
        )}

        {/* Thumbnail / teaser */}
        <Field label="Thumbnail ou teaser da live">
          <p style={{ ...styles.sub, margin: '0 0 8px 0' }}>Escolha uma imagem ou um vídeo de até 10 segundos</p>
          {teaserPreview ? (
            <div style={styles.teaserPreview}>
              {teaserFile?.type.startsWith('video') ? (
                <video src={teaserPreview} style={styles.teaserMedia} muted controls />
              ) : (
                <img src={teaserPreview} alt="" style={styles.teaserMedia} />
              )}
              <button type="button" style={styles.teaserRemove} onClick={clearTeaser} aria-label="Remover teaser">
                <X size={14} color="#fff" />
              </button>
            </div>
          ) : (
            <label style={styles.teaserPick}>
              <ImagePlus size={20} color="#f0f0f0" />
              <span style={{ color: '#f0f0f0', fontSize: 14, fontWeight: 600 }}>Escolher imagem ou vídeo</span>
              <input type="file" accept="image/*,video/*" onChange={pickTeaser} style={styles.hiddenInput} />
            </label>
          )}
        </Field>

        <button type="submit" style={styles.submit(saving)} disabled={saving}>
          {saving ? 'Criando...' : isScheduled ? 'Agendar live' : 'Iniciar live'}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={styles.label}>{label}</p>
      {children}
    </div>
  );
}

function Switch({ on, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      style={{
        width: 50,
        height: 28,
        borderRadius: 14,
        border: 'none',
        padding: '0 3px',
        backgroundColor: on ? GREEN : '#333',
        display: 'flex',
        alignItems: 'center',
        justifyContent: on ? 'flex-end' : 'flex-start',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <span style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: '#fff' }} />
    </button>
  );
}

function Radio2({ checked, onClick, label }) {
  return (
    <button type="button" onClick={onClick} style={styles.radioRow}>
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: `2px solid ${checked ? GREEN : '#555'}`,
          backgroundColor: checked ? GREEN : 'transparent',
          flexShrink: 0,
        }}
      />
      <span style={{ color: '#fff', fontSize: 14 }}>{label}</span>
    </button>
  );
}

const styles = {
  label: { color: '#f0f0f0', fontSize: 14, fontWeight: 600, margin: '0 0 8px 0' },
  sub: { color: '#777', fontSize: 12, margin: 0 },
  input: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 12,
    padding: 14,
    color: '#f0f0f0',
    fontSize: 14,
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    boxSizing: 'border-box',
    outline: 'none',
  },
  error: { color: '#ff4444', fontSize: 13, lineHeight: 1.5, marginBottom: 14 },
  success: { color: GREEN, fontSize: 13, marginBottom: 14 },
  earnBox: {
    marginTop: 8,
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    backgroundColor: 'rgba(82,250,53,0.08)',
    border: '1px solid rgba(82,250,53,0.2)',
    borderRadius: 8,
  },
  switchRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  prizeBox: {
    marginTop: 12,
    padding: 14,
    backgroundColor: 'rgba(255,215,0,0.08)',
    border: '1px solid rgba(255,215,0,0.2)',
    borderRadius: 10,
  },
  radioRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'transparent',
    border: 'none',
    padding: 0,
    marginBottom: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: (active) => ({
    padding: '9px 16px',
    borderRadius: 20,
    border: active ? `1px solid ${GREEN}` : '1px solid #2a2a2a',
    backgroundColor: active ? 'rgba(82,250,53,0.12)' : '#1a1a1a',
    color: active ? GREEN : '#ccc',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }),
  teaserPick: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#1a1a1a',
    border: '1px dashed #3a3a3a',
    borderRadius: 12,
    padding: '22px 0',
    cursor: 'pointer',
  },
  hiddenInput: { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' },
  teaserPreview: {
    position: 'relative',
    width: 160,
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  teaserMedia: { width: '100%', height: '100%', objectFit: 'cover' },
  teaserRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: '50%',
    border: 'none',
    backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  submit: (busy) => ({
    width: '100%',
    border: busy ? '1px solid #1a1a1a' : `1px solid ${GREEN}`,
    borderRadius: 12,
    padding: '15px 0',
    fontSize: 15,
    fontWeight: 800,
    fontFamily: 'inherit',
    backgroundColor: busy ? '#1a1a1a' : 'rgba(82, 250, 53, 0.05)',
    color: busy ? '#555' : GREEN,
    cursor: busy ? 'default' : 'pointer',
    marginBottom: 30,
  }),
  pendingBox: {
    padding: 16,
    marginBottom: 24,
    backgroundColor: '#0d0d0d',
    border: '1px solid #1a1a1a',
    borderRadius: 12,
  },
  pendingTitle: { color: '#f0f0f0', fontSize: 14, fontWeight: 700, margin: '0 0 10px 0' },
  pendingRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #1a1a1a' },
  pendingName: {
    color: '#f0f0f0',
    fontSize: 14,
    fontWeight: 600,
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  pendingMeta: { color: '#888', fontSize: 12, margin: '2px 0 0 0' },
  smallPrimary: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(82, 250, 53, 0.05)',
    color: GREEN,
    border: `1px solid ${GREEN}`,
    borderRadius: 10,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: '1px solid #2a2a2a',
    backgroundColor: '#1a1a1a',
    color: '#ff6b6b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
};
