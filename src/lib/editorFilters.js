// src/lib/editorFilters.js
// Filtros do editor de vídeo do UOU. Cada filtro é um conjunto de ajustes (CSS filter),
// com intensidade de 0 a 1. O mesmo texto serve para a prévia (video.style.filter)
// e para a exportação (ctx.filter do canvas).
export const NEUTRAL = { brightness: 1, contrast: 1, saturate: 1, sepia: 0, grayscale: 0, hue: 0, blur: 0 };

export const FILTERS = [
  { id: 'none', name: 'Original', p: {} },
  { id: 'vivid', name: 'Vívido', p: { saturate: 1.6, contrast: 1.12 } },
  { id: 'warm', name: 'Quente', p: { sepia: 0.28, saturate: 1.25, brightness: 1.05 } },
  { id: 'cool', name: 'Frio', p: { hue: 190, sepia: 0.18, saturate: 1.1, brightness: 1.03 } },
  { id: 'vintage', name: 'Vintage', p: { sepia: 0.6, contrast: 0.92, saturate: 0.85, brightness: 1.05 } },
  { id: 'bw', name: 'P&B', p: { grayscale: 1, contrast: 1.15 } },
  { id: 'noir', name: 'Noir', p: { grayscale: 1, contrast: 1.5, brightness: 0.85 } },
  { id: 'fade', name: 'Fosco', p: { contrast: 0.82, brightness: 1.12, saturate: 0.8 } },
  { id: 'drama', name: 'Drama', p: { contrast: 1.4, saturate: 1.2, brightness: 0.9 } },
  { id: 'dream', name: 'Sonho', p: { brightness: 1.12, saturate: 1.3, contrast: 0.92, blur: 0.6 } },
  { id: 'neon', name: 'Neon', p: { hue: 300, saturate: 1.9, contrast: 1.2 } },
];

// Texto de filtro CSS para um { id, amount } (amount 0..1). Sem filtro → 'none'.
export function filterCss(f) {
  if (!f || !f.id || f.id === 'none') return 'none';
  const def = FILTERS.find((x) => x.id === f.id);
  if (!def) return 'none';
  const a = f.amount == null ? 1 : Math.max(0, Math.min(1, f.amount));
  const v = {};
  Object.keys(NEUTRAL).forEach((k) => {
    const to = def.p[k] == null ? NEUTRAL[k] : def.p[k];
    v[k] = NEUTRAL[k] + (to - NEUTRAL[k]) * a;
  });
  return `brightness(${v.brightness}) contrast(${v.contrast}) saturate(${v.saturate}) sepia(${v.sepia}) grayscale(${v.grayscale}) hue-rotate(${v.hue}deg) blur(${v.blur}px)`;
}
