// src/pages/LiveViewer.jsx
// Assistir uma live: prévia grátis de 10s -> paywall -> pagamento -> vídeo + chat.
import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { StreamVideo, StreamCall } from '@stream-io/video-react-sdk';
import { ArrowLeft, Lock, CalendarClock, RadioTower } from 'lucide-react';
import { db, auth } from '../firebase';
import { useLiveSession } from '../lib/stream';
import { useLiveDoc, useLiveMessages, usePrizeClock, useRemainingSeconds } from '../lib/liveHooks';
import {
  PREVIEW_SECONDS, brl, getAccess, markPreviewed, payForLive, incrementViewers,
} from '../lib/liveLogic';
import { LiveStage } from '../components/LiveStage';
import LiveChat from '../components/LiveChat';
import { LiveTopBar, LiveInfo, DrawCountdown, WinnerCard } from '../components/LiveOverlays';

export default function LiveViewer() {
  const { liveId } = useParams();
  const navigate = useNavigate();
  const uid = auth.currentUser?.uid;

  const { loading, live, notFound, error } = useLiveDoc(liveId);
  const messages = useLiveMessages(liveId);

  const [me, setMe] = useState({ name: '', photo: '' });
  const [access, setAccess] = useState('checking'); // checking | free | preview | paywall | paid | error
  const [previewLeft, setPreviewLeft] = useState(PREVIEW_SECONDS);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [insufficient, setInsufficient] = useState(null);
  const [accessAttempt, setAccessAttempt] = useState(0);
  const checkedRef = useRef(-1);

  // Nome e foto do espectador (chat e identificação na call)
  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        const d = snap.data() || {};
        setMe({ name: d.name || '', photo: d.photoURL || '' });
      })
      .catch(() => {});
  }, [uid]);

  const status = live?.status;
  const price = live?.price || 0;
  const isOwner = !!live && live.userId === uid;

  // Verifica o acesso assim que a live estiver no ar
  useEffect(() => {
    if (!live || isOwner || status !== 'live') return;
    if (checkedRef.current === accessAttempt) return;
    checkedRef.current = accessAttempt;

    (async () => {
      if (price <= 0) {
        setAccess('free');
        return;
      }
      try {
        const acc = await getAccess(liveId, uid);
        if (acc?.hasPaid) setAccess('paid');
        else if (acc?.hasPreviewed) setAccess('paywall');
        else setAccess('preview');
      } catch (err) {
        console.error('[LiveViewer] erro ao verificar acesso:', err);
        setAccess('error');
      }
    })();
  }, [live, isOwner, status, price, liveId, uid, accessAttempt]);

  // Prévia grátis de 10s
  useEffect(() => {
    if (access !== 'preview') return undefined;
    let left = PREVIEW_SECONDS;
    setPreviewLeft(left);
    const id = setInterval(() => {
      left -= 1;
      setPreviewLeft(left);
      if (left <= 0) {
        clearInterval(id);
        markPreviewed(liveId, uid).catch((err) => console.error('[LiveViewer] erro ao marcar prévia:', err));
        setAccess('paywall');
      }
    }, 1000);
    return () => clearInterval(id);
  }, [access, liveId, uid]);

  const streamEnabled = ['free', 'preview', 'paid'].includes(access) && status === 'live' && !isOwner;
  const session = useLiveSession({
    liveId,
    role: 'viewer',
    enabled: streamEnabled,
    userName: me.name,
    userImage: me.photo,
  });

  // Contador de espectadores (só quem realmente entrou na call conta)
  const callRef = session.call;
  useEffect(() => {
    if (!callRef) return undefined;
    let undone = false;
    const added = incrementViewers(liveId, 1).then(() => true, () => false);
    const undo = () => {
      if (undone) return;
      undone = true;
      added.then((ok) => ok && incrementViewers(liveId, -1).catch(() => {}));
    };
    window.addEventListener('pagehide', undo);
    return () => {
      window.removeEventListener('pagehide', undo);
      undo();
    };
  }, [callRef, liveId]);

  const remaining = useRemainingSeconds(live);
  const clock = usePrizeClock(live);

  const handlePay = async () => {
    setPaying(true);
    setPayError('');
    try {
      const result = await payForLive({ liveId, liveTitle: live.title, liveOwnerId: live.userId });
      if (result.ok) {
        setInsufficient(null);
        setAccess('paid');
      } else {
        setInsufficient(result);
      }
    } catch (err) {
      console.error('[LiveViewer] erro no pagamento:', err);
      setPayError(err.message || 'Não foi possível processar o pagamento.');
    } finally {
      setPaying(false);
    }
  };

  // ---------------------------------------------------------------- telas
  if (loading) return <Message text="Carregando live..." />;
  if (error) return <Message text="Não foi possível abrir esta live." backTo="/lives" />;
  if (notFound) return <Message text="Esta live não existe mais." backTo="/lives" />;
  if (isOwner) return <Navigate to={`/transmitir/${liveId}`} replace />;

  if (status === 'ended') {
    return (
      <Message
        icon={<RadioTower size={36} color="#555" />}
        title="Live encerrada"
        text="Esta transmissão foi encerrada."
        backTo="/lives"
      />
    );
  }

  if (status !== 'live') {
    const when = live.scheduledDate
      ? new Date(live.scheduledDate).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : null;
    return (
      <Message
        icon={<CalendarClock size={36} color="#52fa35" />}
        title={live.title}
        text={when ? `Esta live começa em ${when}. A página abre sozinha quando ela entrar no ar.` : 'Esta live ainda não começou. A página abre sozinha quando ela entrar no ar.'}
        backTo="/lives"
      />
    );
  }

  if (access === 'checking') return <Message text="Verificando acesso..." />;

  if (access === 'error') {
    return (
      <Message
        text="Não foi possível verificar seu acesso a esta live."
        action={{ label: 'Tentar de novo', onClick: () => { setAccess('checking'); setAccessAttempt((n) => n + 1); } }}
        backTo="/lives"
      />
    );
  }

  if (access === 'paywall') {
    return (
      <div style={styles.centerPage}>
        <div style={styles.paywall}>
          <Lock size={34} color="#52fa35" />
          <h2 style={styles.paywallTitle}>Conteúdo pago</h2>
          <p style={styles.paywallLive}>{live.title}</p>
          <p style={styles.paywallPrice}>{brl(price)}</p>
          <p style={styles.muted}>Para assistir esta live</p>

          {insufficient && (
            <div style={styles.warn}>
              Saldo insuficiente. Você precisa de {brl(insufficient.price)} e tem {brl(insufficient.wallet)}.
              <br />
              <Link to="/carteira" style={styles.link}>Adicionar saldo</Link>
            </div>
          )}
          {payError && <p style={styles.error}>{payError}</p>}

          <button type="button" style={styles.payBtn(paying)} onClick={handlePay} disabled={paying}>
            {paying ? 'Processando...' : 'Pagar e entrar'}
          </button>
          <button type="button" style={styles.ghostBtn} onClick={() => navigate('/lives')}>
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.main}>
        <div style={styles.headRow}>
          <button type="button" style={styles.back} onClick={() => navigate('/lives')} aria-label="Voltar">
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1 }}>
            <LiveTopBar remainingSeconds={remaining} viewers={live.viewers} />
          </div>
        </div>

        <div style={styles.stageBox}>
          {session.status === 'ready' ? (
            <StreamVideo client={session.client}>
              <StreamCall call={session.call}>
                <LiveStage hostId={live.userId} />
              </StreamCall>
            </StreamVideo>
          ) : session.status === 'error' ? (
            <div style={styles.stageMsg}>
              <p style={styles.error}>Não foi possível conectar à live: {session.error?.message || 'erro desconhecido'}</p>
              <button type="button" style={styles.ghostBtn} onClick={() => window.location.reload()}>
                Tentar de novo
              </button>
            </div>
          ) : (
            <div style={styles.stageMsg}>
              <p style={styles.muted}>Conectando à live...</p>
            </div>
          )}

          {access === 'preview' && (
            <div style={styles.previewBadge}>Prévia grátis: {Math.max(previewLeft, 0)}s</div>
          )}
          <DrawCountdown value={clock.countdown} />
          <WinnerCard name={live.winnerName} />
        </div>

        <LiveInfo live={live} clock={clock} />
      </div>

      <div style={styles.chatCol}>
        <LiveChat liveId={liveId} userName={me.name} messages={messages} disabled={live.commentsEnabled === false} />
      </div>
    </div>
  );
}

