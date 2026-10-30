// src/pages/Dashboard.jsx
// Dashboard do criador. Visual inspirado no Premiere: fundo preto, painéis cinza que se
// encaixam em tamanhos diferentes, cada um com seu título em aba.
// Dados lidos uma vez ao abrir: follows (seguidores), posts e lives do próprio criador.
import React, { useEffect, useMemo, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import Panel from '../components/Panel';
import { usePanelLayout } from '../lib/panelLayout';
import { Users, Image as ImageIcon, Radio, Heart, Trophy, MessageCircle, Lock, Video as VideoIcon } from 'lucide-react';

const GREEN = '#52fa35';
const GOLD = '#FFD700';
const DAY = 24 * 60 * 60 * 1000;

// Lugares do mosaico (veja o CSS no fim do arquivo) — cada painel pode ser arrastado para outro lugar
const SLOTS = ['chart', 'k1', 'k2', 'k3', 'k4', 'tl', 'tp', 'b1', 'b2', 'b3'];

const PERIODS = [
  { id: '7', label: '7 dias', days: 7 },
  { id: '30', label: '30 dias', days: 30 },
  { id: '90', label: '90 dias', days: 90 },
  { id: 'all', label: 'Tudo', days: null },
];

// Aceita texto ISO, número (ms) ou Timestamp do Firestore
const toMs = (v) => {
  if (!v) return null;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  const t = typeof v === 'number' ? v : new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};
const num = (n) => (Number(n) || 0).toLocaleString('pt-BR');
const dayLabel = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

export default function Dashboard() {
  const uid = auth.currentUser?.uid;
  const { order, dragProps, reset, changed } = usePanelLayout('uou_dash_layout_v1', SLOTS);
  const [period, setPeriod] = useState('30');
  const [state, setState] = useState({ loading: true, error: false, follows: [], posts: [], lives: [] });

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const [f, p, l] = await Promise.all([
          getDocs(query(collection(db, 'follows'), where('followingId', '==', uid))),
          getDocs(query(collection(db, 'posts'), where('userId', '==', uid))),
          getDocs(query(collection(db, 'lives'), where('userId', '==', uid))),
        ]);
        if (cancelled) return;
        setState({
          loading: false,
          error: false,
          follows: f.docs.map((d) => ({ id: d.id, ...d.data() })),
          posts: p.docs.map((d) => ({ id: d.id, ...d.data() })),
          lives: l.docs.map((d) => ({ id: d.id, ...d.data() })),
        });
      } catch (err) {
        console.error('[Dashboard] erro ao carregar:', err);
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: true }));
      }
    })();
    return () => { cancelled = true; };
  }, [uid]);

  const m = useMemo(() => {
    const { follows, posts, lives } = state;
    const now = Date.now();
    const days = PERIODS.find((x) => x.id === period).days;
    const since = days ? now - days * DAY : null;
    const inPeriod = (ms) => (since === null ? true : ms !== null && ms >= since);

    // Seguidores: curva acumulada (só dá para montar com a data em que cada um começou a seguir)
    const followDates = follows.map((f) => toMs(f.createdAt)).filter((x) => x !== null).sort((a, b) => a - b);
    const hasHistory = followDates.length > 0;
    const startMs = since !== null ? since : (followDates[0] ?? now - 30 * DAY);
    const from = startOfDay(startMs);
    const to = startOfDay(now);
    const points = [];
    if (hasHistory) {
      let idx = followDates.filter((d) => d < from).length;
      for (let t = from; t <= to; t += DAY) {
        while (idx < followDates.length && followDates[idx] < t + DAY) idx += 1;
        points.push({ t, v: idx });
      }
    }
    const newFollowers = followDates.filter((d) => inPeriod(d)).length;

    const postsIn = posts.filter((p) => inPeriod(toMs(p.createdAt)));
    const livesIn = lives.filter((l) => inPeriod(toMs(l.createdAt)));
    const likesTotal = posts.reduce((a, p) => a + (Number(p.likes) || 0), 0);
    const commentsTotal = posts.reduce((a, p) => a + (Number(p.commentsCount) || 0), 0);

    const byType = { photo: 0, video: 0, carousel: 0 };
    posts.forEach((p) => { if (byType[p.type] !== undefined) byType[p.type] += 1; });
    const exclusive = posts.filter((p) => p.exclusive).length;

    const topPosts = [...posts].sort((a, b) => (Number(b.likes) || 0) - (Number(a.likes) || 0)).slice(0, 10);
    const topLives = [...lives].sort((a, b) => (Number(b.viewers) || 0) - (Number(a.viewers) || 0)).slice(0, 10);

    const liveStatus = {
      live: lives.filter((l) => l.status === 'live').length,
      scheduled: lives.filter((l) => l.status === 'scheduled').length,
      ended: lives.filter((l) => l.status === 'ended').length,
      premium: lives.filter((l) => l.isPremium).length,
    };
    const viewersTotal = lives.reduce((a, l) => a + (Number(l.viewers) || 0), 0);

    return {
      followers: follows.length, hasHistory, points, newFollowers,
      posts: posts.length, newPosts: postsIn.length,
      lives: lives.length, newLives: livesIn.length,
      likesTotal, commentsTotal, avgLikes: posts.length ? likesTotal / posts.length : 0,
      byType, exclusive, topPosts, topLives, liveStatus, viewersTotal,
      avgViewers: lives.length ? viewersTotal / lives.length : 0,
    };
  }, [state, period]);

  const blocks = {
    chart: { title: 'Crescimento de seguidores', body: (
      <>
          <div style={s.bigRow}>
            <span style={s.bigNum}>{num(m.followers)}</span>
            <span style={s.delta}>{m.hasHistory ? `+${num(m.newFollowers)} no período` : ''}</span>
          </div>
          {m.hasHistory ? (
            <LineChart points={m.points} />
          ) : (
            <p style={s.empty}>
              {m.followers === 0
                ? 'Você ainda não tem seguidores. Quando chegarem, a curva de crescimento aparece aqui.'
                : 'Os seguidores atuais não têm a data em que começaram a seguir, então ainda não dá para desenhar a curva de crescimento.'}
            </p>
          )}
      </>
    ) },
    tl: { title: 'Lives com mais espectadores', body: (
      <>
          <Ranking
            empty="Quando você fizer lives, as mais assistidas aparecem aqui."
            items={m.topLives.map((l) => ({
              id: l.id, img: l.thumbnail || l.teaserUrl || l.userPhoto, title: l.title || 'Live',
              sub: l.isPremium ? 'Premiada' : (l.status === 'live' ? 'Ao vivo' : l.status === 'scheduled' ? 'Agendada' : 'Encerrada'),
              value: Number(l.viewers) || 0, icon: Users,
            }))}
          />
      </>
    ) },
    tp: { title: 'Posts com mais curtidas', body: (
      <>
          <Ranking
            empty="Quando você postar, os posts mais curtidos aparecem aqui."
            items={m.topPosts.map((p) => ({
              id: p.id, img: p.thumbnailUrl || (p.type === 'photo' ? p.mediaUrl : p.mediaItems?.[0]?.thumbnailUrl || p.mediaItems?.[0]?.url),
              title: p.caption || 'Sem legenda',
              sub: `${num(p.commentsCount)} comentários`, value: Number(p.likes) || 0, icon: Heart,
            }))}
          />
      </>
    ) },
    b1: { title: 'Conteúdo', body: (
      <>
          <Bars
            rows={[
              { label: 'Fotos', value: m.byType.photo, icon: ImageIcon },
              { label: 'Vídeos', value: m.byType.video, icon: VideoIcon },
              { label: 'Carrosséis', value: m.byType.carousel, icon: ImageIcon },
              { label: 'Exclusivos', value: m.exclusive, icon: Lock },
            ]}
          />
      </>
    ) },
    b2: { title: 'Engajamento', body: (
      <>
          <Stat label="Curtidas" value={num(m.likesTotal)} icon={Heart} />
          <Stat label="Comentários" value={num(m.commentsTotal)} icon={MessageCircle} />
          <Stat label="Curtidas por post" value={m.avgLikes.toFixed(1).replace('.', ',')} icon={Trophy} />
      </>
    ) },
    b3: { title: 'Resumo de lives', body: (
      <>
          <Stat label="Ao vivo agora" value={num(m.liveStatus.live)} icon={Radio} />
          <Stat label="Agendadas" value={num(m.liveStatus.scheduled)} icon={Radio} />
          <Stat label="Encerradas" value={num(m.liveStatus.ended)} icon={Radio} />
          <Stat label="Premiadas" value={num(m.liveStatus.premium)} icon={Trophy} gold />
          <Stat label="Espectadores por live" value={m.avgViewers.toFixed(1).replace('.', ',')} icon={Users} />
      </>
    ) },
    k1: { title: 'Seguidores', body: <KpiBody icon={Users} value={num(m.followers)} note={m.hasHistory ? `+${num(m.newFollowers)} no período` : 'total'} /> },
    k2: { title: 'Posts', body: <KpiBody icon={ImageIcon} value={num(m.posts)} note={`+${num(m.newPosts)} no período`} /> },
    k3: { title: 'Lives', body: <KpiBody icon={Radio} value={num(m.lives)} note={`+${num(m.newLives)} no período`} /> },
    k4: { title: 'Curtidas', body: <KpiBody icon={Heart} value={num(m.likesTotal)} note={`média de ${m.avgLikes.toFixed(1).replace('.', ',')} por post`} /> },
  };

  return (
    <div className="uou-dash">
      <style>{CSS}</style>

      <div style={s.header}>
        <h1 style={s.title}>Dashboard</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {changed && (
            <button type="button" style={s.resetBtn} onClick={reset}>Restaurar layout</button>
          )}
        <div style={s.periods}>
          {PERIODS.map((p) => (
            <button key={p.id} type="button" style={s.periodBtn(period === p.id)} onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        </div>
      </div>

      {state.error && <p style={s.error}>Não foi possível carregar seus dados agora. Tente recarregar a página.</p>}

      <div className="uou-grid" style={{ opacity: state.loading ? 0.5 : 1 }}>
        {SLOTS.map((slot, i) => {
          const id = order[i];
          return (
            <Panel key={id} area={slot} title={blocks[id].title} drag={dragProps(id)}>
              {blocks[id].body}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function KpiBody({ icon: Icon, value, note }) {
  return (
    <>
      <div style={s.kpiTop}>
        <Icon size={18} color={GREEN} />
        <span style={s.kpiValue}>{value}</span>
      </div>
      <p style={s.kpiNote}>{note}</p>
    </>
  );
}

function Stat({ label, value, icon: Icon, gold }) {
  return (
    <div style={s.statRow}>
      <Icon size={14} color={gold ? GOLD : GREEN} />
      <span style={s.statLabel}>{label}</span>
      <b style={{ ...s.statValue, color: gold ? GOLD : '#f0f0f0' }}>{value}</b>
    </div>
  );
}

function Bars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((r) => (
        <div key={r.label}>
          <div style={s.barTop}>
            <span style={s.statLabel}>{r.label}</span>
            <b style={s.statValue}>{num(r.value)}</b>
          </div>
          <div style={s.barTrack}><div style={{ ...s.barFill, width: `${(r.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function Ranking({ items, empty }) {
  if (!items.length) return <p style={s.empty}>{empty}</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ol style={s.rankList}>
      {items.map((it, i) => (
        <li key={it.id} style={s.rankItem}>
          <span style={s.rankPos}>{i + 1}</span>
          <div style={{ ...s.rankImg, backgroundImage: it.img ? `url("${it.img}")` : 'none' }} />
          <div style={s.rankInfo}>
            <p style={s.rankTitle}>{it.title}</p>
            <p style={s.rankSub}>{it.sub}</p>
            <div style={s.rankBar}><div style={{ ...s.rankBarFill, width: `${(it.value / max) * 100}%` }} /></div>
          </div>
          <span style={s.rankValue}><it.icon size={13} color={GREEN} /> {num(it.value)}</span>
        </li>
      ))}
    </ol>
  );
}

function LineChart({ points }) {
  const [hover, setHover] = useState(null);
  const W = 640; const H = 220; const PX = 34; const PY = 18;
  const vals = points.map((p) => p.v);
  const min = Math.min(...vals); const max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const x = (i) => PX + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - PX - 10));
  const y = (v) => H - PY - ((v - min) / span) * (H - PY * 2);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - PY} L${x(0).toFixed(1)},${H - PY} Z`;
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PX) / (W - PX - 10)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const h = hover !== null ? points[hover] : null;
  const labels = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, i) => i);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <defs>
        <linearGradient id="dashFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={GREEN} stopOpacity="0.28" />
          <stop offset="1" stopColor={GREEN} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={PX} x2={W - 10} y1={H - PY - f * (H - PY * 2)} y2={H - PY - f * (H - PY * 2)} stroke="#2c2c2f" strokeDasharray="3 4" />
          <text x={PX - 6} y={H - PY - f * (H - PY * 2) + 4} fill="#777" fontSize="11" textAnchor="end">{Math.round(min + f * span)}</text>
        </g>
      ))}
      <path d={area} fill="url(#dashFill)" />
      <path d={line} fill="none" stroke={GREEN} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {labels.map((i) => (
        <text key={i} x={x(i)} y={H - 2} fill="#777" fontSize="11" textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>{dayLabel(points[i].t)}</text>
      ))}
      {h && (
        <g>
          <line x1={x(hover)} x2={x(hover)} y1={PY} y2={H - PY} stroke="#555" />
          <circle cx={x(hover)} cy={y(h.v)} r="4.5" fill={GREEN} stroke="#1b1b1d" strokeWidth="2" />
          <g transform={`translate(${Math.min(Math.max(x(hover) - 50, PX), W - 110)}, ${Math.max(y(h.v) - 44, 0)})`}>
            <rect width="100" height="34" rx="6" fill="#0b0b0c" stroke="#333" />
            <text x="50" y="14" fill="#aaa" fontSize="10.5" textAnchor="middle">{dayLabel(h.t)}</text>
            <text x="50" y="28" fill="#fff" fontSize="12" fontWeight="700" textAnchor="middle">{num(h.v)} seguidores</text>
          </g>
        </g>
      )}
    </svg>
  );
}

// Encaixe dos painéis (estilo Premiere): larguras e alturas diferentes, sem folga entre eles
const CSS = `
.uou-grid{display:grid;gap:4px;grid-template-columns:repeat(12,minmax(0,1fr));grid-auto-rows:minmax(86px,auto);
  grid-template-areas:
   "chart chart chart chart chart chart chart k1 k1 k1 k2 k2"
   "chart chart chart chart chart chart chart k1 k1 k1 k2 k2"
   "chart chart chart chart chart chart chart k3 k3 k3 k4 k4"
   "chart chart chart chart chart chart chart k3 k3 k3 k4 k4"
   "tl tl tl tl tl tp tp tp tp tp tp tp"
   "tl tl tl tl tl tp tp tp tp tp tp tp"
   "tl tl tl tl tl tp tp tp tp tp tp tp"
   "tl tl tl tl tl tp tp tp tp tp tp tp"
   "b1 b1 b1 b1 b2 b2 b2 b2 b3 b3 b3 b3";}
@media (max-width:1100px){
 .uou-grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-areas:"chart chart" "k1 k2" "k3 k4" "tl tl" "tp tp" "b1 b2" "b3 b3"}
}
@media (max-width:620px){
 .uou-grid{grid-template-columns:minmax(0,1fr);grid-template-areas:"chart" "k1" "k2" "k3" "k4" "tl" "tp" "b1" "b2" "b3"}
}
`;

const s = {
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '0 0 14px 0' },
  title: { color: '#f0f0f0', fontSize: 22, fontWeight: 700, margin: 0, fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif" },
  periods: { display: 'flex', gap: 4, padding: 3, backgroundColor: '#1b1b1d', borderRadius: 8 },
  periodBtn: (a) => ({
    border: a ? `1px solid ${GREEN}` : '1px solid transparent', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit', backgroundColor: a ? 'rgba(82, 250, 53, 0.1)' : 'transparent', color: a ? GREEN : '#999',
  }),
  resetBtn: {
    border: '1px solid #2a2a2d', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit', backgroundColor: 'transparent', color: '#aaa',
  },
  error: { color: '#ff6b6b', fontSize: 13, margin: '0 0 10px 0' },
  bigRow: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 },
  bigNum: { color: '#fff', fontSize: 34, fontWeight: 800 },
  delta: { color: GREEN, fontSize: 13, fontWeight: 600 },
  empty: { color: '#777', fontSize: 13, lineHeight: 1.6, margin: 0 },
  kpiTop: { display: 'flex', alignItems: 'center', gap: 10 },
  kpiValue: { color: '#fff', fontSize: 28, fontWeight: 800 },
  kpiNote: { color: '#888', fontSize: 12, margin: '6px 0 0 0' },
  statRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #262628' },
  statLabel: { color: '#9a9a9f', fontSize: 12.5, flex: 1 },
  statValue: { fontSize: 13.5 },
  barTop: { display: 'flex', justifyContent: 'space-between', marginBottom: 5, color: '#f0f0f0' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: '#2a2a2d' },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: GREEN },
  rankList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  rankItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 6, backgroundColor: '#222224' },
  rankPos: { width: 18, textAlign: 'center', color: '#777', fontSize: 12, fontWeight: 700, flexShrink: 0 },
  rankImg: { width: 38, height: 38, borderRadius: 6, backgroundColor: '#2f2f33', backgroundSize: 'cover', backgroundPosition: 'center', flexShrink: 0 },
  rankInfo: { flex: 1, minWidth: 0 },
  rankTitle: { color: '#f0f0f0', fontSize: 13, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rankSub: { color: '#777', fontSize: 11, margin: '1px 0 4px 0' },
  rankBar: { height: 3, borderRadius: 2, backgroundColor: '#2f2f33' },
  rankBarFill: { height: '100%', borderRadius: 2, backgroundColor: GREEN },
  rankValue: { display: 'flex', alignItems: 'center', gap: 4, color: '#f0f0f0', fontSize: 13, fontWeight: 700, flexShrink: 0 },
};
