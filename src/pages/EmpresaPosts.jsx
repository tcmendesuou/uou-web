import React, { useEffect, useState } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import {
  collection, query, where, onSnapshot, deleteDoc, doc, getDoc,
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { Images, Scissors, LayoutGrid, Trash2, Heart, MessageCircle, Play, Layers } from 'lucide-react';
import { db, storage, auth } from '../firebase';
import { canPublish, logCompanyActivity } from '../lib/companies';
import Postar from './Postar';
import Criar from './Criar';

const TABS = [
  { id: 'publicar', label: 'Publicar', icon: Images },
  { id: 'editar', label: 'Editar', icon: Scissors },
  { id: 'publicados', label: 'Publicados', icon: LayoutGrid },
];

const ACTIVITY_TEXT = {
  post_created: (a) => `publicou ${a.kind === 'video' ? 'um vídeo' : a.kind === 'carousel' ? 'um carrossel' : 'uma foto'}`,
  post_deleted: () => 'excluiu um post',
  video_uploaded: (a) => `enviou o vídeo ${a.name || ''}`.trim(),
  video_exported: (a) => `exportou o vídeo ${a.name || ''}`.trim(),
};

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

// Aba "Posts" da empresa: publicar, editar vídeos e ver o que já foi publicado em nome da empresa.
export default function EmpresaPosts() {
  const { company } = useOutletContext() || {};
  const location = useLocation();
  const uid = auth.currentUser?.uid;
  const [tab, setTab] = useState(() => (location.state?.readyVideo ? 'publicar' : location.state?.tab || 'publicar'));

  useEffect(() => {
    if (location.state?.readyVideo) setTab('publicar');
    else if (location.state?.tab) setTab(location.state.tab);
  }, [location.state]);

  if (!company) return <p style={{ color: '#8a8a95' }}>Nenhuma empresa selecionada.</p>;
  if (!canPublish(company, uid)) {
    return (
      <p style={{ color: '#8a8a95', maxWidth: 520, margin: '60px auto', textAlign: 'center' }}>
        {company.status === 'suspended'
          ? 'Esta empresa está suspensa. Não é possível publicar enquanto durar a suspensão.'
          : 'Você não faz parte da equipe desta empresa.'}
      </p>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.head}>
        <h1 style={s.title}>Posts</h1>
        <p style={s.sub}>Tudo o que a equipe publica sai em nome de {company.tradeName || company.legalName}.</p>
        <div style={s.tabs}>
          {TABS.map((t) => (
            <button key={t.id} type="button" style={s.tab(tab === t.id)} onClick={() => setTab(t.id)}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'publicar' && <Postar key={location.state?.readyVideo?.id || 'novo'} company={company} />}
      {tab === 'editar' && <Criar company={company} />}
      {tab === 'publicados' && <Publicados company={company} />}
    </div>
  );
}

function useNames(uids) {
  const [names, setNames] = useState({});
  const key = [...new Set(uids.filter(Boolean))].sort().join(',');
  useEffect(() => {
    key.split(',').filter(Boolean).forEach(async (u) => {
      if (names[u]) return;
      try {
        const snap = await getDoc(doc(db, 'users', u));
        setNames((n) => ({ ...n, [u]: snap.exists() ? (snap.data().name || 'Usuário') : 'Usuário' }));
      } catch { setNames((n) => ({ ...n, [u]: 'Usuário' })); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return names;
}

function Publicados({ company }) {
  const uid = auth.currentUser?.uid;
  const [posts, setPosts] = useState(null);
  const [activity, setActivity] = useState([]);
  const [busy, setBusy] = useState('');

  useEffect(() => onSnapshot(
    query(collection(db, 'posts'), where('userId', '==', company.id)),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      setPosts(list);
    },
    (err) => { console.error('[EmpresaPosts]', err); setPosts([]); },
  ), [company.id]);

  useEffect(() => onSnapshot(
    query(collection(db, 'company_activity'), where('companyId', '==', company.id)),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
      setActivity(list.slice(0, 40));
    },
    (err) => console.error('[EmpresaPosts] atividade', err),
  ), [company.id]);

  const names = useNames([...(posts || []).map((p) => p.authorUid), ...activity.map((a) => a.uid)]);

  const remove = async (post) => {
    if (!window.confirm('Excluir este post? Essa ação não pode ser desfeita.')) return;
    setBusy(post.id);
    try {
      await deleteDoc(doc(db, 'posts', post.id));
      const urls = [post.mediaUrl, post.thumbnailUrl, ...(post.mediaItems || []).flatMap((m) => [m.url, m.thumbnailUrl])]
        .filter((u) => typeof u === 'string' && u.includes('/company_posts/'));
      await Promise.all([...new Set(urls)].map((u) => deleteObject(ref(storage, u)).catch(() => null)));
      await logCompanyActivity(company.id, uid, 'post_deleted', { postId: post.id });
    } catch (e) {
      alert('Não foi possível excluir: ' + (e?.code || e?.message));
    } finally { setBusy(''); }
  };

  return (
    <div style={s.grid2}>
      <div style={s.card}>
        <h3 style={s.h3}>Posts da empresa {posts ? `(${posts.length})` : ''}</h3>
        {posts === null && <p style={s.muted}>Carregando...</p>}
        {posts && posts.length === 0 && <p style={s.muted}>Nenhum post ainda. Use a aba Publicar para criar o primeiro.</p>}
        <div style={s.postGrid}>
          {(posts || []).map((p) => {
            const cover = p.thumbnailUrl || (p.mediaType === 'photo' || p.type === 'photo' ? p.mediaUrl : null);
            return (
              <div key={p.id} style={s.post}>
                <div style={{ ...s.cover, ...(cover ? { backgroundImage: `url("${cover}")` } : {}) }}>
                  {!cover && <Play size={22} color="#8a8a95" />}
                  {p.type === 'carousel' && <span style={s.chip}><Layers size={12} /></span>}
                  {p.type === 'video' && cover && <span style={s.chip}><Play size={12} /></span>}
                </div>
                <div style={s.postBody}>
                  <div style={s.cap}>{p.caption || 'Sem legenda'}</div>
                  <div style={s.meta}>
                    <span><Heart size={12} /> {p.likes || 0}</span>
                    <span><MessageCircle size={12} /> {p.commentsCount || 0}</span>
                  </div>
                  <div style={s.meta2}>{fmtDate(p.createdAt)}{p.authorUid ? ` · ${names[p.authorUid] || '...'}` : ''}</div>
                </div>
                <button type="button" style={s.del} disabled={busy === p.id} onClick={() => remove(p)} title="Excluir">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div style={s.card}>
        <h3 style={s.h3}>Registro de atividade</h3>
        {activity.length === 0 && <p style={s.muted}>As ações da equipe aparecem aqui.</p>}
        {activity.map((a) => (
          <div key={a.id} style={s.act}>
            <div style={s.actTxt}>
              <b>{names[a.uid] || '...'}</b> {(ACTIVITY_TEXT[a.type] || (() => a.type))(a)}
            </div>
            <div style={s.meta2}>{fmtDate(a.at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const s = {
  page: { color: '#f0f0f0', fontFamily: 'inherit', paddingBottom: 40 },
  head: { margin: '0 0 16px' },
  title: { fontSize: 22, fontWeight: 800, margin: '0 0 4px' },
  sub: { color: '#8a8a95', fontSize: 13, margin: '0 0 14px' },
  tabs: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  tab: (active) => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, fontWeight: active ? 800 : 600,
    background: active ? 'transparent' : '#1b1b1d', color: active ? '#fff' : '#b5b5bd',
    border: active ? '1px solid #fff' : '1px solid #2a2a2d',
  }),
  grid2: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 12, alignItems: 'start' },
  card: { background: '#1b1b1d', border: '1px solid #2a2a2d', borderRadius: 14, padding: 16 },
  h3: { margin: '0 0 10px', fontSize: 15, fontWeight: 800 },
  muted: { color: '#8a8a95', fontSize: 13, margin: '4px 0' },
  postGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 },
  post: { position: 'relative', background: '#222224', border: '1px solid #2a2a2d', borderRadius: 12, overflow: 'hidden' },
  cover: {
    height: 150, background: '#2f2f33', backgroundSize: 'cover', backgroundPosition: 'center',
    display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  chip: { position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '3px 5px', display: 'flex' },
  postBody: { padding: 10 },
  cap: { fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { display: 'flex', gap: 12, color: '#b5b5bd', fontSize: 12, marginTop: 6 },
  meta2: { color: '#8a8a95', fontSize: 11, marginTop: 4 },
  del: {
    position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: '#ff6b6b',
    border: '1px solid rgba(255,68,68,0.3)', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex',
  },
  act: { background: '#222224', border: '1px solid #2a2a2d', borderRadius: 10, padding: '8px 10px', marginTop: 8 },
  actTxt: { fontSize: 13, color: '#e6e6ea' },
};
