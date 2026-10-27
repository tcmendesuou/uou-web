// Helpers puros de Stories/Highlights (sem dependência RN/Firebase — testáveis).
// Cobrem expiração 24h, agrupamento em anéis (rings), estado "visto" por
// viewer, navegação do viewer fullscreen e capa de highlight.

// Tempo de vida de um story ativo. Trocar esse valor é suficiente p/ alterar
// a janela — as queries filtram por `expiresAt` e a UI soma/some com base nele.
export const STORY_TTL_MS = 24 * 60 * 60 * 1000; // alias legado
export const DEFAULT_STORY_TTL_MS = STORY_TTL_MS;
export const STORY_DURATION_OPTIONS = [
  { label: '6h', ms: 6 * 60 * 60 * 1000 },
  { label: '12h', ms: 12 * 60 * 60 * 1000 },
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
];

// Duração padrão de exibição de um story (foto). Vídeo usa a duração real.
export const STORY_PHOTO_DURATION_MS = 5000;

// Chave composta viewer+story (mesmo formato do id do doc em `storyViews`).
export function storyViewKey(viewerUid, storyId) {
  return `${viewerUid}_${storyId}`;
}

// Story expirou? `now` é injetável p/ teste (default: relógio real).
export function isStoryExpired(story, now = Date.now()) {
  if (!story) return true;
  const expiresAt = new Date(story.expiresAt || story.createdAt).getTime();
  if (Number.isNaN(expiresAt)) return true;
  return expiresAt <= now;
}

// Mantém só stories ativas (dentro das 24h), mais novas primeiro.
export function filterActiveStories(stories, now = Date.now()) {
  return (stories || [])
    .filter((s) => !isStoryExpired(s, now))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Agrupa stories ativas em rings (um por usuário), ordenados do mais recente
// p/ o mais antigo; stories dentro do ring ficam em ordem cronológica asc.
export function groupRings(stories, now = Date.now()) {
  const active = filterActiveStories(stories, now);
  const byUser = new Map();
  for (const story of active) {
    if (!byUser.has(story.userId)) {
      byUser.set(story.userId, {
        userId: story.userId,
        userName: story.userName || 'Usuário',
        userPhoto: story.userPhoto || null,
        stories: [],
      });
    }
    byUser.get(story.userId).stories.push(story);
  }
  const rings = [...byUser.values()];
  for (const ring of rings) {
    ring.stories.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    ring.latestCreatedAt = ring.stories[ring.stories.length - 1]?.createdAt;
  }
  rings.sort((a, b) => new Date(b.latestCreatedAt) - new Date(a.latestCreatedAt));
  return rings;
}

// Ring está totalmente visto? `seenKeys` é um Set de chaves `${uid}_${storyId}`
// (mesmo formato dos ids dos docs em `storyViews`).
export function isRingFullySeen(ring, seenKeys) {
  if (!ring || !ring.stories?.length) return true;
  return ring.stories.every((s) => seenKeys && seenKeys.has(storyViewKey(ring.userId, s.id)));
}

// Índice da primeira story não vista do ring (retoma de onde parou); 0 se tudo visto.
export function firstUnseenIndex(ring, seenKeys) {
  if (!ring?.stories?.length) return 0;
  const idx = ring.stories.findIndex(
    (s) => !seenKeys || !seenKeys.has(storyViewKey(ring.userId, s.id))
  );
  return idx === -1 ? 0 : idx;
}

// Achata os rings numa trilha linear p/ o viewer fullscreen avançar entre
// usuários: [{ ringIndex, storyIndex, ring, story }, ...].
export function buildTicker(rings) {
  const ticker = [];
  (rings || []).forEach((ring, ringIndex) => {
    (ring.stories || []).forEach((story, storyIndex) => {
      ticker.push({ ringIndex, storyIndex, ring, story });
    });
  });
  return ticker;
}

// Vizinho na trilha global. `delta` +1/-1. Retorna `null` na borda global
// (sinal p/ fechar o viewer).
export function getNeighbor(ticker, currentPos, delta) {
  if (!ticker?.length) return null;
  const next = currentPos + delta;
  if (next < 0 || next >= ticker.length) return null;
  return next;
}

// Fração 0..1 da barra de progresso do story corrente.
export function storyFraction(story, elapsedMs) {
  const duration = Math.max(1, story?.durationMs || STORY_PHOTO_DURATION_MS);
  const elapsed = Math.max(0, elapsedMs || 0);
  return Math.min(1, elapsed / duration);
}

// Story faz parte do highlight?
export function isStoryInHighlight(highlight, storyId) {
  if (!highlight || !storyId) return false;
  return (highlight.storyIds || []).includes(storyId);
}

// Capa do highlight: coverUrl explícito → primeira story salva → null.
export function resolveHighlightCover(highlight) {
  if (!highlight) return null;
  return highlight.coverUrl || highlight.stories?.[0]?.url || null;
}
