/**
 * Weft's daily save.
 *
 * A day is keyed by the local calendar date and stores the same rating fields
 * as a campaign chamber. The record is separate from `weft.progress.v1`, so a
 * daily replay never changes campaign unlocks or totals.
 */

import { MAX_STARS, starsFor } from "./progress.js";

export const DAILY_KEY = "weft.daily.v1";
export const DAILY_VERSION = 1;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function defaultDaily() {
  return { version: DAILY_VERSION, days: {} };
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
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

export function normalizeDaily(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultDaily();
  }
  if (value.version !== DAILY_VERSION) {
    return defaultDaily();
  }
  const days = {};
  if (value.days && typeof value.days === "object" && !Array.isArray(value.days)) {
    for (const [key, entry] of Object.entries(value.days)) {
      if (!DAY_PATTERN.test(key)) {
        continue;
      }
      const normalized = normalizeEntry(entry);
      if (normalized) {
        days[key] = normalized;
      }
    }
  }
  return { version: DAILY_VERSION, days };
}

export function loadDaily(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(DAILY_KEY);
    if (!raw) {
      return defaultDaily();
    }
    return normalizeDaily(JSON.parse(raw));
  } catch {
    return defaultDaily();
  }
}

export function saveDaily(daily, storage = globalThis.localStorage) {
  try {
    storage?.setItem(DAILY_KEY, JSON.stringify(normalizeDaily(daily)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Record one daily run. A faster time replaces the best; the star rating only
 * rises, so a slower clean run can still improve the day.
 */
export function recordDaily(daily, key, result) {
  const current = normalizeDaily(daily);
  if (!DAY_PATTERN.test(key)) {
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
  const previous = current.days[key];
  const days = { ...current.days };
  if (!previous) {
    days[key] = entry;
  } else if (entry.bestMs < previous.bestMs) {
    days[key] = { ...entry, stars: Math.max(previous.stars, entry.stars) };
  } else {
    days[key] = { ...previous, stars: Math.max(previous.stars, entry.stars) };
  }
  return { ...current, days };
}

/**
 * The run of solved days ending today, or yesterday when today is still open.
 * Date arithmetic uses UTC midnights so daylight saving cannot skip a day.
 */
export function dailyStreak(daily, today) {
  if (!DAY_PATTERN.test(today)) {
    return 0;
  }
  const days = normalizeDaily(daily).days;
  const [year, month, day] = today.split("-").map(Number);
  let cursor = Date.UTC(year, month - 1, day);
  const asKey = (value) => new Date(value).toISOString().slice(0, 10);
  if (!days[asKey(cursor)]) {
    cursor -= 86400000;
  }
  let streak = 0;
  while (days[asKey(cursor)]) {
    streak += 1;
    cursor -= 86400000;
  }
  return streak;
}
