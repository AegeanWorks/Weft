import test from "node:test";
import assert from "node:assert/strict";

import {
  createDailyLevel,
  currentDailyKey,
  dailyLabel,
  dateKey,
} from "../src/game/daily.js";
import { createGame, isSolved, setPath, validateLevel } from "../src/game/engine.js";
import { generateLevel } from "../src/game/generate.js";

const SPEC = Object.freeze({
  id: "generated",
  name: "Generated",
  size: 6,
  pairs: 4,
  seed: "weft-test-1",
  balanced: true,
});

function assertSolvable(level) {
  assert.equal(validateLevel(level), level);
  let game = createGame(level);
  for (const pair of level.pairs) {
    game = setPath(game, pair.color, level.solution[pair.color]);
  }
  assert.equal(isSolved(game), true, `${level.id} did not solve`);
}

test("the shared generator is deterministic for one spec", () => {
  assert.deepEqual(generateLevel(SPEC, 0), generateLevel(SPEC, 0));
  assert.notDeepEqual(generateLevel(SPEC, 0), generateLevel(SPEC, 2));
  assert.notDeepEqual(
    generateLevel({ ...SPEC, seed: "weft-test-2" }, 0),
    generateLevel(SPEC, 0),
  );
});

test("a generated chamber is valid and its stored solution is total", () => {
  const level = generateLevel(SPEC, 0);
  assert.equal(level.pairs.length, SPEC.pairs);
  assert.equal(level.size, SPEC.size);
  assertSolvable(level);
});

test("the daily key follows the local calendar day", () => {
  assert.equal(dateKey(new Date(2026, 9, 30, 0, 0)), "2026-10-30");
  assert.equal(dateKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.match(dailyLabel("2026-10-30"), /2026/);
});

test("a daily link can only open the local day", () => {
  assert.equal(currentDailyKey("2026-11-06", "2026-11-07"), "2026-11-07");
  assert.equal(currentDailyKey("2026-11-07", "2026-11-07"), "2026-11-07");
  assert.equal(currentDailyKey("", "2026-11-07"), "2026-11-07");
  assert.equal(currentDailyKey(undefined, "2026-11-07"), "2026-11-07");
});

test("the daily chamber is deterministic, valid and date-stamped", () => {
  const level = createDailyLevel("2026-10-30");
  assert.equal(level.id, "daily-2026-10-30");
  assert.equal(level.name, "Daily Weave");
  assert.equal(level.size, 7);
  assert.equal(level.pairs.length, 6);
  assert.deepEqual(level, createDailyLevel("2026-10-30"));
  assert.notDeepEqual(level, createDailyLevel("2026-10-31"));
  assertSolvable(level);
});

test("daily generation stays within its search budget", () => {
  const stats = {};
  const level = createDailyLevel("2026-10-30", stats);
  assert.ok(stats.attempts >= 1, "the generator reported no search attempt");
  assert.ok(
    stats.nodes <= 24000,
    `daily generation spent ${stats.nodes} search nodes`,
  );
  assertSolvable(level);
});

test("previously slow dates stay within a bounded search", () => {
  for (const key of [
    "2026-10-26",
    "2026-10-27",
    "2026-11-01",
    "2026-11-03",
    "2026-11-04",
    "2024-02-28",
  ]) {
    const stats = {};
    const level = createDailyLevel(key, stats);
    assert.ok(
      stats.attempts <= 16,
      `daily ${key} needed ${stats.attempts} search attempts`,
    );
    assert.ok(
      stats.nodes <= 16000,
      `daily ${key} spent ${stats.nodes} search nodes`,
    );
    assertSolvable(level);
  }
});

test("every month of a leap year yields a valid, solvable daily", () => {
  for (let month = 1; month <= 12; month += 1) {
    const key = `2024-${String(month).padStart(2, "0")}-15`;
    assertSolvable(createDailyLevel(key));
  }
  assertSolvable(createDailyLevel("2024-02-29"));
});
