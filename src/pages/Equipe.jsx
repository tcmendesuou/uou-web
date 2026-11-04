import React, { useEffect, useState } from 'react';
import { Search, UserPlus, X, LogOut, Trash2 } from 'lucide-react';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, arrayRemove, deleteField } from 'firebase/firestore';
import { useOutletContext } from 'react-router-dom';
import { auth, db } from '../firebase';
import {
  COMPANY_ROLES, canManageTeam, rolesFor, searchUsers, useCompanyInvites, logCompanyActivity,
} from '../lib/companies';

export default function Equipe() {
  const { company } = useOutletContext() || {};
  const uid = auth.currentUser?.uid;
  const invites = useCompanyInvites(company?.id);
  const [people, setPeople] = useState({}); // uid -> { name, photoURL }
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [inviteRole, setInviteRole] = useState('production');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({ type: '', text: '' });

  const myRole = company?.members?.[uid];
  const canManage = canManageTeam(company, uid);
  const roles = rolesFor(myRole);
  const memberIds = Object.keys(company?.members || {});

  // nomes e fotos dos membros e convidados
  useEffect(() => {
    const ids = [...new Set([...memberIds, ...invites.map((i) => i.toUid)])].filter((id) => id && !people[id]);
    ids.forEach(async (id) => {
      try {
        const snap = await getDoc(doc(db, 'users', id));
        const d = snap.exists() ? snap.data() : {};
        setPeople((p) => ({ ...p, [id]: { name: d.name || 'Usuário', photoURL: d.photoURL || '' } }));
      } catch { setPeople((p) => ({ ...p, [id]: { name: 'Usuário', photoURL: '' } })); }
    });
  }, [memberIds.join(','), invites.map((i) => i.toUid).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // busca com pequena espera
  useEffect(() => {
    if (!canManage || term.trim().length < 2) { setResults([]); return undefined; }
    setSearching(true);
    const t = setTimeout(async () => {
      try { setResults(await searchUsers(term)); } finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [term, canManage]);

  if (!company) return <p style={{ color: '#8a8a95' }}>Nenhuma empresa selecionada.</p>;

  const nameOf = (id) => people[id]?.name || '…';
  const pendingIds = new Set(invites.filter((i) => i.status === 'pending').map((i) => i.toUid));

  const run = async (key, fn, okText) => {
    setBusy(key); setMsg({ type: '', text: '' });
    try { await fn(); if (okText) setMsg({ type: 'ok', text: okText }); }
    catch (e) { console.error('[Equipe]', e); setMsg({ type: 'err', text: 'Não foi possível concluir. (' + (e?.code || e?.message || 'erro') + ')' }); }
    finally { setBusy(''); }
  };

  const invite = (person) => run('inv' + person.id, async () => {
    await setDoc(doc(db, 'company_invites', `${company.id}_${person.id}`), {
      companyId: company.id,
      companyName: company.tradeName || company.legalName,
      toUid: person.id,
      toName: person.name || 'Usuário',
      role: inviteRole,
      invitedBy: uid,
      invitedByName: people[uid]?.name || auth.currentUser?.displayName || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    logCompanyActivity(company.id, uid, 'member_invited', { target: person.id, role: inviteRole });
    setTerm(''); setResults([]);
  }, `Convite enviado para ${person.name || 'a pessoa'}.`);

  const cancelInvite = (inv) => run('c' + inv.id, async () => {
    await deleteDoc(doc(db, 'company_invites', inv.id));
    logCompanyActivity(company.id, uid, 'invite_canceled', { target: inv.toUid });
  });

  const changeRole = (id, role) => run('r' + id, async () => {
    await updateDoc(doc(db, 'companies', company.id), { [`members.${id}`]: role });
    logCompanyActivity(company.id, uid, 'member_role_changed', { target: id, role });
  }, 'Cargo atualizado.');

  const removeMember = (id, self) => {
    const q = self ? 'Sair desta empresa?' : `Remover ${nameOf(id)} da equipe?`;
    if (!window.confirm(q)) return;
    run('x' + id, async () => {
      await logCompanyActivity(company.id, uid, self ? 'member_left' : 'member_removed', { target: id });
      await updateDoc(doc(db, 'companies', company.id), {
        memberUids: arrayRemove(id),
        [`members.${id}`]: deleteField(),
      });
    }, self ? '' : 'Pessoa removida da equipe.');
  };

  return (
    <div style={s.page}>
      <h2 style={s.title}>Equipe</h2>
      {msg.text && <p style={msg.type === 'ok' ? s.ok : s.err}>{msg.text}</p>}

      <section style={s.card}>
        <h3 style={s.h3}>Membros ({memberIds.length})</h3>
        {memberIds.map((id) => {
          const role = company.members[id];
          const isMe = id === uid;
          const isOwner = role === 'owner';
          // Admin só mexe em quem não é Dono nem Admin; Dono mexe em todos (menos nele mesmo)
          const canTouch = canManage && !isOwner && !isMe && (myRole === 'owner' || role !== 'admin');
          return (
            <div key={id} style={s.row}>
              <div style={s.avatar}>
                {people[id]?.photoURL ? <img src={people[id].photoURL} alt="" style={s.avatarImg} /> : (nameOf(id)[0] || '?')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.name}>{nameOf(id)}{isMe ? ' (você)' : ''}</div>
                {!canTouch && <div style={s.role}>{COMPANY_ROLES[role] || role}</div>}
              </div>
              {canTouch && (
                <select
                  style={s.select} value={role} disabled={busy === 'r' + id}
                  onChange={(e) => changeRole(id, e.target.value)} aria-label={`Cargo de ${nameOf(id)}`}
                >
                  {roles.map((r) => <option key={r} value={r}>{COMPANY_ROLES[r]}</option>)}
                  {!roles.includes(role) && <option value={role}>{COMPANY_ROLES[role]}</option>}
                </select>
              )}
              {canTouch && (
                <button type="button" style={s.danger} disabled={busy === 'x' + id} onClick={() => removeMember(id, false)} title="Remover">
                  <Trash2 size={15} />
                </button>
              )}
              {isMe && !isOwner && (
                <button type="button" style={s.dangerText} onClick={() => removeMember(id, true)}>
                  <LogOut size={14} /> Sair da empresa
                </button>
              )}
            </div>
          );
        })}
      </section>

      {canManage && (
        <section style={s.card}>
          <h3 style={s.h3}>Convidar pessoa</h3>
          <p style={s.muted}>Busque pelo nome ou pelo e-mail da conta UOU. A pessoa recebe o convite em Perfil → Configurações → Empresas.</p>
          <div style={s.inviteBar}>
            <div style={s.search}>
              <Search size={15} color="#777" />
              <input style={s.input} placeholder="Nome ou e-mail" value={term} onChange={(e) => setTerm(e.target.value)} />
            </div>
            <select style={s.select} value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} aria-label="Cargo do convite">
              {roles.map((r) => <option key={r} value={r}>{COMPANY_ROLES[r]}</option>)}
            </select>
          </div>

          {searching && <p style={s.muted}>Buscando…</p>}
          {!searching && term.trim().length >= 2 && results.length === 0 && <p style={s.muted}>Ninguém encontrado.</p>}
          {results.map((p) => {
            const already = !!company.members?.[p.id];
            const pending = pendingIds.has(p.id);
            return (
              <div key={p.id} style={s.row}>
                <div style={s.avatar}>{p.photoURL ? <img src={p.photoURL} alt="" style={s.avatarImg} /> : ((p.name || '?')[0])}</div>
                <div style={{ flex: 1, minWidth: 0 }}><div style={s.name}>{p.name || 'Usuário'}</div></div>
                {already ? <span style={s.role}>Já está na equipe</span>
                  : pending ? <span style={s.role}>Convite pendente</span>
                    : (
                      <button type="button" style={s.btn} disabled={busy === 'inv' + p.id} onClick={() => invite(p)}>
                        <UserPlus size={14} /> Convidar
                      </button>
                    )}
              </div>
            );
          })}

          {invites.filter((i) => i.status === 'pending').length > 0 && (
            <>
              <h4 style={s.h4}>Convites pendentes</h4>
              {invites.filter((i) => i.status === 'pending').map((i) => (
                <div key={i.id} style={s.row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.name}>{i.toName || nameOf(i.toUid)}</div>
                    <div style={s.role}>{COMPANY_ROLES[i.role] || i.role} · aguardando resposta</div>
                  </div>
                  <button type="button" style={s.danger} disabled={busy === 'c' + i.id} onClick={() => cancelInvite(i)} title="Cancelar convite">
                    <X size={15} />
                  </button>
                </div>
              ))}
            </>
          )}
        </section>
      )}
    </div>
  );
}

const s = {
  page: { maxWidth: 760, margin: '0 auto', color: '#f0f0f0', fontFamily: 'inherit', paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: 800, margin: '0 0 14px' },
  card: { background: '#0b0b10', border: '1px solid #1f1f27', borderRadius: 16, padding: 20, marginBottom: 18 },
  h3: { margin: '0 0 8px', fontSize: 15, fontWeight: 800 },
  h4: { margin: '18px 0 4px', fontSize: 13, color: '#bbb' },
  muted: { color: '#8a8a95', fontSize: 13, margin: '2px 0 10px' },
  row: {
    display: 'flex', alignItems: 'center', gap: 12, background: '#12121a', border: '1px solid #20202a',
    borderRadius: 12, padding: 12, marginTop: 10,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19, background: '#0a1a0a', border: '1px solid #1d3a1d', color: '#52fa35',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, overflow: 'hidden', flexShrink: 0,
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  name: { fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  role: { fontSize: 12, color: '#52fa35' },
  select: {
    background: '#12121a', color: '#fff', border: '1px solid #26262e', borderRadius: 10, padding: '8px 10px',
    fontSize: 13, fontFamily: 'inherit',
  },
  inviteBar: { display: 'flex', gap: 10, alignItems: 'center' },
  search: {
    flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: '#12121a', border: '1px solid #26262e',
    borderRadius: 10, padding: '0 12px',
  },
  input: {
    flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 14,
    padding: '10px 0', fontFamily: 'inherit',
  },
  btn: {
    display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(82, 250, 53, 0.05)', color: '#52fa35',
    border: '1px solid #52fa35', borderRadius: 10, padding: '7px 12px', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  danger: {
    background: 'transparent', color: '#ff6b6b', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 10,
    padding: 8, cursor: 'pointer', display: 'flex',
  },
  dangerText: {
    display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', color: '#ff6b6b',
    border: '1px solid rgba(255,68,68,0.3)', borderRadius: 10, padding: '7px 12px', fontSize: 13,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  ok: { color: '#52fa35', fontSize: 13, margin: '0 0 10px' },
  err: { color: '#ff6b6b', fontSize: 13, margin: '0 0 10px' },
};
