// src/components/BackgroundEffects.jsx
// Efeitos de fundo da câmera do criador (desfoque e imagem de fundo).
// Precisa estar dentro de <BackgroundFiltersProvider> (veja LiveHost.jsx).
// O efeito é aplicado no vídeo ANTES de ser enviado, então quem assiste pelo
// app ou pela web já vê o resultado.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useBackgroundFilters } from '@stream-io/video-react-sdk';
import { Sparkles, ImagePlus } from 'lucide-react';
import { BACKGROUND_SCENES, renderScene } from '../lib/liveBackgrounds';

const GREEN = '#52fa35';

// Fundos do UOU: é só colocar as imagens (jpg, png ou webp) na pasta
// src/assets/fundos-live/ e fazer o deploy — elas aparecem aqui sozinhas.
// A ordem segue o nome do arquivo (01-praia.jpg, 02-estudio.jpg...) e o nome
// mostrado vem do arquivo sem o número e sem a extensão.
const FUNDOS_UOU = Object.entries(
  import.meta.glob('../assets/fundos-live/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}', {
    eager: true,
    query: '?url',
    import: 'default',
  })
)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([path, url]) => {
    const file = path.split('/').pop().replace(/\.[^.]+$/, '');
    const label = file.replace(/^\d+[\s._-]*/, '').replace(/[-_]+/g, ' ').trim() || file;
    return { id: `fundo-${file}`, label: label.charAt(0).toUpperCase() + label.slice(1), url };
  });

// Cores/degradês simples
const PRESETS = [
  { id: 'uou', label: 'UOU', stops: ['#010208', '#0b3d12', '#52fa35'] },
  { id: 'noite', label: 'Noite', stops: ['#0f0c29', '#302b63', '#24243e'] },
  { id: 'por-do-sol', label: 'Pôr do sol', stops: ['#41295a', '#e5526b', '#f9a65a'] },
  { id: 'oceano', label: 'Oceano', stops: ['#06202b', '#077a7d', '#7ae7c7'] },
  { id: 'grafite', label: 'Grafite', stops: ['#111111', '#2b2b2b', '#444444'] },
];

function makeGradient(stops) {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 1280, 720);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1280, 720);
  return canvas.toDataURL('image/jpeg', 0.9);
}

