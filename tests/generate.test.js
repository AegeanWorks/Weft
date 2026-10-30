import test from "node:test";
import assert from "node:assert/strict";

import { createDailyLevel, dailyLabel, dateKey } from "../src/game/daily.js";
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

test("daily generation is quick enough for a click", () => {
  const started = performance.now();
  createDailyLevel("2026-10-30");
  assert.ok(performance.now() - started < 500, "daily generation took over 500 ms");
});
