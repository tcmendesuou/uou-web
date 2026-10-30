// src/lib/editorTransitions.js
// Transições do editor do UOU. A transição fica no clipe que ENTRA (clip.transition) e acontece
// na emenda com o clipe anterior, sem mudar a duração total: metade no fim do clipe anterior e
// metade no começo do clipe novo. A prévia (CSS) e a exportação (canvas) usam as mesmas contas.

export const DEFAULT_TRANSITION_SECONDS = 0.8;

export const TRANSITIONS = [
  { id: 'none', name: 'Nenhuma' },
  { id: 'fade', name: 'Dissolver' },
  { id: 'dip', name: 'Fade preto' },
  { id: 'slideL', name: 'Deslizar ←' },
  { id: 'slideR', name: 'Deslizar →' },
  { id: 'zoom', name: 'Zoom' },
  { id: 'wipe', name: 'Cortina' },
];

/**
 * Qual transição está acontecendo no instante t (segundos na linha do tempo)?
 * layout: [{ start, len, transition? }]  →  { outIdx, inIdx, p (0..1), cut, half, type } ou null
 */
export function transitionAt(layout, t) {
  for (let i = 1; i < layout.length; i++) {
    const c = layout[i];
    const tr = c.transition;
    if (!tr || !tr.type || tr.type === 'none') continue;
    const half = Math.min((tr.duration || 0) / 2, layout[i - 1].len / 2, c.len / 2);
    if (half <= 0.02) continue;
    const from = c.start - half;
    if (t >= from && t < c.start + half) {
      return { outIdx: i - 1, inIdx: i, p: (t - from) / (2 * half), cut: c.start, half, type: tr.type };
    }
  }
  return null;
}

const BASE = { alpha: 1, tx: 0, scale: 1, reveal: 1 };

/** Como cada camada fica no progresso p (0..1). tx é fração da largura; reveal é a fração visível (cortina). */
export function effectParams(type, p) {
  const out = { ...BASE };
  const inn = { ...BASE };
  switch (type) {
    case 'fade': inn.alpha = p; break;
    case 'dip':
      if (p < 0.5) { out.alpha = 1 - 2 * p; inn.alpha = 0; } else { out.alpha = 0; inn.alpha = 2 * p - 1; }
      break;
    case 'slideL': out.tx = -p; inn.tx = 1 - p; break;
    case 'slideR': out.tx = p; inn.tx = -(1 - p); break;
    case 'zoom': inn.alpha = p; inn.scale = 1.25 - 0.25 * p; break;
    case 'wipe': inn.reveal = p; break;
    default: break;
  }
  return { out, inn };
}

/** Parâmetros → estilo CSS (prévia). */
export function cssFor(prm) {
  return {
    opacity: String(prm.alpha),
    transform: prm.tx || prm.scale !== 1 ? `translateX(${prm.tx * 100}%) scale(${prm.scale})` : 'none',
    clipPath: prm.reveal < 1 ? `inset(0 ${(1 - prm.reveal) * 100}% 0 0)` : 'none',
  };
}

/** Desenha a transição num canvas (exportação). */
export function drawTransition(ctx, type, p, outCanvas, inCanvas, w, h, outFilter = 'none', inFilter = 'none') {
  const { out, inn } = effectParams(type, p);
  ctx.filter = 'none';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const layer = (canvas, prm, filter) => {
    if (!canvas || prm.alpha <= 0) return;
    ctx.save();
    if (prm.reveal < 1) {
      ctx.beginPath();
      ctx.rect(0, 0, w * prm.reveal, h);
      ctx.clip();
    }
    ctx.filter = filter || 'none';
    ctx.globalAlpha = prm.alpha;
    ctx.translate(w / 2 + prm.tx * w, h / 2);
    ctx.scale(prm.scale, prm.scale);
    ctx.drawImage(canvas, -w / 2, -h / 2, w, h);
    ctx.restore();
  };
  layer(outCanvas, out, outFilter);
  layer(inCanvas, inn, inFilter);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
}
