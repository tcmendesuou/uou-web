// src/lib/panelLayout.js
// Ordem dos painéis que o usuário pode trocar de lugar arrastando. Fica salva neste navegador.
import { useEffect, useState } from 'react';

export function usePanelLayout(storageKey, defaults) {
  const [order, setOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (Array.isArray(saved) && saved.length === defaults.length && defaults.every((d) => saved.includes(d))) return saved;
    } catch { /* sem armazenamento: usa o padrão */ }
    return defaults;
  });
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(order)); } catch { /* ok */ }
  }, [storageKey, order]);

  const swap = (a, b) => setOrder((prev) => {
    const next = prev.slice();
    const i = next.indexOf(a); const j = next.indexOf(b);
    if (i === -1 || j === -1) return prev;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const dragProps = (id) => ({
    over: overId === id && dragId !== null && dragId !== id,
    onStart: (e) => { setDragId(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); },
    onOver: (e) => { if (dragId !== null) { e.preventDefault(); if (overId !== id) setOverId(id); } },
    onDrop: (e) => { e.preventDefault(); if (dragId !== null && dragId !== id) swap(dragId, id); setDragId(null); setOverId(null); },
    onEnd: () => { setDragId(null); setOverId(null); },
  });

  const reset = () => setOrder(defaults);
  const changed = order.some((id, i) => id !== defaults[i]);
  return { order, dragProps, reset, changed };
}
