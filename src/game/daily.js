/**
 * The daily Weave: one deterministic 7×7 chamber per local calendar day.
 *
 * The date is the only input, so two browsers on the same day get the same
 * loom without a server. The level is built from the shared pure generator.
 */

import { COLORS, generateLevel, hashSeed } from "./generate.js";

export const DAILY_SIZE = 7;
export const DAILY_PAIRS = 6;
export const DAILY_NAME = "Daily Weave";

export function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dailyLabel(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function createDailyLevel(key = dateKey()) {
  const index = hashSeed(`weft-daily-${key}`) % COLORS.length;
  return generateLevel(
    {
      id: `daily-${key}`,
      name: DAILY_NAME,
      size: DAILY_SIZE,
      pairs: DAILY_PAIRS,
      seed: `weft-daily-${key}`,
      balanced: true,
    },
    index,
  );
}
