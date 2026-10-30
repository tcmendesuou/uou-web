// src/components/LiveGuests.jsx
// Convidados no palco da live: o criador convida quem está assistindo (até 3).
//  - LiveGuestsPanel: aba "Participantes" do criador (buscar, convidar, mutar, remover).
//  - GuestViewerBar:  parte do convidado (aceitar/recusar e controles de câmera/microfone).
// Convites ficam em live_guests/{liveId}_{uid}: invited → onstage (aceitou) → removed/left; declined/canceled.
// Quem libera/tira a permissão de câmera e microfone no GetStream é sempre o navegador do criador.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, query, where, onSnapshot, doc, setDoc, updateDoc, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { OwnCapability, useCall, useCallStateHooks } from '@stream-io/video-react-sdk';
import { Search, UserPlus, Mic, MicOff, Video, VideoOff, X, LogOut } from 'lucide-react';
import { db, auth } from '../firebase';

export const MAX_GUESTS = 3;
const GREEN = '#52fa35';
const guestDocId = (liveId, uid) => `${liveId}_${uid}`;

// ------------------------------------------------------------------ criador
export function LiveGuestsPanel({ liveId, live, hostId }) {
  const call = useCall();
  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants();
  const [invites, setInvites] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const busyRef = useRef(new Set());

  const guestUids = live?.guestUids || [];

  useEffect(() => {
    if (!liveId) return undefined;
    return onSnapshot(
      query(collection(db, 'live_guests'), where('liveId', '==', liveId)),
      (snap) => setInvites(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('[LiveGuests] convites:', err)
    );
  }, [liveId]);

  const removeFromStage = async (uid, status = 'removed') => {
    try {
      await call.updateUserPermissions({
        user_id: uid,
        revoke_permissions: [OwnCapability.SEND_AUDIO, OwnCapability.SEND_VIDEO],
      });
    } catch (err) {
      console.warn('[LiveGuests] revogar permissão:', err?.message);
    }
    await updateDoc(doc(db, 'lives', liveId), { guestUids: arrayRemove(uid) });
    await updateDoc(doc(db, 'live_guests', guestDocId(liveId, uid)), { status });
  };

  // Limpeza: quando o convidado recusa, sai ou o convite é cancelado, o criador tira a permissão (uma vez por mudança)
  const doneRef = useRef(new Set());
  useEffect(() => {
    if (!call) return;
    const current = new Set(invites.map((i) => `${i.id}:${i.status}`));
    doneRef.current.forEach((k) => { if (!current.has(k)) doneRef.current.delete(k); });
    invites.forEach((inv) => {
      const key = `${inv.id}:${inv.status}`;
      if (['declined', 'left', 'canceled'].includes(inv.status) && !doneRef.current.has(key)) {
        doneRef.current.add(key);
        call.updateUserPermissions({
          user_id: inv.userId,
          revoke_permissions: [OwnCapability.SEND_AUDIO, OwnCapability.SEND_VIDEO],
        }).catch((err) => console.warn('[LiveGuests] revogar permissão:', err?.message));
      }
    });
  }, [invites, call]);

  const inviteOf = (uid) => invites.find((i) => i.userId === uid);
  const onlineIds = participants.map((p) => p.userId);
  const pendingCount = invites.filter((i) => i.status === 'invited').length;
  const full = guestUids.filter((id) => onlineIds.includes(id)).length + pendingCount >= MAX_GUESTS;

  const invite = async (p) => {
    setError('');
    if (full) { setError(`O palco aceita até ${MAX_GUESTS} convidados.`); return; }
    try {
      // A permissão sai junto com o convite: quando a pessoa aceitar, entra direto no palco
      await call.updateUserPermissions({
        user_id: p.userId,
        grant_permissions: [OwnCapability.SEND_AUDIO, OwnCapability.SEND_VIDEO],
      });
      await setDoc(doc(db, 'live_guests', guestDocId(liveId, p.userId)), {
        liveId,
        hostId,
        hostName: live?.userName || '',
        userId: p.userId,
        userName: p.name || 'Usuário',
        userPhoto: p.image || '',
        status: 'invited',
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[LiveGuests] convidar:', err);
      setError('Não foi possível enviar o convite.');
    }
  };
  const cancelInvite = (uid) => updateDoc(doc(db, 'live_guests', guestDocId(liveId, uid)), { status: 'canceled' }).catch(() => {});
  const mute = async (uid) => {
    try { await call.muteUser(uid, 'audio'); } catch (err) { setError('Não foi possível silenciar agora.'); console.warn(err); }
  };

  const nameOf = (uid) => participants.find((p) => p.userId === uid)?.name || inviteOf(uid)?.userName || 'Convidado';
  const watchers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return participants
      .filter((p) => p.userId !== hostId && !guestUids.includes(p.userId))
      .filter((p) => !term || String(p.name || '').toLowerCase().includes(term))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [participants, search, guestUids.join(','), hostId]); // eslint-disable-line react-hooks/exhaustive-deps


  return (
    <div style={s.wrap}>
      <p style={s.h}>No palco ({guestUids.length}/{MAX_GUESTS})</p>
      {guestUids.length === 0 && <p style={s.hint}>Convide alguém que está assistindo para participar com você.</p>}
      {guestUids.map((uid) => {
        const online = participants.some((p) => p.userId === uid);
        return (
          <div key={uid} style={s.row}>
            <span style={s.name}>{nameOf(uid)}{!online && <i style={{ color: '#777' }}> (fora da live)</i>}</span>
            <button type="button" style={s.iconBtn} title="Silenciar" onClick={() => mute(uid)}><MicOff size={15} /></button>
            <button type="button" style={{ ...s.iconBtn, color: '#ff6b6b' }} title="Remover do palco" onClick={() => removeFromStage(uid)}><X size={15} /></button>
          </div>
        );
      })}

      <p style={{ ...s.h, marginTop: 16 }}>Assistindo ({watchers.length})</p>
      <div style={s.search}>
        <Search size={14} color="#777" />
        <input style={s.input} placeholder="Buscar pessoa" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {error && <p style={s.err}>{error}</p>}
      {watchers.length === 0 && <p style={s.hint}>{search ? 'Ninguém encontrado com esse nome.' : 'Ninguém assistindo no momento.'}</p>}
      {watchers.map((p) => {
        const inv = inviteOf(p.userId);
        const pending = inv && inv.status === 'invited';
        return (
          <div key={p.userId} style={s.row}>
            <span style={s.avatar}>{p.image ? <img src={p.image} alt="" style={s.avatarImg} /> : (p.name || '?')[0]}</span>
            <span style={s.name}>{p.name || 'Usuário'}</span>
            {pending ? (
              <button type="button" style={s.btn(false)} onClick={() => cancelInvite(p.userId)}>Convidado · cancelar</button>
            ) : (
              <button type="button" style={s.btn(!full)} disabled={full} onClick={() => invite(p)}>
                <UserPlus size={13} /> Convidar
              </button>
            )}
          </div>
        );
      })}
      {inviteRecent(invites)}
    </div>
  );
}

// Aviso rápido quando alguém recusa
function inviteRecent(invites) {
  const declined = invites.filter((i) => i.status === 'declined');
  if (!declined.length) return null;
  return <p style={s.hint}>Recusaram: {declined.map((d) => d.userName).join(', ')}</p>;
}

// ----------------------------------------------------------------- convidado
export function GuestViewerBar({ liveId }) {
  const call = useCall();
  const { useHasPermissions, useMicrophoneState, useCameraState } = useCallStateHooks();
  const canVideo = useHasPermissions(OwnCapability.SEND_VIDEO);
  const { isEnabled: micOn } = useMicrophoneState();
  const { isEnabled: camOn } = useCameraState();
  const uid = auth.currentUser?.uid;
  const [inv, setInv] = useState(null);
  const startedRef = useRef(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!uid || !liveId) return undefined;
    return onSnapshot(doc(db, 'live_guests', guestDocId(liveId, uid)), (snap) => setInv(snap.exists() ? snap.data() : null));
  }, [liveId, uid]);

  const status = inv?.status;
  const onStage = status === 'onstage';

  useEffect(() => {
    if (!call) return;
    if (onStage && canVideo && !startedRef.current) {
      startedRef.current = true;
      call.camera.enable().catch((e) => console.warn('[guest] câmera:', e?.message));
      call.microphone.enable().catch((e) => console.warn('[guest] mic:', e?.message));
    }
    if (!onStage && startedRef.current) {
      startedRef.current = false;
      call.camera.disable().catch(() => {});
      call.microphone.disable().catch(() => {});
    }
  }, [onStage, canVideo, call]);

  const answer = async (next) => {
    setErr('');
    let step = 'convite';
    try {
      await updateDoc(doc(db, 'live_guests', guestDocId(liveId, uid)), { status: next });
      step = 'palco da live';
      if (next === 'onstage') {
        await updateDoc(doc(db, 'lives', liveId), { guestUids: arrayUnion(uid), guestHistory: arrayUnion(uid) });
      } else if (next === 'left') {
        await updateDoc(doc(db, 'lives', liveId), { guestUids: arrayRemove(uid) });
      }
    } catch (e) {
      console.error(`[guest] responder convite (${step}):`, e);
      setErr(`Não foi possível entrar (${step}): ${e?.code || e?.message || 'erro'}`);
    }
  };

  if (status === 'invited') {
    return (
      <div style={g.banner}>
        <p style={g.bannerText}><b>{inv.hostName || 'O criador'}</b> convidou você para participar da live.</p>
        {err && <p style={{ ...g.bannerText, color: '#ff6b6b', width: '100%' }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={g.accept} onClick={() => answer('onstage')}>Aceitar</button>
          <button type="button" style={g.refuse} onClick={() => answer('declined')}>Agora não</button>
        </div>
      </div>
    );
  }
  if (onStage) {
    return (
      <div style={g.controls}>
        <span style={g.badge}>Você está no palco</span>
        {err && <span style={{ color: '#ff6b6b', fontSize: 11 }}>{err}</span>}
        <button type="button" style={g.round(!micOn)} onClick={() => call.microphone.toggle().catch(() => {})} title="Microfone">{micOn ? <Mic size={18} /> : <MicOff size={18} />}</button>
        <button type="button" style={g.round(!camOn)} onClick={() => call.camera.toggle().catch(() => {})} title="Câmera">{camOn ? <Video size={18} /> : <VideoOff size={18} />}</button>
        <button type="button" style={g.leave} onClick={() => answer('left')}><LogOut size={15} /> Sair do palco</button>
      </div>
    );
  }
  return null;
}

const s = {
  wrap: { padding: 14, fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif", color: '#f0f0f0' },
  h: { fontSize: 12, fontWeight: 800, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px 0' },
  hint: { color: '#777', fontSize: 12.5, lineHeight: 1.5, margin: '4px 0 8px' },
  err: { color: '#ff6b6b', fontSize: 12.5, margin: '6px 0' },
  row: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #15161b' },
  name: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  avatar: { width: 28, height: 28, borderRadius: '50%', backgroundColor: '#1d1e24', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, overflow: 'hidden', flexShrink: 0 },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  search: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, border: '1px solid #1a1a1a', backgroundColor: '#0d0d0d', marginBottom: 6 },
  input: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 13, fontFamily: 'inherit' },
  iconBtn: { width: 30, height: 30, borderRadius: 8, border: '1px solid #2a2a2a', backgroundColor: '#13141a', color: '#ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  btn: (on) => ({
    display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: on ? 'pointer' : 'default',
    fontFamily: 'inherit', whiteSpace: 'nowrap',
    border: `1px solid ${on ? GREEN : '#2a2a2a'}`, backgroundColor: on ? 'rgba(82,250,53,0.1)' : 'transparent', color: on ? GREEN : '#888',
  }),
};
const g = {
  banner: {
    position: 'absolute', top: 12, left: 12, right: 12, zIndex: 8, padding: 12, borderRadius: 12, backgroundColor: 'rgba(13,13,13,0.95)',
    border: `1px solid ${GREEN}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
  },
  bannerText: { margin: 0, color: '#f0f0f0', fontSize: 13 },
  accept: { padding: '7px 14px', borderRadius: 8, border: `1px solid ${GREEN}`, backgroundColor: 'rgba(82,250,53,0.1)', color: GREEN, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  refuse: { padding: '7px 14px', borderRadius: 8, border: '1px solid #333', backgroundColor: 'transparent', color: '#bbb', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  controls: {
    position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 8, display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 12,
    backgroundColor: 'rgba(13,13,13,0.9)', flexWrap: 'wrap',
  },
  badge: { flex: 1, color: GREEN, fontSize: 12, fontWeight: 700 },
  round: (off) => ({ width: 36, height: 36, borderRadius: '50%', border: '1px solid #2a2a2a', backgroundColor: off ? '#3a1111' : '#1a1a1a', color: off ? '#ff6b6b' : '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }),
  leave: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid #3a1111', backgroundColor: 'transparent', color: '#ff6b6b', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
};