export default function BackgroundEffects() {
  const {
    isSupported, isReady, isLoading,
    disableBackgroundFilter, applyBackgroundBlurFilter, applyBackgroundImageFilter,
  } = useBackgroundFilters();

  const [active, setActive] = useState('none');
  const [customUrl, setCustomUrl] = useState('');
  const customRef = useRef('');

  const presetUrls = useMemo(
    () => Object.fromEntries(PRESETS.map((p) => [p.id, makeGradient(p.stops)])),
    []
  );
  // Miniaturas dos ambientes (leves) e agrupamento por tema
  const sceneThumbs = useMemo(
    () => Object.fromEntries(BACKGROUND_SCENES.map((sc) => [sc.id, renderScene(sc.id, 180)])),
    []
  );
  const groups = useMemo(() => {
    const map = new Map();
    BACKGROUND_SCENES.forEach((sc) => {
      if (!map.has(sc.group)) map.set(sc.group, []);
      map.get(sc.group).push(sc);
    });
    return Array.from(map.entries());
  }, []);

  useEffect(() => () => {
    if (customRef.current) URL.revokeObjectURL(customRef.current);
  }, []);

  if (!isSupported) {
    return (
      <p style={styles.note}>
        Efeitos de fundo não são suportados neste navegador. Use o Chrome ou o Edge atualizados.
      </p>
    );
  }

  const choose = (id, apply) => {
    setActive(id);
    apply();
  };

  const pickCustom = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image')) return;
    if (customRef.current) URL.revokeObjectURL(customRef.current);
    const url = URL.createObjectURL(file);
    customRef.current = url;
    setCustomUrl(url);
    choose('custom', () => applyBackgroundImageFilter(url));
  };

  return (
    <div style={styles.box}>
      <div style={styles.head}>
        <Sparkles size={16} color={GREEN} />
        <span style={styles.title}>Efeitos de fundo</span>
        {isLoading && <span style={styles.loading}>carregando efeito...</span>}
        {!isLoading && active !== 'none' && !isReady && <span style={styles.loading}>preparando...</span>}
      </div>

      <div style={styles.chipRow}>
        <Chip active={active === 'none'} onClick={() => choose('none', disableBackgroundFilter)}>
          Nenhum
        </Chip>
        <Chip active={active === 'blur-low'} onClick={() => choose('blur-low', () => applyBackgroundBlurFilter('low'))}>
          Desfoque leve
        </Chip>
        <Chip active={active === 'blur-medium'} onClick={() => choose('blur-medium', () => applyBackgroundBlurFilter('medium'))}>
          Desfoque médio
        </Chip>
        <Chip active={active === 'blur-high'} onClick={() => choose('blur-high', () => applyBackgroundBlurFilter('high'))}>
          Desfoque forte
        </Chip>
      </div>

      {groups.map(([group, scenes]) => (
        <div key={group}>
          <p style={styles.groupTitle}>{group}</p>
          <div style={styles.row}>
            {scenes.map((sc) => (
              <button
                key={sc.id}
                type="button"
                title={sc.label}
                onClick={() => choose(sc.id, () => applyBackgroundImageFilter(renderScene(sc.id)))}
                style={{
                  ...styles.swatch,
                  backgroundImage: `url(${sceneThumbs[sc.id]})`,
                  outline: active === sc.id ? `2px solid ${GREEN}` : '2px solid transparent',
                }}
              >
                <span style={styles.swatchLabel}>{sc.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {FUNDOS_UOU.length > 0 && (
        <div>
          <p style={styles.groupTitle}>Fundos UOU</p>
          <div style={styles.row}>
            {FUNDOS_UOU.map((f) => (
              <button
                key={f.id}
                type="button"
                title={f.label}
                onClick={() => choose(f.id, () => applyBackgroundImageFilter(f.url))}
                style={{
                  ...styles.swatch,
                  backgroundImage: `url(${f.url})`,
                  outline: active === f.id ? `2px solid ${GREEN}` : '2px solid transparent',
                }}
              >
                <span style={styles.swatchLabel}>{f.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p style={styles.groupTitle}>Cores e imagem sua</p>
      <div style={styles.row}>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.label}
            onClick={() => choose(p.id, () => applyBackgroundImageFilter(presetUrls[p.id]))}
            style={{
              ...styles.swatch,
              backgroundImage: `url(${presetUrls[p.id]})`,
              outline: active === p.id ? `2px solid ${GREEN}` : '2px solid transparent',
            }}
          >
            <span style={styles.swatchLabel}>{p.label}</span>
          </button>
        ))}

        {customUrl && (
          <button
            type="button"
            title="Minha imagem"
            onClick={() => choose('custom', () => applyBackgroundImageFilter(customUrl))}
            style={{
              ...styles.swatch,
              backgroundImage: `url(${customUrl})`,
              outline: active === 'custom' ? `2px solid ${GREEN}` : '2px solid transparent',
            }}
          >
            <span style={styles.swatchLabel}>Minha</span>
          </button>
        )}

        <label style={styles.upload}>
          <ImagePlus size={18} color="#f0f0f0" />
          <span style={{ fontSize: 11, color: '#bbb' }}>Sua imagem</span>
          <input type="file" accept="image/*" onChange={pickCustom} style={styles.hidden} />
        </label>
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={styles.chip(active)}>
      {children}
    </button>
  );
}

const styles = {
  box: {
    marginTop: 0,
    padding: 14,
    backgroundColor: '#0d0d0d',
    border: '1px solid #1a1a1a',
    borderRadius: 12,
  },
  head: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { color: '#f0f0f0', fontSize: 14, fontWeight: 700 },
  loading: { color: '#888', fontSize: 12 },
  groupTitle: { color: '#888', fontSize: 12, fontWeight: 600, margin: '4px 0 8px 0' },
  row: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: (active) => ({
    padding: '8px 14px',
    borderRadius: 18,
    border: active ? `1px solid ${GREEN}` : '1px solid #2a2a2a',
    backgroundColor: active ? 'rgba(82,250,53,0.12)' : '#1a1a1a',
    color: active ? GREEN : '#ccc',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }),
  swatch: {
    position: 'relative',
    width: '100%',
    height: 62,
    borderRadius: 10,
    border: 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    cursor: 'pointer',
    padding: 0,
    outlineOffset: 2,
  },
  swatchLabel: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 4,
    color: '#fff',
    fontSize: 10,
    lineHeight: 1.15,
    textAlign: 'left',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    fontWeight: 700,
    textShadow: '0 1px 3px rgba(0,0,0,0.8)',
  },
  upload: {
    position: 'relative',
    width: '100%',
    height: 62,
    borderRadius: 10,
    border: '1px dashed #3a3a3a',
    backgroundColor: '#1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    cursor: 'pointer',
  },
  hidden: { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' },
  note: { color: '#888', fontSize: 12, marginTop: 12 },
};
