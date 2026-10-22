// src/pages/LiveHost.jsx
// Transmitir uma live (modo Criador): backstage -> ao vivo -> encerrar.
// Inclui compartilhar a tela.
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { StreamVideo, StreamCall } from '@stream-io/video-react-sdk';
import { db, auth } from '../firebase';
import { useLiveSession } from '../lib/stream';
import { useLiveDoc, useLiveMessages, usePrizeClock, useRemainingSeconds } from '../lib/liveHooks';
import {
  DRAW_COUNTDOWN_SECONDS, prepareGoLive, markLiveStarted, finalizeLive, executePrizeDraw, deleteLive,
} from '../lib/liveLogic';
import { LiveStage, HostControls } from '../components/LiveStage';
import LiveChat from '../components/LiveChat';
import { LiveTopBar, LiveInfo, DrawCountdown, WinnerCard } from '../components/LiveOverlays';

export default function LiveHost() {
  const { liveId } = useParams();
  const navigate = useNavigate();
  const uid = auth.currentUser?.uid;

  const { loading, live, notFound, error } = useLiveDoc(liveId);
  const messages = useLiveMessages(liveId);

  const [me, setMe] = useState({ name: '', photo: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

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
  const isOwner = !!live && live.userId === uid;
  const isBackstage = status !== 'live';

  const session = useLiveSession({
    liveId,
    role: 'host',
    enabled: isOwner && !!status && status !== 'ended',
    userName: me.name,
    userImage: me.photo,
  });

  const remaining = useRemainingSeconds(live);
  const clock = usePrizeClock(live);

  const finishLive = async () => {
    await finalizeLive(liveId);
    // Fecha a sala no GetStream (evita custo com a sala aberta)
    try {
      await session.call?.endCall();
    } catch (err) {
      console.warn('[LiveHost] não foi possível fechar a sala:', err?.message);
    }
  };
  const finishRef = useRef(finishLive);
  finishRef.current = finishLive;

  // Relógios que dependem do navegador do criador: fim automático da live e
  // sorteio. Se o criador recarregar a página, tudo é recalculado do documento.
  const startedAt = live?.startedAt;
  const duration = live?.duration;
  const isPremium = live?.isPremium;
  const prizeDrawAt = live?.prizeDrawAt;
  const prizeDrawnAt = live?.prizeDrawnAt;
  useEffect(() => {
    if (!isOwner || status !== 'live' || !startedAt) return undefined;
    const timers = [];

    if (duration) {
      const endAt = new Date(startedAt).getTime() + duration * 60 * 1000;
      timers.push(
        setTimeout(() => {
          finishRef.current().then(() => navigate('/postar')).catch(() => {});
        }, Math.max(0, endAt - Date.now()))
      );
    }
    if (isPremium && prizeDrawAt && !prizeDrawnAt) {
      const drawAt = new Date(prizeDrawAt).getTime() + DRAW_COUNTDOWN_SECONDS * 1000;
      timers.push(setTimeout(() => executePrizeDraw(liveId), Math.max(0, drawAt - Date.now())));
    }
    return () => timers.forEach(clearTimeout);
  }, [isOwner, status, startedAt, duration, isPremium, prizeDrawAt, prizeDrawnAt, liveId, navigate]);

  // Avisa antes de fechar a aba com a live no ar
  useEffect(() => {
    if (!isOwner || status !== 'live') return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isOwner, status]);

  const handleGoLive = async () => {
    if (busy || !session.call) return;
    setBusy(true);
    setNotice('');
    try {
      const prep = await prepareGoLive(liveId);
      if (!prep.ok) {
        setNotice(prep.message);
        return; // continua no backstage, nada foi cobrado
      }
      await session.call.goLive();
      await markLiveStarted(liveId);
    } catch (err) {
      console.error('[LiveHost] erro ao ir ao vivo:', err);
      setNotice('Não foi possível iniciar a transmissão. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  const handleEnd = async () => {
    if (busy) return;
    if (!window.confirm('Tem certeza que deseja encerrar a transmissão?')) return;
    setBusy(true);
    setNotice('');
    try {
      await finishLive();
      navigate('/postar');
    } catch (err) {
      console.error('[LiveHost] erro ao encerrar:', err);
      setNotice('Não foi possível encerrar a live. Tente novamente.');
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (busy) return;
    if (!window.confirm('Deseja cancelar esta transmissão?')) return;
    setBusy(true);
    try {
      // Live criada agora (ainda não agendada) some; a agendada continua
      if (status === 'preparing') await deleteLive(liveId);
    } catch (err) {
      console.error('[LiveHost] erro ao cancelar:', err);
    }
    navigate('/postar');
  };

  // ---------------------------------------------------------------- telas
  if (loading) return <Message text="Carregando live..." />;
  if (error) return <Message text="Não foi possível abrir esta live." />;
  if (notFound) return <Message text="Esta live não existe mais." />;
  if (!isOwner) return <Message text="Só o criador pode transmitir esta live." />;
  if (status === 'ended') return <Message text="Esta live já foi encerrada." />;

  const overlays = (
    <>
      <DrawCountdown value={clock.countdown} />
      <WinnerCard name={live.winnerName} />
    </>
  );

  let body;
  if (session.status === 'ready') {
    body = (
      <StreamVideo client={session.client}>
        <StreamCall call={session.call}>
          <div style={styles.stageBox}>
            <LiveStage hostId={uid} isHost />
            {overlays}
          </div>
          <HostControls
            isBackstage={isBackstage}
            busy={busy}
            onGoLive={handleGoLive}
            onEnd={handleEnd}
            onCancel={handleCancel}
          />
        </StreamCall>
      </StreamVideo>
    );
  } else if (session.status === 'error') {
    body = (
      <div style={styles.stageBox}>
        <div style={styles.stageMsg}>
          <p style={styles.error}>
            Não foi possível iniciar a câmera/transmissão: {session.error?.message || 'erro desconhecido'}
          </p>
          <button type="button" style={styles.ghostBtn} onClick={() => window.location.reload()}>
            Tentar de novo
          </button>
        </div>
      </div>
    );
  } else {
    body = (
      <div style={styles.stageBox}>
        <div style={styles.stageMsg}>
          <p style={styles.muted}>Iniciando sua live...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.main}>
        <LiveTopBar remainingSeconds={remaining} viewers={live.viewers} backstage={isBackstage} />

        {body}

        {session.deviceError && <p style={styles.error}>{session.deviceError}</p>}
        {notice && <p style={styles.error}>{notice}</p>}
        {isBackstage && session.status === 'ready' && (
          <p style={styles.hint}>
            Você está no backstage: ninguém te vê ainda. Ajuste câmera e microfone e, se quiser, já compartilhe a
            tela. Quando estiver pronto, clique em “Entrar ao vivo”.
          </p>
        )}

        <LiveInfo live={live} clock={clock} />
      </div>

      <div style={styles.chatCol}>
        <LiveChat liveId={liveId} userName={me.name} messages={messages} />
      </div>
    </div>
  );
}

function Message({ text }) {
  return (
    <div style={styles.centerPage}>
      <div style={styles.msgBox}>
        <p style={styles.muted}>{text}</p>
        <Link to="/postar" style={styles.link}>Voltar para Postar</Link>
      </div>
    </div>
  );
}

const styles = {
  page: {
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 340px',
    gap: 20,
    height: 'calc(100vh - 200px)',
    minHeight: 460,
    maxWidth: 1300,
    margin: '0 auto',
  },
  main: { display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflowY: 'auto' },
  stageBox: {
    position: 'relative',
    flex: 1,
    minHeight: 260,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
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
  centerPage: {
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    display: 'flex',
    justifyContent: 'center',
    paddingTop: 40,
  },
  msgBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' },
  muted: { color: '#888', fontSize: 14, margin: 0 },
  error: { color: '#ff4444', fontSize: 13, margin: '10px 0 0 0' },
  hint: { color: '#8a8a8a', fontSize: 13, lineHeight: 1.5, margin: '12px 0 0 0' },
  link: { color: '#52fa35', fontSize: 14, fontWeight: 600, textDecoration: 'none' },
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
