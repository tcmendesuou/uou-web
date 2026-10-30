// src/components/LiveInfoPanel.jsx
// Aba "Infos" do painel lateral da live: tudo sobre a live num lugar só
// (status, tempo, espectadores, valores e, nas premiadas, o prêmio e o pote).
import React from 'react';
import { Trophy, Users, Clock, Ticket, Tag, CalendarClock, Coins } from 'lucide-react';
import { brl } from '../lib/liveLogic';
import { formatClock } from '../lib/liveHooks';

const GOLD = '#FFD700';

const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export default function LiveInfoPanel({ live, clock, remainingSeconds }) {
  if (!live) return null;
  const isLive = live.status === 'live';
  const premium = !!live.isPremium;
  const fromPot = live.prizeSource === 'pot';
  const pot = live.potBalance || 0;
  const reserve = live.prizeReserve || 0;
  const organic = fromPot ? pot * ((live.prizePercent || 0) / 100) : 0;
  const prize = live.prizeDrawnAt
    ? live.prizeValuePaid || 0
    : fromPot
      ? Math.max(organic, reserve)
      : live.prizeAmount || 0;

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <span style={s.status(isLive)}>{isLive ? 'AO VIVO' : 'BACKSTAGE'}</span>
        {premium && <span style={s.premiumTag}>PREMIADA</span>}
      </div>
      <h3 style={s.title}>{live.title || 'Live'}</h3>
      {live.description ? <p style={s.desc}>{live.description}</p> : null}

      <div style={s.grid}>
        <Stat icon={Users} label="Espectadores" value={String(live.viewers || 0)} />
        <Stat
          icon={Clock}
          label={isLive ? 'Tempo restante' : 'Duração'}
          value={isLive && remainingSeconds !== null ? formatClock(remainingSeconds) : live.duration ? `${live.duration} min` : '—'}
        />
        <Stat icon={Ticket} label="Ingresso" value={live.price ? brl(live.price) : 'Grátis'} />
        {live.category ? <Stat icon={Tag} label="Tema" value={live.category} /> : null}
        {live.scheduledDate ? <Stat icon={CalendarClock} label="Agendada para" value={when(live.scheduledDate)} /> : null}
      </div>

      {premium && (
        <div style={s.prizeBox}>
          <div style={s.prizeHead}>
            <Trophy size={16} color={GOLD} />
            <span style={s.prizeTitle}>{live.prizeDrawnAt ? 'Prêmio pago' : 'Prêmio'}</span>
          </div>
          <p style={s.prizeValue}>{brl(prize)}</p>

          {!live.prizeDrawnAt && clock?.timerSeconds !== null && clock?.timerSeconds !== undefined && (
            <p style={s.line}>Sorteio em <b style={{ color: '#fff' }}>{formatClock(clock.timerSeconds)}</b></p>
          )}

          <div style={s.rows}>
            <Row label="Modelo" value={fromPot ? `${live.prizePercent || 0}% do pote` : 'Valor fixo'} />
            {fromPot && <Row label="Pote da live" value={brl(pot)} icon={Coins} />}
            {fromPot && <Row label="Parte do pote" value={brl(organic)} />}
            {reserve > 0 && <Row label="Garantia reservada" value={brl(reserve)} />}
          </div>
          {fromPot && (
            <p style={s.note}>O prêmio cresce conforme os espectadores entram e nunca fica abaixo da garantia.</p>
          )}
          {live.winnerName && <p style={s.winner}>Ganhador: {live.winnerName}</p>}
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div style={s.stat}>
      <Icon size={15} color="#52fa35" />
      <div style={{ minWidth: 0 }}>
        <p style={s.statLabel}>{label}</p>
        <p style={s.statValue}>{value}</p>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={s.row}>
      <span style={{ color: '#888' }}>{label}</span>
      <b style={{ color: '#f0f0f0' }}>{value}</b>
    </div>
  );
}

const s = {
  wrap: {
    padding: 16, backgroundColor: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 14,
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
  },
  head: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  status: (live) => ({
    fontSize: 10, fontWeight: 800, letterSpacing: 0.5, padding: '3px 8px', borderRadius: 999,
    color: live ? '#ff4d4d' : '#aaa', border: `1px solid ${live ? '#ff4d4d' : '#333'}`,
  }),
  premiumTag: {
    fontSize: 10, fontWeight: 800, letterSpacing: 0.5, padding: '3px 8px', borderRadius: 999,
    color: GOLD, border: `1px solid ${GOLD}`,
  },
  title: { color: '#f0f0f0', fontSize: 16, fontWeight: 700, margin: 0 },
  desc: { color: '#999', fontSize: 13, lineHeight: 1.5, margin: '6px 0 0 0' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 },
  stat: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 10px', borderRadius: 10,
    backgroundColor: '#13141a', border: '1px solid #1a1b22',
  },
  statLabel: { color: '#777', fontSize: 11, margin: 0 },
  statValue: { color: '#f0f0f0', fontSize: 13, fontWeight: 700, margin: '1px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  prizeBox: {
    marginTop: 14, padding: 14, borderRadius: 12, border: '1px solid rgba(255,215,0,0.35)', backgroundColor: 'rgba(255,215,0,0.05)',
  },
  prizeHead: { display: 'flex', alignItems: 'center', gap: 6 },
  prizeTitle: { color: GOLD, fontSize: 13, fontWeight: 700 },
  prizeValue: { color: GOLD, fontSize: 28, fontWeight: 800, margin: '6px 0 0 0' },
  line: { color: '#bbb', fontSize: 13, margin: '6px 0 0 0' },
  rows: { marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 },
  row: { display: 'flex', justifyContent: 'space-between', fontSize: 13 },
  note: { color: '#777', fontSize: 11.5, lineHeight: 1.5, margin: '10px 0 0 0' },
  winner: { color: '#fff', fontSize: 13, fontWeight: 700, margin: '10px 0 0 0' },
};
