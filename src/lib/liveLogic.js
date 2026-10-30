// src/lib/liveLogic.js
// Regras de negócio das lives no UOU Web — espelham o app (LiveStreamingScreen
// e CameraScreen): acesso/preview, pagamento, reserva do prêmio, sorteio e
// acerto final. Mesmos campos e mesmos tipos de transação do app.
import {
  doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, increment, runTransaction,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../firebase';

export const DEFAULT_LIVE_CONFIG = { impostoPercent: 15, estruturaPercent: 5, uouPercent: 30 };

export const LIVE_CATEGORIES = [
  'Turismo', 'Culinária', 'Música', 'Esportes', 'Games',
  'Educação', 'Arte', 'Tecnologia', 'Outros',
];

export const LIVE_DURATIONS = [
  { label: '5 minutos', value: '5' },
  { label: '10 minutos', value: '10' },
  { label: '30 minutos', value: '30' },
  { label: '1 hora', value: '60' },
  { label: '3 horas', value: '180' },
];

export const PREVIEW_SECONDS = 10;
export const DRAW_COUNTDOWN_SECONDS = 10;

export const brl = (value) =>
  `R$ ${(Number(value) || 0).toFixed(2).replace('.', ',')}`;

// "12,50" / "12.50" / "12" -> 12.5
export const parseMoney = (text) => {
  const n = parseFloat(String(text ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export async function getLiveConfig() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'liveConfig'));
    return snap.exists() ? { ...DEFAULT_LIVE_CONFIG, ...snap.data() } : DEFAULT_LIVE_CONFIG;
  } catch {
    return DEFAULT_LIVE_CONFIG;
  }
}

export function calcShares(price, config) {
  const imposto = price * (config.impostoPercent / 100);
  const estrutura = price * (config.estruturaPercent / 100);
  const liquido = price - imposto - estrutura;
  const creatorValue = liquido * ((100 - config.uouPercent) / 100);
  const uouValue = liquido - creatorValue;
  return { imposto, estrutura, liquido, creatorValue, uouValue };
}

export const isVideoUrl = (url) =>
  !!url && /\.(mp4|mov|webm)(\?|$)/i.test(decodeURIComponent(String(url)).split('#')[0]);

// ---------------------------------------------------------------------------
// ACESSO DO ESPECTADOR
// ---------------------------------------------------------------------------
const accessRef = (liveId, uid) => doc(db, 'live_access', `${liveId}_${uid}`);

export async function getAccess(liveId, uid) {
  const snap = await getDoc(accessRef(liveId, uid));
  return snap.exists() ? snap.data() : null;
}

