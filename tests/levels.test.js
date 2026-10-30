import test from "node:test";
import assert from "node:assert/strict";

import { createGame, isSolved, setPath, validateLevel } from "../src/game/engine.js";
import { LEVELS, LEVEL_BY_ID, TOTAL_CHAMBERS } from "../src/game/levels.js";

test("the campaign publishes eighteen uniquely identified chambers", () => {
  assert.equal(LEVELS.length, 18);
  assert.equal(TOTAL_CHAMBERS, 18);
  const ids = new Set(LEVELS.map((level) => level.id));
  const names = new Set(LEVELS.map((level) => level.name));
  assert.equal(ids.size, LEVELS.length);
  assert.equal(names.size, LEVELS.length);
  for (const level of LEVELS) {
    assert.equal(LEVEL_BY_ID[level.id], level);
  }
});

test("chambers grow from five to twelve cells a side", () => {
  let previous = 0;
  for (const level of LEVELS) {
    assert.ok(level.size >= 5 && level.size <= 12);
    assert.ok(level.size >= previous);
    previous = level.size;
  }
  assert.deepEqual(
    [...new Set(LEVELS.map((level) => level.size))],
    [5, 6, 7, 8, 9, 10, 11, 12],
  );
});

test("the second act starts at ten cells a side with at least eight threads", () => {
  for (const level of LEVELS.slice(12)) {
    assert.ok(level.size >= 10, `${level.id} is smaller than the second act`);
    assert.ok(level.pairs.length >= 8, `${level.id} has fewer than eight threads`);
  }
  assert.equal(LEVELS.at(-1).size, 12);
  assert.equal(LEVELS.at(-1).pairs.length, 9);
});

test("second-act threads share the loom evenly", () => {
  for (const level of LEVELS.slice(12)) {
    const longest = Math.max(
      ...level.pairs.map((pair) => level.solution[pair.color].length),
    );
    assert.ok(
      longest <= (level.size * level.size) / 4,
      `${level.id} gives one thread more than a quarter of the loom`,
    );
  }
});

test("every chamber has a valid, total stored solution", () => {
  for (const level of LEVELS) {
    assert.equal(validateLevel(level), level);
    assert.ok(level.pairs.length >= 3);
    assert.ok(level.size * level.size >= level.pairs.length * 3);
  }
});

test("every stored solution wins the chamber it belongs to", () => {
  for (const level of LEVELS) {
    let game = createGame(level);
    for (const pair of level.pairs) {
      game = setPath(game, pair.color, level.solution[pair.color]);
    }
    assert.equal(isSolved(game), true, `${level.id} did not solve`);
  }
});

test("every chamber covers each cell exactly once", () => {
  for (const level of LEVELS) {
    const seen = new Set();
    for (const pair of level.pairs) {
      for (const [x, y] of level.solution[pair.color]) {
        const key = `${x},${y}`;
        assert.equal(seen.has(key), false, `${level.id} repeats ${key}`);
        seen.add(key);
      }
    }
    assert.equal(seen.size, level.size * level.size);
  }
});

test("no chamber starts and ends a thread on one cell", () => {
  for (const level of LEVELS) {
    for (const pair of level.pairs) {
      assert.notDeepEqual(pair.start, pair.end);
    }
  }
});

test("no chamber opens with two adjacent spools", () => {
  for (const level of LEVELS) {
    for (const pair of level.pairs) {
      const distance =
        Math.abs(pair.start[0] - pair.end[0]) +
        Math.abs(pair.start[1] - pair.end[1]);
      assert.ok(distance > 1, `${level.id} has adjacent ${pair.color} spools`);
    }
  }
});
