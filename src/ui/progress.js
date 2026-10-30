/**
 * Weft's versioned local progress.
 *
 * The module takes a storage object so the same rules run against localStorage
 * in the browser and a small fake in the tests. A missing, corrupt or
 * future-versioned record resets to a safe default instead of throwing.
 */

export const STORAGE_KEY = "weft.progress.v1";
export const PROGRESS_VERSION = 1;
export const MAX_STARS = 3;

/**
 * A clean weave earns three stars; one hint earns two and any more earn one.
 * Deriving the rating keeps older saves meaningful without a migration.
 */
export function starsFor(hints) {
  if (!Number.isInteger(hints) || hints <= 0) {
    return MAX_STARS;
  }
  return hints === 1 ? 2 : 1;
}

export function defaultProgress() {
  return {
    version: PROGRESS_VERSION,
    solved: {},
    settings: { sound: true },
    lastLevel: null,
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeEntry(entry) {
  if (!isRecord(entry)) {
    return null;
  }
  const bestMs =
    Number.isFinite(entry.bestMs) && entry.bestMs >= 0
      ? Math.floor(entry.bestMs)
      : null;
  if (bestMs === null) {
    return null;
  }
  const hints =
    Number.isInteger(entry.hints) && entry.hints >= 0 ? entry.hints : 0;
  const moves =
    Number.isInteger(entry.moves) && entry.moves >= 0 ? entry.moves : 0;
  const at = typeof entry.at === "string" && entry.at.length > 0 ? entry.at : null;
  const stars =
    Number.isInteger(entry.stars) && entry.stars >= 1 && entry.stars <= MAX_STARS
      ? entry.stars
      : starsFor(hints);
  return { bestMs, hints, moves, at, stars };
}

export function normalizeProgress(value) {
  const base = defaultProgress();
  if (!isRecord(value) || value.version !== PROGRESS_VERSION) {
    return base;
  }

  const solved = {};
  if (isRecord(value.solved)) {
    for (const [levelId, entry] of Object.entries(value.solved)) {
      if (typeof levelId !== "string" || levelId.length === 0) {
        continue;
      }
      const normalized = normalizeEntry(entry);
      if (normalized) {
        solved[levelId] = normalized;
      }
    }
  }

  const settings = { sound: true };
  if (isRecord(value.settings) && typeof value.settings.sound === "boolean") {
    settings.sound = value.settings.sound;
  }

  return {
    version: PROGRESS_VERSION,
    solved,
    settings,
    lastLevel: typeof value.lastLevel === "string" && value.lastLevel.length > 0
      ? value.lastLevel
      : null,
  };
}

export function loadProgress(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultProgress();
    }
    return normalizeProgress(JSON.parse(raw));
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(progress, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(normalizeProgress(progress)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Record a finished chamber. A faster run replaces the stored best; a slower
 * run never erases it.
 */
export function recordSolve(progress, levelId, result) {
  const current = normalizeProgress(progress);
  if (typeof levelId !== "string" || levelId.length === 0) {
    return current;
  }
  const entry = normalizeEntry({
    bestMs: Number.isFinite(result?.bestMs) ? result.bestMs : 0,
    hints: Number.isInteger(result?.hints) ? result.hints : 0,
    moves: Number.isInteger(result?.moves) ? result.moves : 0,
    at: typeof result?.at === "string" ? result.at : new Date().toISOString(),
  });
  if (!entry) {
    return current;
  }
  const previous = current.solved[levelId];
  const solved = { ...current.solved };
  if (!previous) {
    solved[levelId] = entry;
  } else if (entry.bestMs < previous.bestMs) {
    solved[levelId] = { ...entry, stars: Math.max(previous.stars, entry.stars) };
  } else {
    solved[levelId] = { ...previous, stars: Math.max(previous.stars, entry.stars) };
  }
  return {
    ...current,
    solved,
    lastLevel: levelId,
  };
}

export function isUnlocked(progress, levels, levelId) {
  const index = levels.findIndex((level) => level.id === levelId);
  if (index <= 0) {
    return true;
  }
  const previous = levels[index - 1];
  return Boolean(normalizeProgress(progress).solved[previous.id]);
}

export function nextUnsolved(progress, levels) {
  const current = normalizeProgress(progress);
  return levels.find((level) => !current.solved[level.id]) ?? null;
}

export function solvedCount(progress) {
  return Object.keys(normalizeProgress(progress).solved).length;
}

export function totalStars(progress) {
  const solved = normalizeProgress(progress).solved;
  return Object.values(solved).reduce((sum, entry) => sum + entry.stars, 0);
}