export async function markPreviewed(liveId, uid) {
  await setDoc(accessRef(liveId, uid), {
    hasPreviewed: true,
    hasPaid: false,
    liveId,
    userId: uid,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Cobra a entrada da live. Retorna:
 *  { ok: true }
 *  { ok: false, reason: 'insufficient', wallet }
 */
export async function payForLive({ liveId, liveTitle, liveOwnerId }) {
  const uid = auth.currentUser.uid;

  // Dado mais fresco possível (preço e se é premiada)
  const liveSnap = await getDoc(doc(db, 'lives', liveId));
  const live = liveSnap.data();
  if (!live || live.status === 'ended') throw new Error('Esta live já foi encerrada.');
  const price = live.price || 0;
  const isPremiumLive = !!live.isPremium;

  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) throw new Error('Usuário não encontrado.');
  const viewerData = userSnap.data();
  const wallet = viewerData?.wallet || 0;
  if (wallet < price) return { ok: false, reason: 'insufficient', wallet, price };

  const config = await getLiveConfig();
  const { creatorValue, uouValue } = calcShares(price, config);
  const title = liveTitle || live.title;
  const ownerId = liveOwnerId || live.userId;

  // Debita o espectador
  await updateDoc(doc(db, 'users', uid), { wallet: increment(-price) });

  // Em live premiada o valor do criador fica reservado no pote da live até o
  // acerto final; em live normal vai direto para a carteira dele.
  if (isPremiumLive) {
    await updateDoc(doc(db, 'lives', liveId), { potBalance: increment(creatorValue) });
  } else {
    await updateDoc(doc(db, 'users', ownerId), { wallet: increment(creatorValue) });
  }

  const now = () => new Date().toISOString();

  await addDoc(collection(db, 'transactions'), {
    userId: uid,
    type: 'live_entry',
    description: `Entrada na live: ${title}`,
    amount: price,
    liveId,
    date: now(),
  });

  await addDoc(collection(db, 'transactions'), {
    userId: ownerId,
    type: 'live_revenue',
    description: `Receita da live: ${title}`,
    amount: creatorValue,
    amountBruto: price,
    uouFee: uouValue,
    liveId,
    fromUserId: uid,
    visibleInPersonalExtract: !isPremiumLive,
    date: now(),
  });

  await addDoc(collection(db, 'notifications'), {
    userId: ownerId,
    type: 'live_payment',
    message: isPremiumLive
      ? `entrou na sua live e pagou ${brl(price)} (${brl(creatorValue)} reservado na Carteira da Live)`
      : `entrou na sua live e pagou ${brl(price)} (você recebe ${brl(creatorValue)})`,
    fromUserId: uid,
    fromUserName: viewerData?.name || 'Usuário',
    fromUserPhoto: viewerData?.photoURL || null,
    liveId,
    amount: creatorValue,
    read: false,
    createdAt: now(),
  });

  await setDoc(accessRef(liveId, uid), {
    hasPreviewed: true,
    hasPaid: true,
    liveId,
    userId: uid,
    paidAt: now(),
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// CHAT
// ---------------------------------------------------------------------------
export async function sendLiveMessage(liveId, userName, text) {
  const clean = String(text || '').trim();
  if (!clean) return;
  await addDoc(collection(db, 'lives', liveId, 'messages'), {
    userId: auth.currentUser.uid,
    userName: userName || auth.currentUser.displayName || 'Usuário',
    text: clean.slice(0, 500),
    timestamp: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// CRIADOR: criar, iniciar, sortear e encerrar
// ---------------------------------------------------------------------------
async function notifyFollowers(liveId, liveTitle, scheduledDateTime) {
  try {
    const followers = await getDocs(
      query(collection(db, 'follows'), where('followingId', '==', auth.currentUser.uid))
    );
    await Promise.all(
      followers.docs.map((f) =>
        setDoc(doc(collection(db, 'notifications')), {
          userId: f.data().followerId,
          type: 'live_scheduled',
          message: `agendou uma nova live: "${liveTitle}"`,
          fromUserId: auth.currentUser.uid,
          liveId,
          scheduledDate: scheduledDateTime,
          read: false,
          createdAt: new Date().toISOString(),
        })
      )
    );
  } catch (err) {
    console.error('[live] erro ao notificar seguidores:', err);
  }
}

async function uploadTeaser(file) {
  if (!file) return null;
  const isVideo = file.type.startsWith('video');
  const fromName = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ext = fromName || (isVideo ? 'mp4' : 'jpg');
  const storageRef = ref(storage, `teasers/${auth.currentUser.uid}/${Date.now()}.${ext}`);
  await uploadBytes(storageRef, file, file.type ? { contentType: file.type } : undefined);
  return getDownloadURL(storageRef);
}

/**
 * Cria o documento da live. Retorna { id, scheduled }.
 * Lança Error com mensagem amigável nas validações.
 */
export async function createLive(values, creatorWallet) {
  const {
    title, description, price, category, duration, isPremium,
    prizeSource, prizeAmount, prizePercent, isScheduled, scheduledAt, teaserFile,
    commentsEnabled = true,
  } = values;

  if (!title.trim()) throw new Error('Adicione um título para a live.');
  const priceValue = parseMoney(price);
  if (priceValue <= 0) throw new Error('Adicione um preço válido.');

  if (isPremium && prizeSource === 'wallet' && !isScheduled) {
    const fixed = parseMoney(prizeAmount);
    if (creatorWallet < fixed) {
      throw new Error(`Para definir esse prêmio você precisa ter ${brl(fixed)} na carteira. Seu saldo atual: ${brl(creatorWallet)}.`);
    }
  }
  if (isPremium && prizeSource === 'pot' && !isScheduled) {
    if (creatorWallet < priceValue) {
      throw new Error(`Para abrir uma Live Premiada você precisa ter pelo menos ${brl(priceValue)} na carteira (o valor de entrada da sua própria live). Seu saldo atual: ${brl(creatorWallet)}.`);
    }
  }

  let scheduledIso = null;
  if (isScheduled) {
    const when = scheduledAt ? new Date(scheduledAt) : null;
    if (!when || Number.isNaN(when.getTime())) throw new Error('Escolha a data e a hora da live agendada.');
    if (when.getTime() < Date.now() - 60 * 1000) throw new Error('A data da live agendada precisa estar no futuro.');
    scheduledIso = when.toISOString();
  }

  const teaserURL = await uploadTeaser(teaserFile);

  const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
  const userData = userSnap.exists() ? userSnap.data() : {};

  const liveData = {
    title: title.trim(),
    description: description.trim(),
    price: priceValue,
    category,
    duration: parseInt(duration, 10),
    status: isScheduled ? 'scheduled' : 'preparing',
    userId: auth.currentUser.uid,
    userName: userData?.name || 'Usuário',
    userPhoto: userData?.photoURL || '',
    thumbnail: teaserURL || '',
    teaserUrl: teaserURL || '',
    isPremium: !!isPremium,
    prizeSource: isPremium ? prizeSource : null,
    prizeAmount: isPremium && prizeSource === 'wallet' ? parseMoney(prizeAmount) : null,
    prizePercent: isPremium && prizeSource === 'pot' ? parseMoney(prizePercent) : null,
    potBalance: 0,
    prizeReserve: 0, // só é debitada quando a live realmente começa
    viewers: 0,
    likes: 0,
    commentsEnabled: commentsEnabled !== false,
    createdAt: new Date().toISOString(),
  };
  if (isScheduled) liveData.scheduledDate = scheduledIso;

  const liveRef = await addDoc(collection(db, 'lives'), liveData);
  if (isScheduled) await notifyFollowers(liveRef.id, liveData.title, scheduledIso);
  return { id: liveRef.id, scheduled: !!isScheduled };
}

export async function deleteLive(liveId) {
  await deleteDoc(doc(db, 'lives', liveId));
}

/**
 * Passo financeiro do "Entrar ao vivo" (igual ao app): em live premiada o
 * criador trava uma GARANTIA na carteira — o valor do prêmio (modo carteira)
 * ou o preço de entrada da própria live (modo pote). Fica em prizeReserve.
 * É idempotente: se já existe reserva, não cobra de novo.
 *
 * Retorna { ok: true, guaranteeAmount, title } ou { ok: false, message }.
 */
export async function prepareGoLive(liveId) {
  const uid = auth.currentUser.uid;
  const liveSnap = await getDoc(doc(db, 'lives', liveId));
  const live = liveSnap.data();
  if (!live) return { ok: false, message: 'Live não encontrada.' };

  // Já está no ar (retomada) ou não é premiada ou já tem reserva: nada a cobrar
  if (live.status === 'live' || !live.isPremium || (live.prizeReserve || 0) > 0) {
    return { ok: true, guaranteeAmount: 0, title: live.title };
  }

  let amount = 0;
  let description = '';
  if (live.prizeSource === 'wallet') {
    amount = live.prizeAmount || 0;
    description = `Garantia do prêmio (carteira): ${live.title}`;
  } else if (live.prizeSource === 'pot') {
    amount = live.price || 0;
    description = `Entrada como criador na própria live premiada: ${live.title}`;
  }
  if (amount <= 0) return { ok: true, guaranteeAmount: 0, title: live.title };

  try {
    await runTransaction(db, async (tx) => {
      const opRef = doc(db, 'wallet_operations', `live_garantia_${liveId}_${uid}`);
      const opSnap = await tx.get(opRef);
      if (opSnap.exists()) return;

      const userRef = doc(db, 'users', uid);
      const userSnap = await tx.get(userRef);
      const current = userSnap.data()?.wallet || 0;
      if (current < amount) throw new Error(`INSUFFICIENT_WALLET:${current}`);

      const liveRef = doc(db, 'lives', liveId);
      const liveTx = await tx.get(liveRef);
      if ((liveTx.data()?.prizeReserve || 0) > 0) return;

      tx.set(opRef, {
        type: 'live_premiada_entrada',
        userId: uid,
        liveId,
        amount,
        prizeSource: live.prizeSource,
        createdAt: new Date().toISOString(),
      });
      tx.update(userRef, { wallet: current - amount });
      tx.update(liveRef, { prizeReserve: amount });
    });
  } catch (err) {
    if (String(err?.message || '').startsWith('INSUFFICIENT_WALLET')) {
      const bal = parseFloat(String(err.message).split(':')[1] || '0');
      return {
        ok: false,
        message: live.prizeSource === 'wallet'
          ? `Para iniciar essa Live Premiada você precisa ter ${brl(amount)} na carteira (valor do prêmio). Seu saldo atual: ${brl(bal)}.`
          : `Para iniciar essa Live Premiada você precisa ter ${brl(amount)} na carteira (o valor de entrada da sua própria live). Seu saldo atual: ${brl(bal)}.`,
      };
    }
    throw err;
  }

  await addDoc(collection(db, 'transactions'), {
    userId: uid,
    type: 'live_premiada_entrada',
    description,
    amount,
    liveId,
    date: new Date().toISOString(),
  });
  return { ok: true, guaranteeAmount: amount, title: live.title };
}

/** Devolve a garantia quando falha ao entrar no ar depois de já ter cobrado. */
export async function refundGuarantee(liveId, amount, title) {
  const uid = auth.currentUser.uid;
  await runTransaction(db, async (tx) => {
    const liveRef = doc(db, 'lives', liveId);
    const liveTx = await tx.get(liveRef);
    const reserveNow = liveTx.data()?.prizeReserve || 0;
    if (reserveNow <= 0) return;
    const userRef = doc(db, 'users', uid);
    const userSnap = await tx.get(userRef);
    tx.update(userRef, { wallet: (userSnap.data()?.wallet || 0) + reserveNow });
    tx.update(liveRef, { prizeReserve: 0 });
  });
  await addDoc(collection(db, 'transactions'), {
    userId: uid,
    type: 'live_reserva_devolvida',
    description: `Estorno da garantia (falha ao iniciar): ${title}`,
    amount,
    liveId,
    date: new Date().toISOString(),
  });
}

export async function markLiveStarted(liveId) {
  await updateDoc(doc(db, 'lives', liveId), {
    status: 'live',
    startedAt: new Date().toISOString(),
  });
  const snap = await getDoc(doc(db, 'lives', liveId));
  const live = snap.data();
  if (live?.isPremium && live?.duration) {
    const totalSeconds = live.duration * 60;
    const prizeAtSeconds = Math.max(totalSeconds - 120, 30);
    await updateDoc(doc(db, 'lives', liveId), {
      prizeDrawAt: new Date(Date.now() + prizeAtSeconds * 1000).toISOString(),
    });
  }
}

const drawsInFlight = new Set();
const finalizesInFlight = new Set();

export async function executePrizeDraw(liveId) {
  if (drawsInFlight.has(liveId)) return;
  drawsInFlight.add(liveId);
  try {
    const liveSnap = await getDoc(doc(db, 'lives', liveId));
    const live = liveSnap.data();
    if (!live || !live.isPremium || live.prizeDrawnAt) return;

    const accessSnapshot = await getDocs(
      query(
        collection(db, 'live_access'),
        where('liveId', '==', liveId),
        where('hasPaid', '==', true)
      )
    );

    // Convidados do palco só concorrem se o criador permitiu (guestsCompete)
    const excluded = live.guestsCompete ? [] : (live.guestHistory || []);
    const payers = accessSnapshot.docs.map((d) => d.data()).filter((p) => !excluded.includes(p.userId));

    if (payers.length === 0) {
      // Ninguém pagou: devolve a reserva do criador (qualquer modo premiado)
      if (live.prizeReserve > 0) {
        await updateDoc(doc(db, 'users', live.userId), { wallet: increment(live.prizeReserve) });
        await addDoc(collection(db, 'transactions'), {
          userId: live.userId,
          type: 'live_reserva_devolvida',
          description: `Devolução da reserva (ninguém pagou): ${live.title}`,
          amount: live.prizeReserve,
          liveId,
          date: new Date().toISOString(),
        });
        await updateDoc(doc(db, 'lives', liveId), { prizeReserve: 0 });
      }
      return;
    }

    const winner = payers[Math.floor(Math.random() * payers.length)];

    let prizeValue = 0;
    let organicPrize = 0;
    let reserveRefund = 0;
    if (live.prizeSource === 'wallet') {
      // Usa a garantia travada ao entrar ao vivo (fallback p/ lives antigas)
      prizeValue = live.prizeReserve || live.prizeAmount || 0;
    } else {
      // Prêmio "orgânico": só o que veio do pote (espectadores)
      organicPrize = (live.potBalance || 0) * ((live.prizePercent || 0) / 100);
      const reserve = live.prizeReserve || 0;
      prizeValue = Math.max(organicPrize, reserve); // nunca menor que a reserva
      const reserveUsed = Math.max(0, reserve - organicPrize);
      reserveRefund = reserve - reserveUsed;
    }

    if (prizeValue > 0) {
      await updateDoc(doc(db, 'users', winner.userId), { wallet: increment(prizeValue) });
      await addDoc(collection(db, 'transactions'), {
        userId: winner.userId,
        type: 'prize_won',
        description: `Prêmio da live: ${live.title}`,
        amount: prizeValue,
        liveId,
        date: new Date().toISOString(),
      });

      if (live.prizeSource === 'wallet') {
        // A garantia já saiu da carteira ao entrar ao vivo: só zera a reserva
        await updateDoc(doc(db, 'lives', liveId), { prizeReserve: 0 });
      } else {
        await updateDoc(doc(db, 'lives', liveId), {
          potBalance: increment(-organicPrize),
          prizeReserve: 0,
        });
        if (reserveRefund > 0) {
          await updateDoc(doc(db, 'users', live.userId), { wallet: increment(reserveRefund) });
          await addDoc(collection(db, 'transactions'), {
            userId: live.userId,
            type: 'live_reserva_devolvida',
            description: `Devolução da reserva não usada no prêmio: ${live.title}`,
            amount: reserveRefund,
            liveId,
            date: new Date().toISOString(),
          });
        }
      }

      const winnerSnap = await getDoc(doc(db, 'users', winner.userId));
      await updateDoc(doc(db, 'lives', liveId), {
        winnerId: winner.userId,
        winnerName: winnerSnap.data()?.name || 'Sortudo',
        prizeDrawnAt: new Date().toISOString(),
        prizeValuePaid: prizeValue,
      });
    }
  } catch (err) {
    console.error('[live] erro no sorteio:', err);
  } finally {
    drawsInFlight.delete(liveId);
  }
}

/**
 * Encerra a live: sorteio pendente, acerto final com o criador e status
 * 'ended'. Seguro contra rodar duas vezes. Retorna true se encerrou agora.
 */
export async function finalizeLive(liveId) {
  if (finalizesInFlight.has(liveId)) return false;
  finalizesInFlight.add(liveId);
  try {
    const snap = await getDoc(doc(db, 'lives', liveId));
    const live = snap.data();
    if (!live || live.status === 'ended') return false;

    if (live.isPremium && !live.prizeDrawnAt) {
      await executePrizeDraw(liveId);
    }

    if (live.isPremium) {
      const finalSnap = await getDoc(doc(db, 'lives', liveId));
      const finalData = finalSnap.data();
      const remainingPot = finalData?.potBalance || 0;
      const remainingReserve = finalData?.prizeReserve || 0;
      const totalToSettle = remainingPot + remainingReserve;
      if (totalToSettle > 0) {
        await updateDoc(doc(db, 'users', live.userId), { wallet: increment(totalToSettle) });
        await updateDoc(doc(db, 'lives', liveId), { potBalance: 0, prizeReserve: 0 });
        await addDoc(collection(db, 'transactions'), {
          userId: live.userId,
          type: 'live_settlement',
          description: `Repasse da arrecadação da live: ${live.title}`,
          amount: totalToSettle,
          liveId,
          date: new Date().toISOString(),
        });
      }
    }

    await updateDoc(doc(db, 'lives', liveId), {
      status: 'ended',
      endedAt: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    console.error('[live] erro ao encerrar live:', err);
    throw err;
  } finally {
    finalizesInFlight.delete(liveId);
  }
}

export async function incrementViewers(liveId, amount) {
  await updateDoc(doc(db, 'lives', liveId), { viewers: increment(amount) });
}

// Marca que a live está sendo gravada (a aba Lives do editor usa isso para buscar as gravações)
export async function markLiveRecording(liveId) {
  await updateDoc(doc(db, 'lives', liveId), { recording: true });
}
