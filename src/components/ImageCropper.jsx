import React, { useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

// Ajuste de imagem: o usuário arrasta e dá zoom dentro de um quadro com a proporção final.
// Entrega um arquivo JPEG já recortado (outW x outH).
export default function ImageCropper({ file, aspect, outW, title, round = false, onCancel, onDone }) {
  const FRAME_W = aspect >= 1.5 ? 560 : 300;
  const FRAME_H = Math.round(FRAME_W / aspect);

  const [src, setSrc] = useState('');
  const [nat, setNat] = useState(null);       // { w, h }
  const [zoom, setZoom] = useState(1);         // 1 = "cobrir" o quadro; até 4x
  const [pos, setPos] = useState({ x: 0, y: 0 }); // deslocamento do canto da imagem em px
  const drag = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const base = nat ? Math.max(FRAME_W / nat.w, FRAME_H / nat.h) : 1;
  const scale = base * zoom;
  const dispW = nat ? nat.w * scale : 0;
  const dispH = nat ? nat.h * scale : 0;

  const clamp = (p, sc = scale) => {
    if (!nat) return p;
    const w = nat.w * sc; const h = nat.h * sc;
    return {
      x: Math.min(0, Math.max(FRAME_W - w, p.x)),
      y: Math.min(0, Math.max(FRAME_H - h, p.y)),
    };
  };

  const onLoad = (e) => {
    const w = e.target.naturalWidth; const h = e.target.naturalHeight;
    setNat({ w, h });
    const b = Math.max(FRAME_W / w, FRAME_H / h);
    setPos({ x: (FRAME_W - w * b) / 2, y: (FRAME_H - h * b) / 2 });
  };

  const changeZoom = (z) => {
    const nz = Math.min(4, Math.max(1, z));
    // mantém o centro do quadro no mesmo ponto da imagem
    const cx = (FRAME_W / 2 - pos.x) / scale;
    const cy = (FRAME_H / 2 - pos.y) / scale;
    const ns = base * nz;
    setZoom(nz);
    setPos(clamp({ x: FRAME_W / 2 - cx * ns, y: FRAME_H / 2 - cy * ns }, ns));
  };

  const down = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y };
  };
  const move = (e) => {
    if (!drag.current) return;
    setPos(clamp({ x: drag.current.px + (e.clientX - drag.current.sx), y: drag.current.py + (e.clientY - drag.current.sy) }));
  };
  const up = () => { drag.current = null; };
  const wheel = (e) => { e.preventDefault?.(); changeZoom(zoom + (e.deltaY < 0 ? 0.15 : -0.15)); };

  const confirm = () => {
    if (!nat || !imgRef.current) return;
    const outH = Math.round(outW / aspect);
    const canvas = document.createElement('canvas');
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(imgRef.current, -pos.x / scale, -pos.y / scale, FRAME_W / scale, FRAME_H / scale, 0, 0, outW, outH);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onDone(new File([blob], 'imagem.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  };

  return (
    <div style={s.overlay} onClick={onCancel}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.head}>
          <strong>{title}</strong>
          <button type="button" style={s.x} onClick={onCancel} aria-label="Fechar"><X size={20} /></button>
        </div>
        <p style={s.hint}>Arraste a imagem para posicionar e use o zoom para ajustar o tamanho.</p>

        <div
          style={{ ...s.frame, width: FRAME_W, height: FRAME_H, borderRadius: round ? 20 : 12 }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onWheel={wheel}
          data-testid="crop-frame"
        >
          {src && (
            <img
              ref={imgRef}
              src={src}
              alt=""
              onLoad={onLoad}
              draggable={false}
              style={{
                position: 'absolute', left: 0, top: 0, userSelect: 'none', pointerEvents: 'none', maxWidth: 'none',
                width: nat ? dispW : 'auto', height: nat ? dispH : 'auto',
                transform: `translate(${pos.x}px, ${pos.y}px)`,
              }}
            />
          )}
        </div>

        <div style={s.zoomRow}>
          <ZoomOut size={16} color="#888" />
          <input
            type="range" min="1" max="4" step="0.01" value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
            style={{ flex: 1, accentColor: '#52fa35' }}
            aria-label="Zoom"
          />
          <ZoomIn size={16} color="#888" />
        </div>

        <div style={s.actions}>
          <button type="button" style={s.cancel} onClick={onCancel}>Cancelar</button>
          <button type="button" style={s.ok} onClick={confirm} disabled={!nat}>Usar imagem</button>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 200,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  modal: {
    background: '#0b0b10', border: '1px solid #1f1f27', borderRadius: 16, padding: 20, color: '#f0f0f0',
    fontFamily: 'inherit', maxWidth: '100%',
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  x: { background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer' },
  hint: { color: '#8a8a95', fontSize: 13, margin: '6px 0 14px' },
  frame: {
    position: 'relative', overflow: 'hidden', background: '#000', border: '1px solid #26262e',
    cursor: 'grab', touchAction: 'none', margin: '0 auto', maxWidth: '100%',
  },
  zoomRow: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 },
  actions: { display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' },
  cancel: {
    background: 'transparent', color: '#bbb', border: '1px solid #333', borderRadius: 10, padding: '10px 18px',
    fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
  },
  ok: {
    background: 'rgba(82, 250, 53, 0.05)', color: '#52fa35', border: '1px solid #52fa35', borderRadius: 10,
    padding: '10px 18px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
  },
};
