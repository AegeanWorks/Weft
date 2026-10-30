import test from "node:test";
import assert from "node:assert/strict";

import {
  DAILY_KEY,
  DAILY_VERSION,
  dailyStreak,
  defaultDaily,
  loadDaily,
  normalizeDaily,
  recordDaily,
  saveDaily,
} from "../src/ui/daily.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    dump() {
      return Object.fromEntries(data);
    },
  };
}

function solved(days) {
  return normalizeDaily({ version: DAILY_VERSION, days });
}

test("the daily save has its own storage key", () => {
  assert.equal(DAILY_KEY, "weft.daily.v1");
  assert.deepEqual(defaultDaily(), { version: 1, days: {} });
});

test("missing and corrupt daily records reset safely", () => {
  assert.deepEqual(loadDaily(memoryStorage()), defaultDaily());
  assert.deepEqual(loadDaily(memoryStorage({ [DAILY_KEY]: "{bad" })), defaultDaily());
  assert.deepEqual(
    loadDaily(memoryStorage({ [DAILY_KEY]: JSON.stringify({ version: 99, days: {} }) })),
    defaultDaily(),
  );
});

test("normalizeDaily keeps valid days and drops broken ones", () => {
  const daily = normalizeDaily({
    version: 1,
    days: {
      "2026-10-30": { bestMs: 1200.9, hints: 1, moves: 3, at: "2026-10-30T00:00:00Z" },
      "2026-10-31": { bestMs: -1 },
      "not-a-day": { bestMs: 900 },
    },
  });
  assert.deepEqual(daily.days["2026-10-30"], {
    bestMs: 1200,
    hints: 1,
    moves: 3,
    at: "2026-10-30T00:00:00Z",
    stars: 2,
  });
  assert.equal(daily.days["2026-10-31"], undefined);
  assert.equal(daily.days["not-a-day"], undefined);
});

test("recordDaily keeps the fastest time and the best stars", () => {
  let daily = defaultDaily();
  daily = recordDaily(daily, "2026-10-30", {
    bestMs: 5000,
    hints: 1,
    moves: 4,
    at: "2026-10-30T00:00:00Z",
  });
  assert.equal(daily.days["2026-10-30"].bestMs, 5000);
  assert.equal(daily.days["2026-10-30"].stars, 2);

  daily = recordDaily(daily, "2026-10-30", {
    bestMs: 9000,
    hints: 0,
    moves: 3,
    at: "2026-10-30T00:01:00Z",
  });
  assert.equal(daily.days["2026-10-30"].bestMs, 5000);
  assert.equal(daily.days["2026-10-30"].stars, 3);

  daily = recordDaily(daily, "2026-10-30", {
    bestMs: 3000,
    hints: 2,
    moves: 6,
    at: "2026-10-30T00:02:00Z",
  });
  assert.equal(daily.days["2026-10-30"].bestMs, 3000);
  assert.equal(daily.days["2026-10-30"].stars, 3);
});

test("dailyStreak counts consecutive solved days", () => {
  const days = {
    "2026-10-28": { bestMs: 1 },
    "2026-10-29": { bestMs: 1 },
    "2026-10-30": { bestMs: 1 },
  };
  assert.equal(dailyStreak(solved(days), "2026-10-30"), 3);
  assert.equal(dailyStreak(solved(days), "2026-10-31"), 3);
  assert.equal(dailyStreak(solved({ "2026-10-28": { bestMs: 1 } }), "2026-10-30"), 0);
  assert.equal(dailyStreak(defaultDaily(), "2026-10-30"), 0);
  assert.equal(dailyStreak(solved(days), "not-a-day"), 0);
});

test("a broken day ends the streak", () => {
  const daily = solved({
    "2026-10-27": { bestMs: 1 },
    "2026-10-29": { bestMs: 1 },
    "2026-10-30": { bestMs: 1 },
  });
  assert.equal(dailyStreak(daily, "2026-10-30"), 2);
});

test("saveDaily round-trips and reports an unavailable store", () => {
  const storage = memoryStorage();
  let daily = defaultDaily();
  daily = recordDaily(daily, "2026-10-30", { bestMs: 1000, hints: 0, moves: 2 });
  assert.equal(saveDaily(daily, storage), true);
  assert.deepEqual(loadDaily(storage), daily);
  const broken = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("quota");
    },
  };
  assert.equal(saveDaily(daily, broken), false);
});
