// src/lib/stream.js
// Conexão do UOU Web com o GetStream Video (lives).
// O token NUNCA é gerado aqui: vem da Cloud Function `generateStreamToken`
// (a mesma que o app já tem), que confere o login do Firebase e assina com o
// segredo guardado no servidor.
import { useEffect, useState } from 'react';
import { StreamVideoClient } from '@stream-io/video-react-sdk';
import { auth } from '../firebase';

export const STREAM_API_KEY = 'njgqxzu5mmpg'; // chave pública (a mesma do app)
const TOKEN_URL = 'https://us-central1-butter-1a8d4.cloudfunctions.net/generateStreamToken';

async function fetchStreamToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('Você precisa estar logado.');
  const idToken = await user.getIdToken();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    throw new Error(data.error || `Não foi possível obter o token da live (${res.status})`);
  }
  return data.token;
}

// Uma "sessão" = cliente + call de uma live. Fica num registro para que o
// React (StrictMode monta/desmonta/monta em desenvolvimento) nunca entre duas
// vezes na mesma call: a saída só acontece se ninguém reaproveitar a sessão
// logo em seguida.
const sessions = new Map();

function createSession({ liveId, role, userName, userImage }) {
  const user = auth.currentUser;
  const client = StreamVideoClient.getOrCreateInstance({
    apiKey: STREAM_API_KEY,
    user: { id: user.uid, name: userName || user.displayName || 'Usuário', image: userImage || undefined },
    tokenProvider: fetchStreamToken,
  });
  const call = client.call('livestream', `live_${liveId}`);
  const session = { key: `${role}:${liveId}`, client, call, refs: 0, timer: null, deviceError: null };

  session.ready = (async () => {
    if (role === 'host') {
      await call.getOrCreate();
      await call.join({ create: false }); // entra como HOST (backstage até o goLive)
      try {
        await call.camera.enable();
      } catch (err) {
        console.error('[stream] câmera:', err);
        session.deviceError = 'Não foi possível acessar a câmera. Verifique a permissão do navegador.';
      }
      try {
        await call.microphone.enable();
      } catch (err) {
        console.error('[stream] microfone:', err);
        session.deviceError = session.deviceError || 'Não foi possível acessar o microfone. Verifique a permissão do navegador.';
      }
    } else {
      await call.join();
    }
    return call;
  })();
  // evita "unhandled rejection" quando ninguém está escutando mais
  session.ready.catch(() => {});
  return session;
}

async function teardown(session) {
  if (session.refs > 0) return;
  sessions.delete(session.key);
  try { await session.ready; } catch { /* não chegou a entrar */ }
  const { call, client } = session;
  try { await call.camera.disable(); } catch { /* ignora */ }
  try { await call.microphone.disable(); } catch { /* ignora */ }
  try { await call.screenShare.disable(); } catch { /* ignora */ }
  try { await call.leave(); } catch { /* ignora */ }
  try { await client.disconnectUser(); } catch { /* ignora */ }
}

function acquire(args) {
  const key = `${args.role}:${args.liveId}`;
  let session = sessions.get(key);
  if (!session) {
    session = createSession(args);
    sessions.set(key, session);
  }
  clearTimeout(session.timer);
  session.refs += 1;
  return session;
}

function release(session) {
  session.refs -= 1;
  if (session.refs > 0) return;
  clearTimeout(session.timer);
  session.timer = setTimeout(() => teardown(session), 400);
}

const IDLE = { status: 'idle', client: null, call: null, error: null, deviceError: null };

/**
 * Entra na call da live enquanto `enabled` for true e sai sozinho ao desligar
 * ou ao sair da página.
 * role: 'host' (criador) | 'viewer' (espectador)
 */
export function useLiveSession({ liveId, role, enabled, userName, userImage }) {
  const [state, setState] = useState(IDLE);

  useEffect(() => {
    if (!enabled || !liveId) return undefined;
    let cancelled = false;
    setState({ ...IDLE, status: 'connecting' });

    let session;
    try {
      session = acquire({ liveId, role, userName, userImage });
    } catch (err) {
      setState({ ...IDLE, status: 'error', error: err });
      return undefined;
    }

    session.ready
      .then(() => {
        if (cancelled) return;
        setState({
          status: 'ready',
          client: session.client,
          call: session.call,
          error: null,
          deviceError: session.deviceError,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[stream] erro ao entrar na live:', err);
        setState({ ...IDLE, status: 'error', error: err });
      });

    return () => {
      cancelled = true;
      release(session);
    };
    // userName/userImage só valem na primeira conexão
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveId, role, enabled]);

  return enabled ? state : IDLE;
}

/** Gravações de uma live (o GetStream guarda; links podem demorar alguns minutos para ficar prontos). */
export async function fetchLiveRecordings(liveId) {
  const user = auth.currentUser;
  const client = StreamVideoClient.getOrCreateInstance({
    apiKey: STREAM_API_KEY,
    user: { id: user.uid },
    tokenProvider: fetchStreamToken,
  });
  const call = client.call('livestream', `live_${liveId}`);
  const res = await call.queryRecordings();
  return res?.recordings || [];
}
