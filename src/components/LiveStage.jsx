// src/components/LiveStage.jsx
// Vídeo da live (espectador e criador) + botões de controle do criador.
// Precisa estar dentro de <StreamVideo><StreamCall>.
import React, { useState } from 'react';
import {
  ParticipantView,
  useCallStateHooks,
  useCall,
  hasScreenShare,
  hasVideo,
} from '@stream-io/video-react-sdk';
import '@stream-io/video-react-sdk/dist/css/styles.css';
import {
  Mic, MicOff, Video, VideoOff, ScreenShare, ScreenShareOff, Radio, Square, X, VideoOff as NoVideo,
} from 'lucide-react';

const GREEN = '#52fa35';

// A tela do SDK vem com tamanhos próprios; aqui forçamos a preencher o palco.
const STAGE_CSS = `
.uou-stage .str-video__participant-view { width:100%; height:100%; max-height:none; aspect-ratio:auto; background:#000; border-radius:0; }
.uou-stage .str-video__video { object-fit:contain; }
.uou-pip .str-video__participant-view { width:100%; height:100%; aspect-ratio:auto; border-radius:10px; }
.uou-pip .str-video__video { object-fit:cover; }
.uou-stage .str-video__participant-details, .uou-pip .str-video__participant-details,
.uou-stage .str-video__menu-container, .uou-pip .str-video__menu-container { display:none; }
`;

export function LiveStage({ hostId, isHost = false, waitingText = 'Aguardando transmissão...' }) {
  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants();
  const host = participants.find((p) => p.userId === hostId);

  const sharing = !!host && hasScreenShare(host);
  const cameraOn = !!host && hasVideo(host);

  let body;
  if (!host || (!sharing && !cameraOn)) {
    body = (
      <div style={styles.placeholder}>
        <NoVideo size={56} color="rgba(255,255,255,0.3)" />
        <p style={styles.placeholderText}>
          {!host ? waitingText : isHost ? 'Sua câmera está desligada' : 'O criador está com a câmera desligada'}
        </p>
      </div>
    );
  } else if (sharing) {
    body = (
      <>
        <ParticipantView participant={host} trackType="screenShareTrack" />
        {cameraOn && (
          <div className="uou-pip" style={styles.pip}>
            <ParticipantView participant={host} trackType="videoTrack" />
          </div>
        )}
      </>
    );
  } else {
    body = <ParticipantView participant={host} trackType="videoTrack" />;
  }

  return (
    <div className="uou-stage" style={styles.stage}>
      <style>{STAGE_CSS}</style>
      {body}
    </div>
  );
}

