// src/lib/editorText.js
// Textos sobre o vídeo (editor do UOU). Posição e tamanho são frações do quadro (0 a 1), então o
// resultado é igual na prévia (CSS) e na exportação (canvas), em qualquer proporção.

export const TEXT_FONTS = [
  { id: 'sans', name: 'Moderna', family: "'Plus Jakarta Sans', -apple-system, Arial, sans-serif", weight: 700 },
  { id: 'impact', name: 'Forte', family: "Impact, 'Arial Black', sans-serif", weight: 400 },
  { id: 'serif', name: 'Clássica', family: "Georgia, 'Times New Roman', serif", weight: 700 },
  { id: 'mono', name: 'Máquina', family: "'Courier New', monospace", weight: 700 },
  { id: 'hand', name: 'Manuscrita', family: "'Comic Sans MS', 'Segoe Print', cursive", weight: 700 },
];
export const TEXT_STYLES = [
  { id: 'plain', name: 'Simples' },
  { id: 'shadow', name: 'Sombra' },
  { id: 'outline', name: 'Contorno' },
  { id: 'box', name: 'Caixa' },
];
export const TEXT_ANIMS = [
  { id: 'none', name: 'Nenhuma' },
  { id: 'fade', name: 'Aparecer' },
  { id: 'pop', name: 'Pop' },
  { id: 'rise', name: 'Subir' },
];
export const TEXT_COLORS = ['#ffffff', '#000000', '#52fa35', '#ffd700', '#ff4d4d', '#4da6ff', '#ff4dd2'];

export const fontOf = (id) => TEXT_FONTS.find((f) => f.id === id) || TEXT_FONTS[0];

export function makeText(id, start) {
  return { id, text: 'Seu texto', start, dur: 3, x: 0.5, y: 0.5, size: 0.07, color: '#ffffff', font: 'sans', style: 'shadow', anim: 'fade' };
}

const IN = 0.3;
const OUT = 0.25;

/** Estado do texto no instante t: null se não está na tela; senão { alpha, scale, dy } (dy = fração da altura). */
export function textState(t, item) {
  const local = t - item.start;
  if (local < 0 || local >= item.dur) return null;
  const edge = Math.max(0, Math.min(1, (item.dur - local) / OUT));
  switch (item.anim) {
    case 'fade': return { alpha: Math.min(1, local / IN, edge), scale: 1, dy: 0 };
    case 'pop': return { alpha: Math.min(1, local / 0.12, edge), scale: local < 0.25 ? 0.7 + 0.3 * (local / 0.25) : 1, dy: 0 };
    case 'rise': return { alpha: Math.min(1, local / IN, edge), scale: 1, dy: local < IN ? (1 - local / IN) * 0.04 : 0 };
    default: return { alpha: 1, scale: 1, dy: 0 };
  }
}

/** Estilo CSS do texto na prévia. O tamanho usa cqh (a altura do quadro da prévia). */
export function textCss(item, st) {
  const f = fontOf(item.font);
  const css = {
    position: 'absolute',
    left: `${item.x * 100}%`,
    top: `${item.y * 100}%`,
    transform: `translate(-50%, -50%) translateY(${st.dy * 100}cqh) scale(${st.scale})`,
    opacity: st.alpha,
    fontSize: `${item.size * 100}cqh`,
    lineHeight: 1.2,
    fontFamily: f.family,
    fontWeight: f.weight,
    color: item.color,
    textAlign: 'center',
    whiteSpace: 'pre',
    userSelect: 'none',
  };
  if (item.style === 'shadow') css.textShadow = '0 0.06em 0.12em rgba(0,0,0,0.65)';
  if (item.style === 'outline') { css.WebkitTextStroke = '0.06em #000'; css.paintOrder = 'stroke fill'; }
  if (item.style === 'box') { css.background = 'rgba(0,0,0,0.6)'; css.padding = '0.25em 0.5em'; css.borderRadius = '0.25em'; }
  return css;
}

/** Desenha o texto no canvas da exportação (w, h = tamanho do vídeo de saída). */
export function drawText(ctx, item, st, w, h) {
  const f = fontOf(item.font);
  const px = item.size * h;
  const lines = String(item.text || '').split('\n');
  const lh = px * 1.2;
  ctx.save();
  ctx.filter = 'none';
  ctx.font = `${f.weight} ${px}px ${f.family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
  const totalH = lines.length * lh;
  ctx.globalAlpha = st.alpha;
  ctx.translate(item.x * w, item.y * h + st.dy * h);
  ctx.scale(st.scale, st.scale);
  if (item.style === 'box') {
    const padX = px * 0.5;
    const padY = px * 0.25;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-maxW / 2 - padX, -totalH / 2 - padY, maxW + padX * 2, totalH + padY * 2, px * 0.25);
    else ctx.rect(-maxW / 2 - padX, -totalH / 2 - padY, maxW + padX * 2, totalH + padY * 2);
    ctx.fill();
  }
  lines.forEach((line, i) => {
    const y = -totalH / 2 + lh * (i + 0.5);
    if (item.style === 'outline') {
      ctx.lineJoin = 'round';
      ctx.lineWidth = px * 0.06;
      ctx.strokeStyle = '#000';
      ctx.strokeText(line, 0, y);
    }
    if (item.style === 'shadow') {
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowOffsetY = px * 0.06;
      ctx.shadowBlur = px * 0.12;
    }
    ctx.fillStyle = item.color;
    ctx.fillText(line, 0, y);
  });
  ctx.restore();
}
