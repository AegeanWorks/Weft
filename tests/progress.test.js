import test from "node:test";
import assert from "node:assert/strict";

import {
  STORAGE_KEY,
  defaultProgress,
  isUnlocked,
  loadProgress,
  nextUnsolved,
  normalizeProgress,
  recordSolve,
  saveProgress,
  solvedCount,
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
  assert.equal(progress.lastLevel, "one");

  progress = recordSolve(progress, "one", {
    bestMs: 9000,
    hints: 0,
    moves: 3,
    at: "2026-10-29T00:01:00Z",
  });
  assert.equal(progress.solved.one.bestMs, 5000);
  assert.equal(progress.solved.one.hints, 1);

  progress = recordSolve(progress, "one", {
    bestMs: 3000,
    hints: 0,
    moves: 3,
    at: "2026-10-29T00:02:00Z",
  });
  assert.equal(progress.solved.one.bestMs, 3000);
  assert.equal(progress.solved.one.hints, 0);
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
