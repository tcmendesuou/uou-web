// src/lib/liveBackgrounds.js
// Ambientes de fundo para a live (estilo Google Meet), desenhados por código:
// não dependem de arquivos de imagem. Cada cena é desenhada num canvas
// 1280x720 e levemente desfocada, como um fundo de verdade fora de foco.

const W = 1280;
const H = 720;

// Aleatório repetível (a mesma cena sempre sai igual)
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function vGrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([p, c]) => g.addColorStop(p, c));
  return g;
}

function rect(ctx, x, y, w, h, fill, r = 0) {
  ctx.fillStyle = fill;
  if (r > 0 && ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, w, h);
  }
}

function circle(ctx, x, y, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function glow(ctx, x, y, r, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

function plant(ctx, x, y, scale = 1) {
  rect(ctx, x - 28 * scale, y - 70 * scale, 56 * scale, 70 * scale, '#b5835a', 8 * scale);
  const leaves = ['#2f7d3a', '#3c9a49', '#287033'];
  for (let i = 0; i < 9; i += 1) {
    const a = -Math.PI / 2 + (i - 4) * 0.28;
    ctx.save();
    ctx.translate(x, y - 66 * scale);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = leaves[i % 3];
    ctx.beginPath();
    ctx.ellipse(0, -60 * scale, 20 * scale, 62 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function bookshelf(ctx, x, y, w, h, rand, rows = 4) {
  rect(ctx, x, y, w, h, '#4a2f1d');
  const rowH = h / rows;
  const colors = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#d35400', '#16a085', '#ecf0f1'];
  for (let r = 0; r < rows; r += 1) {
    const baseY = y + (r + 1) * rowH - 6;
    let bx = x + 8;
    while (bx < x + w - 16) {
      const bw = 12 + rand() * 16;
      const bh = rowH * (0.55 + rand() * 0.35);
      rect(ctx, bx, baseY - bh, bw, bh, colors[Math.floor(rand() * colors.length)], 2);
      bx += bw + 2;
    }
    rect(ctx, x, baseY, w, 6, '#2e1c10');
  }
}

function skyline(ctx, baseY, rand, color, windowColor, minH, maxH) {
  let x = -20;
  while (x < W) {
    const bw = 50 + rand() * 90;
    const bh = minH + rand() * (maxH - minH);
    rect(ctx, x, baseY - bh, bw, bh + (H - baseY), color);
    if (windowColor) {
      for (let wy = baseY - bh + 14; wy < baseY - 8; wy += 22) {
        for (let wx = x + 8; wx < x + bw - 12; wx += 18) {
          if (rand() > 0.45) rect(ctx, wx, wy, 8, 12, windowColor);
        }
      }
    }
    x += bw + 4;
  }
}

function mountains(ctx, baseY, rand, color, peak, jag) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, baseY);
  let x = 0;
  while (x < W) {
    const up = peak * (0.5 + rand() * 0.5);
    ctx.lineTo(x + jag / 2, baseY - up);
    x += jag;
    ctx.lineTo(x, baseY - peak * 0.15 * rand());
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

function palm(ctx, x, baseY, h, lean) {
  ctx.strokeStyle = '#6b4a2b';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.quadraticCurveTo(x + lean * 0.4, baseY - h * 0.6, x + lean, baseY - h);
  ctx.stroke();
  const tx = x + lean;
  const ty = baseY - h;
  ctx.fillStyle = '#1f6b34';
  for (let i = 0; i < 7; i += 1) {
    const a = -Math.PI + (i / 6) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + Math.cos(a) * 90, ty + Math.sin(a) * 90 - 30, tx + Math.cos(a) * 150, ty + Math.sin(a) * 60 + 40);
    ctx.quadraticCurveTo(tx + Math.cos(a) * 90, ty + Math.sin(a) * 90 - 6, tx, ty);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- cenas
const SCENES = [
  {
    id: 'escritorio',
    label: 'Escritório',
    group: 'Casa e trabalho',
    draw(ctx) {
      const rand = rng(11);
      rect(ctx, 0, 0, W, H, vGrad(ctx, 0, H, [[0, '#e9e4dc'], [1, '#cfc7ba']]));
      // janela com cidade
      rect(ctx, 760, 70, 400, 330, '#f4f1ec', 10);
      rect(ctx, 780, 90, 360, 290, vGrad(ctx, 90, 380, [[0, '#9fd3f5'], [1, '#e8f4fb']]));
      ctx.save();
      ctx.beginPath();
      ctx.rect(780, 90, 360, 290);
      ctx.clip();
      skyline(ctx, 380, rng(5), '#8fa8bd', '#cfe3f2', 60, 190);
      ctx.restore();
      rect(ctx, 955, 90, 10, 290, '#f4f1ec');
      rect(ctx, 780, 230, 360, 10, '#f4f1ec');
      // estante
      bookshelf(ctx, 70, 80, 360, 320, rand, 4);
      plant(ctx, 520, 470, 1.1);
      // mesa
      rect(ctx, 0, 520, W, 24, '#8a6a4a');
      rect(ctx, 0, 544, W, H - 544, '#6e5238');
      // luminária
      rect(ctx, 1080, 430, 8, 92, '#444');
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath();
      ctx.moveTo(1050, 430);
      ctx.lineTo(1118, 430);
      ctx.lineTo(1100, 380);
      ctx.lineTo(1068, 380);
      ctx.fill();
      glow(ctx, 1084, 420, 160, 'rgba(255,220,140,0.55)');
    },
  },
  {
    id: 'sala',
    label: 'Sala moderna',
    group: 'Casa e trabalho',
    draw(ctx) {
      rect(ctx, 0, 0, W, 560, vGrad(ctx, 0, 560, [[0, '#d9d2c7'], [1, '#c9c0b2']]));
      rect(ctx, 0, 560, W, H - 560, vGrad(ctx, 560, H, [[0, '#9a7753'], [1, '#7c5c3d']]));
      for (let x = 0; x < W; x += 120) rect(ctx, x, 560, 2, H - 560, 'rgba(0,0,0,0.12)');
      // quadros
      rect(ctx, 150, 110, 190, 250, '#2c2c2c', 6);
      rect(ctx, 162, 122, 166, 226, '#e8b04a');
      circle(ctx, 245, 235, 52, '#c0392b');
      rect(ctx, 380, 150, 150, 190, '#2c2c2c', 6);
      rect(ctx, 392, 162, 126, 166, '#5aa9a1');
      rect(ctx, 392, 245, 126, 83, '#2f6f73');
      // sofá
      rect(ctx, 560, 380, 560, 190, '#3f5a73', 40);
      rect(ctx, 590, 330, 500, 120, '#4a6a86', 36);
      rect(ctx, 620, 380, 200, 110, '#557797', 22);
      rect(ctx, 840, 380, 200, 110, '#557797', 22);
      rect(ctx, 590, 540, 18, 30, '#2a2a2a');
      rect(ctx, 1080, 540, 18, 30, '#2a2a2a');
      plant(ctx, 1190, 580, 1.25);
      // abajur de chão
      rect(ctx, 80, 300, 8, 270, '#333');
      ctx.fillStyle = '#f6e3b4';
      ctx.beginPath();
      ctx.moveTo(40, 300);
      ctx.lineTo(128, 300);
      ctx.lineTo(108, 235);
      ctx.lineTo(60, 235);
      ctx.fill();
      glow(ctx, 84, 275, 200, 'rgba(255,225,150,0.5)');
    },
  },
  {
    id: 'biblioteca',
    label: 'Biblioteca',
    group: 'Casa e trabalho',
    draw(ctx) {
      const rand = rng(23);
      rect(ctx, 0, 0, W, H, '#2a1a10');
      bookshelf(ctx, 0, 30, 420, 560, rand, 6);
      bookshelf(ctx, 430, 30, 420, 560, rand, 6);
      bookshelf(ctx, 860, 30, 420, 560, rand, 6);
      rect(ctx, 0, 590, W, H - 590, '#4b3321');
      glow(ctx, 640, 120, 520, 'rgba(255,200,120,0.45)');
      glow(ctx, 200, 600, 300, 'rgba(255,190,110,0.3)');
    },
  },
  {
    id: 'cafe',
    label: 'Café',
    group: 'Casa e trabalho',
    draw(ctx) {
      const rand = rng(31);
      rect(ctx, 0, 0, W, H, vGrad(ctx, 0, H, [[0, '#6b4a34'], [1, '#4a3022']]));
      // janela grande
      rect(ctx, 80, 60, 520, 420, '#2a1b12', 8);
      rect(ctx, 96, 76, 488, 388, vGrad(ctx, 76, 464, [[0, '#ffd9a0'], [1, '#c9e3f5']]));
      ctx.save();
      ctx.beginPath();
      ctx.rect(96, 76, 488, 388);
      ctx.clip();
      skyline(ctx, 464, rng(9), '#8e7a6a', 'rgba(255,240,200,0.8)', 40, 140);
      ctx.restore();
      rect(ctx, 336, 76, 8, 388, '#2a1b12');
      // prateleira com xícaras
      rect(ctx, 700, 250, 520, 14, '#2a1b12');
      for (let i = 0; i < 8; i += 1) {
        const x = 720 + i * 62;
        rect(ctx, x, 214, 38, 36, ['#f5efe6', '#d9a066', '#fff'][i % 3], 8);
      }
      rect(ctx, 700, 400, 520, 14, '#2a1b12');
      bookshelf(ctx, 700, 280, 520, 120, rand, 1);
      // luminárias pendentes
      [760, 960, 1160].forEach((x) => {
        rect(ctx, x, 0, 3, 90, '#1c1c1c');
        ctx.fillStyle = '#e8b04a';
        ctx.beginPath();
        ctx.arc(x + 1, 100, 34, Math.PI, 0);
        ctx.fill();
        glow(ctx, x + 1, 120, 150, 'rgba(255,200,110,0.55)');
      });
      rect(ctx, 0, 560, W, H - 560, '#3a2619');
      rect(ctx, 0, 540, W, 24, '#8a5a3a');
    },
  },
  {
    id: 'estudio-neon',
    label: 'Estúdio neon',
    group: 'Criativo',
    draw(ctx) {
      rect(ctx, 0, 0, W, H, vGrad(ctx, 0, H, [[0, '#0b0620'], [1, '#150a2e']]));
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      const arch = (x, color) => {
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 40;
        ctx.beginPath();
        ctx.moveTo(x, 600);
        ctx.lineTo(x, 300);
        ctx.arc(x + 110, 300, 110, Math.PI, 0);
        ctx.lineTo(x + 220, 600);
        ctx.stroke();
      };
      arch(150, '#ff3cac');
      arch(530, '#2bd2ff');
      arch(910, '#b26bff');
      ctx.shadowBlur = 0;
      rect(ctx, 0, 600, W, H - 600, '#0a0518');
      glow(ctx, 260, 640, 260, 'rgba(255,60,172,0.5)');
      glow(ctx, 640, 640, 260, 'rgba(43,210,255,0.5)');
      glow(ctx, 1020, 640, 260, 'rgba(178,107,255,0.5)');
    },
  },
  {
    id: 'espaco',
    label: 'Espaço',
    group: 'Criativo',
    draw(ctx) {
      const rand = rng(77);
      rect(ctx, 0, 0, W, H, '#03030c');
      glow(ctx, 300, 200, 520, 'rgba(110,60,200,0.55)');
      glow(ctx, 1000, 480, 560, 'rgba(30,120,200,0.45)');
      glow(ctx, 700, 80, 300, 'rgba(220,80,160,0.35)');
      for (let i = 0; i < 380; i += 1) {
        const r = rand() * 1.8 + 0.3;
        ctx.globalAlpha = 0.4 + rand() * 0.6;
        circle(ctx, rand() * W, rand() * H, r, '#fff');
      }
      ctx.globalAlpha = 1;
      // planeta
      const g = ctx.createRadialGradient(1010, 250, 10, 1060, 300, 190);
      g.addColorStop(0, '#f6c38d');
      g.addColorStop(1, '#a8452e');
      circle(ctx, 1060, 300, 150, g);
      ctx.strokeStyle = 'rgba(255,230,200,0.7)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.ellipse(1060, 300, 260, 52, -0.3, 0, Math.PI * 2);
      ctx.stroke();
      // lua pequena
      circle(ctx, 240, 520, 46, '#cfd3da');
      circle(ctx, 224, 508, 10, '#b5bac3');
      circle(ctx, 256, 534, 7, '#b5bac3');
    },
  },
  {
    id: 'praia',
    label: 'Praia',
    group: 'Natureza',
    draw(ctx) {
      rect(ctx, 0, 0, W, 400, vGrad(ctx, 0, 400, [[0, '#4fb4f2'], [1, '#d9f1ff']]));
      circle(ctx, 980, 170, 70, '#fff6c8');
      glow(ctx, 980, 170, 260, 'rgba(255,240,170,0.7)');
      // nuvens
      [[220, 120], [520, 200], [760, 90]].forEach(([x, y]) => {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        [0, 40, 80, 120].forEach((dx, i) => {
          ctx.beginPath();
          ctx.arc(x + dx, y + (i % 2) * 8, 38 - i * 3, 0, Math.PI * 2);
          ctx.fill();
        });
      });
      rect(ctx, 0, 390, W, 150, vGrad(ctx, 390, 540, [[0, '#3aa6c9'], [1, '#7fd6d9']]));
      for (let i = 0; i < 6; i += 1) rect(ctx, 0, 410 + i * 22, W, 2, 'rgba(255,255,255,0.35)');
      rect(ctx, 0, 530, W, H - 530, vGrad(ctx, 530, H, [[0, '#f1dca8'], [1, '#d9bd84']]));
      palm(ctx, 140, 680, 420, 110);
      palm(ctx, 1130, 700, 380, -90);
    },
  },
  {
    id: 'montanhas',
    label: 'Montanhas',
    group: 'Natureza',
    draw(ctx) {
      const rand = rng(5);
      rect(ctx, 0, 0, W, H, vGrad(ctx, 0, 460, [[0, '#7aa7e6'], [1, '#f6e1c3']]));
      circle(ctx, 300, 200, 56, '#fff1d0');
      glow(ctx, 300, 200, 240, 'rgba(255,230,170,0.6)');
      mountains(ctx, 470, rand, '#9db4d6', 280, 220);
      mountains(ctx, 520, rand, '#6f8fb8', 240, 190);
      mountains(ctx, 580, rand, '#3f6a8f', 170, 150);
      rect(ctx, 0, 560, W, H - 560, vGrad(ctx, 560, H, [[0, '#4d8fb5'], [1, '#2e6a8e']]));
      for (let i = 0; i < 7; i += 1) rect(ctx, 100 + i * 150, 590 + (i % 3) * 22, 90, 3, 'rgba(255,255,255,0.35)');
    },
  },
  {
    id: 'floresta',
    label: 'Floresta',
    group: 'Natureza',
    draw(ctx) {
      const rand = rng(91);
      rect(ctx, 0, 0, W, H, vGrad(ctx, 0, H, [[0, '#d7efc2'], [0.5, '#7bb36a'], [1, '#2d5a35']]));
      glow(ctx, 640, 80, 520, 'rgba(255,255,200,0.7)');
      for (let i = 0; i < 9; i += 1) {
        const x = 40 + i * 150 + rand() * 40;
        const w = 26 + rand() * 30;
        rect(ctx, x, 0, w, H, `rgba(${40 + rand() * 30},${60 + rand() * 30},${35},${0.55 + rand() * 0.3})`);
      }
      for (let i = 0; i < 40; i += 1) {
        ctx.globalAlpha = 0.18 + rand() * 0.25;
        circle(ctx, rand() * W, rand() * 420, 14 + rand() * 38, '#fffbd0');
      }
      ctx.globalAlpha = 1;
      rect(ctx, 0, 620, W, H - 620, '#27492c');
    },
  },
  {
    id: 'cidade-por-do-sol',
    label: 'Cidade ao pôr do sol',
    group: 'Cidade',
    draw(ctx) {
      rect(ctx, 0, 0, W, H, vGrad(ctx, 0, 520, [[0, '#2b1055'], [0.45, '#d4507a'], [0.8, '#ffb36b'], [1, '#ffe0a8']]));
      circle(ctx, 640, 470, 90, '#ffe9b0');
      glow(ctx, 640, 470, 360, 'rgba(255,200,120,0.6)');
      skyline(ctx, 560, rng(3), '#3b2a5a', null, 70, 220);
      skyline(ctx, 640, rng(8), '#1d1334', 'rgba(255,214,120,0.85)', 120, 340);
      rect(ctx, 0, 660, W, H - 660, '#120a22');
    },
  },
  {
    id: 'cidade-noite',
    label: 'Cidade à noite',
    group: 'Cidade',
    draw(ctx) {
      const rand = rng(14);
      rect(ctx, 0, 0, W, H, vGrad(ctx, 0, H, [[0, '#050818'], [1, '#18204a']]));
      for (let i = 0; i < 120; i += 1) {
        ctx.globalAlpha = 0.3 + rand() * 0.6;
        circle(ctx, rand() * W, rand() * 300, rand() * 1.4 + 0.3, '#fff');
      }
      ctx.globalAlpha = 1;
      circle(ctx, 1040, 120, 44, '#f1f3ff');
      glow(ctx, 1040, 120, 200, 'rgba(180,200,255,0.4)');
      skyline(ctx, 520, rng(2), '#101634', 'rgba(255,220,130,0.65)', 80, 260);
      skyline(ctx, 640, rng(6), '#0a0e24', 'rgba(255,230,150,0.9)', 160, 380);
      rect(ctx, 0, 650, W, H - 650, '#05070f');
    },
  },
];

export const BACKGROUND_SCENES = SCENES.map(({ id, label, group }) => ({ id, label, group }));

const cache = new Map();

/** Gera a imagem da cena (data URL JPEG). width 1280 para a live, menor para miniaturas. */
export function renderScene(id, width = W) {
  const key = `${id}@${width}`;
  if (cache.has(key)) return cache.get(key);
  const scene = SCENES.find((s) => s.id === id);
  if (!scene) return '';

  // 1) desenha em tamanho cheio
  const base = document.createElement('canvas');
  base.width = W;
  base.height = H;
  const bctx = base.getContext('2d');
  scene.draw(bctx);

  // 2) copia (com leve desfoque, como fundo fora de foco) no tamanho pedido
  const out = document.createElement('canvas');
  out.width = width;
  out.height = Math.round((width * H) / W);
  const octx = out.getContext('2d');
  if (width >= W) octx.filter = 'blur(3px)';
  octx.drawImage(base, 0, 0, out.width, out.height);
  octx.filter = 'none';

  const url = out.toDataURL('image/jpeg', 0.88);
  cache.set(key, url);
  return url;
}