/** Botões do criador: microfone, câmera, compartilhar tela, ir ao vivo/encerrar. */
export function HostControls({ isBackstage, busy, onGoLive, onEnd, onCancel }) {
  const call = useCall();
  const { useMicrophoneState, useCameraState, useScreenShareState } = useCallStateHooks();
  const { isEnabled: micOn } = useMicrophoneState();
  const { isEnabled: camOn } = useCameraState();
  const { isEnabled: sharingOn } = useScreenShareState();
  const [shareError, setShareError] = useState('');

  const safe = async (fn, label) => {
    try {
      await fn();
    } catch (err) {
      console.error(`[live] ${label}:`, err);
    }
  };

  const toggleShare = async () => {
    if (!call) return;
    setShareError('');
    try {
      if (sharingOn) {
        await call.screenShare.disable();
      } else {
        call.screenShare.enableScreenShareAudio(); // inclui o áudio da aba, se o navegador oferecer
        await call.screenShare.enable();
      }
    } catch (err) {
      // fechar a janelinha de escolha do navegador não é erro de verdade
      if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') {
        console.error('[live] compartilhar tela:', err);
        setShareError('Não foi possível compartilhar a tela. Verifique a permissão do navegador.');
      }
    }
  };

  return (
    <div style={styles.controlsWrap}>
      {shareError && <p style={styles.shareError}>{shareError}</p>}
      <div style={styles.controls}>
        <button
          type="button"
          style={styles.round(!micOn)}
          onClick={() => safe(() => call.microphone.toggle(), 'microfone')}
          title={micOn ? 'Desligar microfone' : 'Ligar microfone'}
        >
          {micOn ? <Mic size={22} /> : <MicOff size={22} />}
        </button>

        <button
          type="button"
          style={styles.round(!camOn)}
          onClick={() => safe(() => call.camera.toggle(), 'câmera')}
          title={camOn ? 'Desligar câmera' : 'Ligar câmera'}
        >
          {camOn ? <Video size={22} /> : <VideoOff size={22} />}
        </button>

        <button
          type="button"
          style={styles.shareBtn(sharingOn)}
          onClick={toggleShare}
          title={sharingOn ? 'Parar de compartilhar a tela' : 'Compartilhar a tela'}
        >
          {sharingOn ? <ScreenShareOff size={22} /> : <ScreenShare size={22} />}
          <span>{sharingOn ? 'Parar compartilhamento' : 'Compartilhar tela'}</span>
        </button>

        <div style={{ flex: 1 }} />

        {isBackstage && (
          <button type="button" style={styles.textBtn} onClick={onCancel} disabled={busy}>
            <X size={18} /> Cancelar
          </button>
        )}

        {isBackstage ? (
          <button type="button" style={styles.goLiveBtn(busy)} onClick={onGoLive} disabled={busy}>
            <Radio size={20} /> {busy ? 'Iniciando...' : 'Entrar ao vivo'}
          </button>
        ) : (
          <button type="button" style={styles.endBtn(busy)} onClick={onEnd} disabled={busy}>
            <Square size={18} fill="#fff" /> {busy ? 'Encerrando...' : 'Encerrar live'}
          </button>
        )}
      </div>
    </div>
  );
}

const styles = {
  stage: {
    position: 'relative',
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
    borderRadius: 14,
    overflow: 'hidden',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  placeholderText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, margin: 0 },
  pip: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 200,
    height: 120,
    borderRadius: 10,
    overflow: 'hidden',
    border: '2px solid rgba(255,255,255,0.25)',
    backgroundColor: '#000',
    zIndex: 3,
  },
  controlsWrap: { marginTop: 14 },
  shareError: { color: '#ff4444', fontSize: 12, margin: '0 0 8px 0' },
  controls: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  round: (off) => ({
    width: 46,
    height: 46,
    borderRadius: '50%',
    border: '1px solid #2a2a2a',
    backgroundColor: off ? '#3a1111' : '#1a1a1a',
    color: off ? '#ff6b6b' : '#f0f0f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  }),
  shareBtn: (on) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    height: 46,
    padding: '0 16px',
    borderRadius: 23,
    border: on ? `1px solid ${GREEN}` : '1px solid #2a2a2a',
    backgroundColor: on ? 'rgba(82,250,53,0.12)' : '#1a1a1a',
    color: on ? GREEN : '#f0f0f0',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }),
  textBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 46,
    padding: '0 14px',
    borderRadius: 12,
    border: '1px solid #2a2a2a',
    backgroundColor: 'transparent',
    color: '#bbb',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  goLiveBtn: (busy) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    height: 46,
    padding: '0 22px',
    borderRadius: 12,
    border: busy ? '1px solid #1a1a1a' : `1px solid ${GREEN}`,
    backgroundColor: busy ? '#1a1a1a' : 'rgba(82, 250, 53, 0.1)',
    color: busy ? '#555' : GREEN,
    fontSize: 15,
    fontWeight: 800,
    cursor: busy ? 'default' : 'pointer',
    fontFamily: 'inherit',
  }),
  endBtn: (busy) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    height: 46,
    padding: '0 22px',
    borderRadius: 12,
    border: 'none',
    backgroundColor: busy ? '#1a1a1a' : '#e5262b',
    color: '#fff',
    fontSize: 15,
    fontWeight: 800,
    cursor: busy ? 'default' : 'pointer',
    fontFamily: 'inherit',
  }),
};
