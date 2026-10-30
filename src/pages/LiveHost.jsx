// src/pages/LiveHost.jsx
// Transmitir uma live (modo Criador): backstage -> ao vivo -> encerrar.
// Inclui compartilhar a tela.
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { StreamVideo, StreamCall, BackgroundFiltersProvider } from '@stream-io/video-react-sdk';
import { db, auth } from '../firebase';
import { useLiveSession } from '../lib/stream';
import { useLiveDoc, useLiveMessages, usePrizeClock, useRemainingSeconds } from '../lib/liveHooks';
import {
  DRAW_COUNTDOWN_SECONDS, prepareGoLive, refundGuarantee, markLiveStarted, finalizeLive, executePrizeDraw, deleteLive,
} from '../lib/liveLogic';
import { LiveStage, HostControls } from '../components/LiveStage';
import LiveChat from '../components/LiveChat';
import BackgroundEffects from '../components/BackgroundEffects';
import { LiveTopBar, LiveInfo, DrawCountdown, WinnerCard } from '../components/LiveOverlays';

// Recorte do fundo: modelo "selfie_segmenter" (mais preciso que o padrão "landscape")
// e máscara um pouco mais generosa, que acompanha melhor quando você se mexe.
// Ajuste fino: smoothingFactor (0-1, maior = acompanha mais rápido, pode tremer) e
// smoothstepMin/Max (menores = mantém mais de você na imagem).
const SEGMENTER_MODEL =
  'https://unpkg.com/@stream-io/video-filters-web@0.10.0/mediapipe/models/selfie_segmenter.tflite';
const SEGMENTATION_OPTIONS = { smoothingFactor: 0.9, smoothstepMin: 0.45, smoothstepMax: 0.8 };

// Abas do painel da direita (para criar novas ferramentas, é só acrescentar aqui)
const PANEL_TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'fundos', label: 'Fundos' },
];

export default function LiveHost() {
  const { liveId } = useParams();
  const navigate = useNavigate();
  const uid = auth.currentUser?.uid;

  const { loading, live, notFound, error } = useLiveDoc(liveId);
  const messages = useLiveMessages(liveId);

  const [me, setMe] = useState({ name: '', photo: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [panelTab, setPanelTab] = useState('chat');

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
      try {
        await session.call.goLive();
      } catch (goLiveErr) {
        console.error('[LiveHost] erro ao sair do backstage:', goLiveErr);
        // Já cobrou a garantia? Devolve, para não deixar o criador sem live e sem dinheiro
        if (prep.guaranteeAmount > 0) {
          try {
            await refundGuarantee(liveId, prep.guaranteeAmount, prep.title);
            setNotice('Não foi possível iniciar a transmissão. O valor da garantia foi estornado.');
          } catch (refundErr) {
            console.error('[LiveHost] erro ao estornar garantia:', refundErr);
            setNotice('Não foi possível iniciar a transmissão e o estorno da garantia falhou. Fale com o suporte.');
          }
        } else {
          setNotice('Não foi possível iniciar a transmissão. Tente novamente.');
        }
        return;
      }
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
      <>
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
      </>
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

  const page = (
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
        <div style={styles.tabBar}>
          {PANEL_TABS.map((t) => (
            <button key={t.id} type="button" style={styles.tabBtn(panelTab === t.id)} onClick={() => setPanelTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ ...styles.pane, display: panelTab === 'chat' ? 'block' : 'none' }}>
          <LiveChat liveId={liveId} userName={me.name} messages={messages} disabled={live.commentsEnabled === false} />
        </div>
        <div style={{ ...styles.pane, display: panelTab === 'fundos' ? 'block' : 'none', overflowY: 'auto' }}>
          {session.status === 'ready' ? (
            <BackgroundEffects />
          ) : (
            <p style={{ ...styles.muted, padding: 14 }}>Os fundos ficam disponíveis quando a câmera iniciar.</p>
          )}
        </div>
      </div>
    </div>
  );

  // Os efeitos de fundo precisam do mesmo "contexto" da câmera: envolvem a página inteira
  if (session.status !== 'ready') return page;
  return (
    <StreamVideo client={session.client}>
      <StreamCall call={session.call}>
        <BackgroundFiltersProvider
          modelFilePath={SEGMENTER_MODEL}
          segmentationOptions={SEGMENTATION_OPTIONS}
          onError={(err) => console.error('[LiveHost] efeito de fundo:', err)}
        >
          {page}
        </BackgroundFiltersProvider>
      </StreamCall>
    </StreamVideo>
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
  chatCol: { minHeight: 0, display: 'flex', flexDirection: 'column' },
  tabBar: { display: 'flex', gap: 6, marginBottom: 10, flexShrink: 0 },
  tabBtn: (active) => ({
    flex: 1,
    padding: '9px 0',
    borderRadius: 10,
    border: active ? '1px solid #52fa35' : '1px solid #1a1a1a',
    backgroundColor: active ? 'rgba(82, 250, 53, 0.1)' : '#0d0d0d',
    color: active ? '#52fa35' : '#aaa',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }),
  pane: { flex: 1, minHeight: 0 },
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
