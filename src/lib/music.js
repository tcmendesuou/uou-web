import { useEffect, useState } from 'react';

// ── Música do post (igual ao app): busca na iTunes Search API ──
// O post guarda: music = { trackName, artistName, artworkUrl, previewUrl } (prévia de ~30s)
const ITUNES = 'https://itunes.apple.com/search';

const mapTrack = (r) => ({
  trackId: r.trackId,
  trackName: r.trackName,
  artistName: r.artistName,
  artworkUrl: (r.artworkUrl100 || '').replace('100x100', '300x300') || null,
  previewUrl: r.previewUrl || null,
});

// Plano B: se o navegador bloquear o fetch (CORS), a iTunes aceita JSONP
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = `__itunes_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const s = document.createElement('script');
    const done = () => { delete window[cb]; s.remove(); };
    window[cb] = (data) => { done(); resolve(data); };
    s.onerror = () => { done(); reject(new Error('jsonp')); };
    s.src = `${url}&callback=${cb}`;
    document.head.appendChild(s);
  });
}

export async function searchMusic(term, limit = 25) {
  const url = `${ITUNES}?term=${encodeURIComponent(term)}&media=music&entity=song&limit=${limit}&country=BR`;
  let data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch {
    data = await jsonp(url);
  }
  return (data.results || []).filter((r) => r.trackName && r.previewUrl).map(mapTrack);
}

// ── Um único player para a página toda (como o AudioContext do app) ──
let audio = null;
let currentKey = null;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l(currentKey));

function ensureAudio() {
  if (!audio) {
    audio = new Audio();
    audio.loop = true;
    audio.addEventListener('ended', () => { currentKey = null; emit(); });
    audio.addEventListener('pause', () => { if (audio.ended) return; });
  }
  return audio;
}

export function stopMusic() {
  if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
  currentKey = null;
  emit();
}

export function toggleMusic(key, url) {
  if (!url) return;
  const a = ensureAudio();
  if (currentKey === key) { stopMusic(); return; }
  a.src = url;
  currentKey = key;
  emit();
  a.play().catch(() => { currentKey = null; emit(); });
}

// { playing, toggle } para um item (key = id do post, ou 'preview' no seletor)
export function useMusicPreview(key, url) {
  const [now, setNow] = useState(currentKey);
  useEffect(() => {
    listeners.add(setNow);
    return () => {
      listeners.delete(setNow);
      if (currentKey === key) stopMusic();
    };
  }, [key]);
  return { playing: now === key, toggle: () => toggleMusic(key, url) };
}