function Message({ icon, title, text, backTo, action }) {
  return (
    <div style={styles.centerPage}>
      <div style={styles.msgBox}>
        {icon}
        {title && <h2 style={styles.paywallTitle}>{title}</h2>}
        <p style={styles.muted}>{text}</p>
        {action && (
          <button type="button" style={styles.payBtn(false)} onClick={action.onClick}>
            {action.label}
          </button>
        )}
        {backTo && (
          <Link to={backTo} style={styles.link}>Voltar para Lives</Link>
        )}
      </div>
    </div>
  );
}

const PAGE_H = 'calc(100vh - 200px)';

const styles = {
  page: {
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 340px',
    gap: 20,
    height: PAGE_H,
    minHeight: 420,
    maxWidth: 1300,
    margin: '0 auto',
  },
  main: { display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 },
  headRow: { display: 'flex', alignItems: 'center', gap: 12 },
  back: {
    width: 38,
    height: 38,
    borderRadius: 10,
    border: '1px solid #2a2a2a',
    backgroundColor: '#1a1a1a',
    color: '#f0f0f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    marginBottom: 10,
  },
  stageBox: { position: 'relative', flex: 1, minHeight: 0, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' },
  stageMsg: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
    textAlign: 'center',
  },
  chatCol: { minHeight: 0 },
  previewBadge: {
    position: 'absolute',
    top: 14,
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(0,0,0,0.75)',
    border: '1px solid #52fa35',
    color: '#52fa35',
    fontSize: 13,
    fontWeight: 700,
    borderRadius: 16,
    padding: '6px 14px',
    zIndex: 10,
  },
  centerPage: {
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    display: 'flex',
    justifyContent: 'center',
    paddingTop: 40,
  },
  msgBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    textAlign: 'center',
    maxWidth: 420,
  },
  paywall: {
    width: '100%',
    maxWidth: 400,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    textAlign: 'center',
    backgroundColor: '#0d0d0d',
    border: '1px solid #1a1a1a',
    borderRadius: 16,
    padding: 32,
  },
  paywallTitle: { color: '#f0f0f0', fontSize: 20, fontWeight: 700, margin: 0 },
  paywallLive: { color: '#ccc', fontSize: 15, margin: 0 },
  paywallPrice: { color: '#52fa35', fontSize: 30, fontWeight: 800, margin: '6px 0 0 0' },
  muted: { color: '#888', fontSize: 14, margin: 0 },
  error: { color: '#ff4444', fontSize: 13, margin: 0 },
  warn: {
    backgroundColor: 'rgba(255,215,0,0.08)',
    border: '1px solid rgba(255,215,0,0.25)',
    color: '#FFD700',
    borderRadius: 10,
    padding: '10px 12px',
    fontSize: 13,
    lineHeight: 1.5,
  },
  link: { color: '#52fa35', fontSize: 14, fontWeight: 600, textDecoration: 'none' },
  payBtn: (busy) => ({
    marginTop: 10,
    width: '100%',
    border: busy ? '1px solid #1a1a1a' : '1px solid #52fa35',
    borderRadius: 12,
    padding: '13px 0',
    fontSize: 15,
    fontWeight: 800,
    fontFamily: 'inherit',
    backgroundColor: busy ? '#1a1a1a' : 'rgba(82, 250, 53, 0.1)',
    color: busy ? '#555' : '#52fa35',
    cursor: busy ? 'default' : 'pointer',
  }),
  ghostBtn: {
    border: 'none',
    background: 'transparent',
    color: '#999',
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: 8,
  },
};
