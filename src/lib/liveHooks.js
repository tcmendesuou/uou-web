// src/lib/liveHooks.js
import { useEffect, useState } from 'react';
import {
  doc, onSnapshot, collection, query, orderBy, limitToLast,
} from 'firebase/firestore';
import { db } from '../firebase';
import { DRAW_COUNTDOWN_SECONDS } from './liveLogic';

const LOADING = { loading: true, live: null, notFound: false, error: null };

/** Documento da live em tempo real. */
export function useLiveDoc(liveId) {
  const [state, setState] = useState(LOADING);

  useEffect(() => {
    setState(LOADING);
    const unsub = onSnapshot(
      doc(db, 'lives', liveId),
      (snap) => {
        setState(
          snap.exists()
            ? { loading: false, live: { id: snap.id, ...snap.data() }, notFound: false, error: null }
            : { loading: false, live: null, notFound: true, error: null }
        );
      },
      (err) => {
        console.error('[live] erro ao ler live:', err);
        setState({ loading: false, live: null, notFound: false, error: err });
      }
    );
    return unsub;
  }, [liveId]);

  return state;
}

/** Últimas mensagens do chat da live, em tempo real. */
export function useLiveMessages(liveId, max = 100) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    setMessages([]);
    const q = query(
      collection(db, 'lives', liveId, 'messages'),
      orderBy('timestamp', 'asc'),
      limitToLast(max)
    );
    const unsub = onSnapshot(
      q,
      (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('[live] erro no chat:', err)
    );
    return unsub;
  }, [liveId, max]);

  return messages;
}

/** Tempo que falta para a live acabar (segundos), igual para todo mundo. */
export function useRemainingSeconds(live) {
  const [seconds, setSeconds] = useState(null);
  const startedAt = live?.startedAt;
  const duration = live?.duration;

  useEffect(() => {
    if (!startedAt || !duration) {
      setSeconds(null);
      return undefined;
    }
    const endMs = new Date(startedAt).getTime() + duration * 60 * 1000;
    const tick = () => setSeconds(Math.max(0, Math.round((endMs - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, duration]);

  return seconds;
}

/**
 * Relógio do sorteio (premiadas):
 *  timerSeconds -> "Sorteio em M:SS"
 *  countdown    -> contagem grande dos últimos 10s (null fora dessa janela)
 */
export function usePrizeClock(live) {
  const [clock, setClock] = useState({ timerSeconds: null, countdown: null });
  const isPremium = !!live?.isPremium;
  const drawAt = live?.prizeDrawAt;
  const drawn = !!live?.prizeDrawnAt;

  useEffect(() => {
    if (!isPremium || !drawAt || drawn) {
      setClock({ timerSeconds: null, countdown: null });
      return undefined;
    }
    const drawAtMs = new Date(drawAt).getTime();
    const tick = () => {
      const toPhaseEnd = Math.round((drawAtMs - Date.now()) / 1000);
      if (toPhaseEnd > 0) {
        setClock({ timerSeconds: toPhaseEnd, countdown: null });
      } else if (toPhaseEnd > -DRAW_COUNTDOWN_SECONDS) {
        setClock({ timerSeconds: 0, countdown: DRAW_COUNTDOWN_SECONDS + toPhaseEnd });
      } else {
        setClock({ timerSeconds: null, countdown: null });
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isPremium, drawAt, drawn]);

  return clock;
}

export const formatClock = (total) => {
  const s = Math.max(0, Math.floor(total || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
};
