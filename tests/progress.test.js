import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_STARS,
  STORAGE_KEY,
  defaultProgress,
  isUnlocked,
  loadProgress,
  nextUnsolved,
  normalizeProgress,
  recordSolve,
  saveProgress,
  solvedCount,
  starsFor,
  totalStars,
} from "../src/ui/progress.js";

const LEVELS = Object.freeze([
  Object.freeze({ id: "one" }),
  Object.freeze({ id: "two" }),
  Object.freeze({ id: "three" }),
]);

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

test("a fresh profile has no solved chambers and sound on", () => {
  assert.deepEqual(defaultProgress(), {
    version: 1,
    solved: {},
    settings: { sound: true },
    lastLevel: null,
  });
});

test("missing storage returns a fresh profile", () => {
  assert.deepEqual(loadProgress(memoryStorage()), defaultProgress());
});

test("corrupt storage returns a fresh profile", () => {
  const storage = memoryStorage({ [STORAGE_KEY]: "{not json" });
  assert.deepEqual(loadProgress(storage), defaultProgress());
});

test("a future schema returns a fresh profile", () => {
  const storage = memoryStorage({
    [STORAGE_KEY]: JSON.stringify({ version: 99, solved: { one: { bestMs: 10 } } }),
  });
  assert.deepEqual(loadProgress(storage), defaultProgress());
});

test("normalizeProgress keeps good records and drops broken ones", () => {
  const progress = normalizeProgress({
    version: 1,
    solved: {
      one: { bestMs: 1200.9, hints: 1, moves: 3, at: "2026-10-29T00:00:00Z" },
      two: { bestMs: -4 },
      bad: "nope",
    },
    settings: { sound: false },
    lastLevel: "one",
  });
  assert.deepEqual(progress.solved.one, {
    bestMs: 1200,
    hints: 1,
    moves: 3,
    at: "2026-10-29T00:00:00Z",
    stars: 2,
  });
  assert.equal(progress.solved.two, undefined);
  assert.equal(progress.solved.bad, undefined);
  assert.equal(progress.settings.sound, false);
  assert.equal(progress.lastLevel, "one");
});

test("recordSolve stores the first result and keeps the faster best", () => {
  let progress = defaultProgress();
  progress = recordSolve(progress, "one", {
    bestMs: 5000,
    hints: 1,
    moves: 4,
    at: "2026-10-29T00:00:00Z",
  });
  assert.equal(progress.solved.one.bestMs, 5000);
  assert.equal(progress.solved.one.stars, 2);
  assert.equal(progress.lastLevel, "one");

  progress = recordSolve(progress, "one", {
    bestMs: 9000,
    hints: 0,
    moves: 3,
    at: "2026-10-29T00:01:00Z",
  });
  assert.equal(progress.solved.one.bestMs, 5000);
  assert.equal(progress.solved.one.hints, 1);
  assert.equal(progress.solved.one.stars, 3);

  progress = recordSolve(progress, "one", {
    bestMs: 3000,
    hints: 0,
    moves: 3,
    at: "2026-10-29T00:02:00Z",
  });
  assert.equal(progress.solved.one.bestMs, 3000);
  assert.equal(progress.solved.one.hints, 0);
  assert.equal(progress.solved.one.stars, 3);
});

test("stars reward a clean weave and never drop below one", () => {
  assert.equal(MAX_STARS, 3);
  assert.equal(starsFor(0), 3);
  assert.equal(starsFor(1), 2);
  assert.equal(starsFor(2), 1);
  assert.equal(starsFor(9), 1);
  assert.equal(starsFor(undefined), 3);
});

test("an older save derives stars from its recorded hints", () => {
  const progress = normalizeProgress({
    version: 1,
    solved: {
      clean: { bestMs: 1000, hints: 0, moves: 3 },
      helped: { bestMs: 2000, hints: 1, moves: 4 },
      stuck: { bestMs: 3000, hints: 4, moves: 9 },
    },
  });
  assert.equal(progress.solved.clean.stars, 3);
  assert.equal(progress.solved.helped.stars, 2);
  assert.equal(progress.solved.stuck.stars, 1);
});

test("totalStars adds every chamber's best rating", () => {
  let progress = defaultProgress();
  assert.equal(totalStars(progress), 0);
  progress = recordSolve(progress, "one", { bestMs: 1000, hints: 0, moves: 2 });
  progress = recordSolve(progress, "two", { bestMs: 2000, hints: 1, moves: 4 });
  progress = recordSolve(progress, "three", { bestMs: 3000, hints: 3, moves: 8 });
  assert.equal(totalStars(progress), 6);
  assert.equal(solvedCount(progress), 3);
});

test("recordSolve never mutates its input", () => {
  const progress = defaultProgress();
  const next = recordSolve(progress, "one", { bestMs: 1000, hints: 0, moves: 2 });
  assert.deepEqual(progress.solved, {});
  assert.equal(next.solved.one.bestMs, 1000);
});

test("chambers unlock in order", () => {
  let progress = defaultProgress();
  assert.equal(isUnlocked(progress, LEVELS, "one"), true);
  assert.equal(isUnlocked(progress, LEVELS, "two"), false);
  progress = recordSolve(progress, "one", { bestMs: 1000, hints: 0, moves: 2 });
  assert.equal(isUnlocked(progress, LEVELS, "two"), true);
  assert.equal(isUnlocked(progress, LEVELS, "three"), false);
});

test("nextUnsolved follows the campaign order", () => {
  let progress = defaultProgress();
  assert.equal(nextUnsolved(progress, LEVELS).id, "one");
  progress = recordSolve(progress, "one", { bestMs: 1000, hints: 0, moves: 2 });
  assert.equal(nextUnsolved(progress, LEVELS).id, "two");
});

test("solvedCount counts recorded chambers", () => {
  let progress = defaultProgress();
  assert.equal(solvedCount(progress), 0);
  progress = recordSolve(progress, "one", { bestMs: 1000, hints: 0, moves: 2 });
  assert.equal(solvedCount(progress), 1);
});

test("saveProgress writes a normalized record and round-trips", () => {
  const storage = memoryStorage();
  const progress = recordSolve(defaultProgress(), "one", {
    bestMs: 1000,
    hints: 0,
    moves: 2,
    at: "2026-10-29T00:00:00Z",
  });
  assert.equal(saveProgress(progress, storage), true);
  assert.deepEqual(loadProgress(storage), progress);
  assert.ok(storage.getItem(STORAGE_KEY).includes("\"version\":1"));
});

test("saveProgress reports a full or unavailable store without throwing", () => {
  const storage = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("quota");
    },
  };
  assert.equal(saveProgress(defaultProgress(), storage), false);
});
