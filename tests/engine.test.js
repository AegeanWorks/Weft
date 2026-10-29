import test from "node:test";
import assert from "node:assert/strict";

import {
  cellKey,
  clearPath,
  createGame,
  isSolved,
  occupiedCells,
  pathForColor,
  setPath,
  validateLevel,
} from "../src/game/engine.js";

const SNAKE = Object.freeze({
  id: "snake",
  name: "Snake",
  size: 3,
  pairs: Object.freeze([
    Object.freeze({ color: "coral", start: Object.freeze([0, 0]), end: Object.freeze([2, 2]) }),
  ]),
  solution: Object.freeze({
    coral: Object.freeze([
      Object.freeze([0, 0]),
      Object.freeze([0, 1]),
      Object.freeze([0, 2]),
      Object.freeze([1, 2]),
      Object.freeze([1, 1]),
      Object.freeze([1, 0]),
      Object.freeze([2, 0]),
      Object.freeze([2, 1]),
      Object.freeze([2, 2]),
    ]),
  }),
});

const TWO_PAIR = Object.freeze({
  id: "two-pair",
  name: "Two Pair",
  size: 2,
  pairs: Object.freeze([
    Object.freeze({ color: "coral", start: Object.freeze([0, 0]), end: Object.freeze([0, 1]) }),
    Object.freeze({ color: "jade", start: Object.freeze([1, 0]), end: Object.freeze([1, 1]) }),
  ]),
  solution: Object.freeze({
    coral: Object.freeze([Object.freeze([0, 0]), Object.freeze([0, 1])]),
    jade: Object.freeze([Object.freeze([1, 0]), Object.freeze([1, 1])]),
  }),
});

function cloneLevel(overrides = {}) {
  return {
    ...SNAKE,
    pairs: SNAKE.pairs.map((pair) => ({ ...pair })),
    solution: {
      coral: SNAKE.solution.coral.map((cell) => [...cell]),
    },
    ...overrides,
  };
}

test("validateLevel accepts a total, orthogonal solution", () => {
  assert.equal(validateLevel(SNAKE), SNAKE);
});

test("validateLevel rejects an empty pair list", () => {
  assert.throws(() => validateLevel(cloneLevel({ pairs: [] })), /at least one spool pair/);
});

test("validateLevel rejects an endpoint outside the loom", () => {
  const level = cloneLevel();
  level.pairs[0].end = [3, 2];
  assert.throws(() => validateLevel(level), /leaves the 3x3 loom/);
});

test("validateLevel rejects two spools on one cell", () => {
  const level = cloneLevel();
  level.pairs[0].end = [0, 0];
  assert.throws(() => validateLevel(level), /starts and ends on the same cell/);
});

test("validateLevel rejects a solution that misses a cell", () => {
  const level = cloneLevel();
  level.solution.coral = level.solution.coral.slice(0, -1);
  assert.throws(() => validateLevel(level), /does not end at its second spool|covers 8 of 9/);
});

test("validateLevel rejects a diagonal solution step", () => {
  const level = cloneLevel();
  level.solution.coral = [
    [0, 0],
    [1, 1],
    [2, 1],
    [2, 0],
    [1, 0],
    [0, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ];
  assert.throws(() => validateLevel(level), /one orthogonal cell at a time/);
});

test("createGame starts with empty, frozen paths", () => {
  const game = createGame(SNAKE);
  assert.deepEqual(pathForColor(game, "coral"), []);
  assert.ok(Object.isFrozen(game));
  assert.ok(Object.isFrozen(game.paths));
  assert.ok(Object.isFrozen(game.paths.coral));
});

test("setPath replaces only the named thread and leaves the old game intact", () => {
  const game = createGame(TWO_PAIR);
  const coral = [
    [0, 0],
    [0, 1],
  ];
  const next = setPath(game, "coral", coral);
  assert.deepEqual(pathForColor(next, "coral"), coral);
  assert.deepEqual(pathForColor(game, "coral"), []);
  assert.deepEqual(pathForColor(next, "jade"), []);
  assert.ok(Object.isFrozen(pathForColor(next, "coral")));
});

test("setPath rejects a path that starts at the wrong spool", () => {
  const game = createGame(SNAKE);
  assert.throws(
    () => setPath(game, "coral", [[2, 2], [2, 1], [2, 0], [1, 0], [0, 0], [1, 1], [0, 1], [0, 2], [1, 2]]),
    /must begin at 0,0/,
  );
});

test("setPath rejects a partial path", () => {
  const game = createGame(SNAKE);
  assert.throws(
    () => setPath(game, "coral", [[0, 0], [1, 0], [2, 0]]),
    /must end at 2,2/,
  );
});

test("setPath rejects a non-orthogonal step", () => {
  const game = createGame(SNAKE);
  const bad = SNAKE.solution.coral.map((cell) => [...cell]);
  [bad[1], bad[2]] = [bad[2], bad[1]];
  assert.throws(() => setPath(game, "coral", bad), /one orthogonal cell at a time/);
});

test("setPath rejects a path that crosses another spool", () => {
  const game = createGame(TWO_PAIR);
  assert.throws(
    () => setPath(game, "coral", [[0, 0], [1, 0], [1, 1], [0, 1]]),
    /crosses the jade spool/,
  );
});

test("setPath rejects a path that crosses another thread", () => {
  let game = createGame(TWO_PAIR);
  game = setPath(game, "jade", [[1, 0], [1, 1]]);
  assert.throws(
    () => setPath(game, "coral", [[0, 0], [1, 0], [1, 1], [0, 1]]),
    /crosses the jade spool|crosses the 'jade' thread/,
  );
});

test("setPath rejects a path that visits a cell twice", () => {
  const game = createGame(SNAKE);
  assert.throws(
    () => setPath(game, "coral", [
      [0, 0],
      [1, 0],
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
      [1, 1],
      [2, 1],
      [2, 2],
    ]),
    /visits|one orthogonal/,
  );
});

test("clearPath removes a thread without touching the others", () => {
  let game = createGame(TWO_PAIR);
  game = setPath(game, "coral", [[0, 0], [0, 1]]);
  game = setPath(game, "jade", [[1, 0], [1, 1]]);
  const cleared = clearPath(game, "coral");
  assert.deepEqual(pathForColor(cleared, "coral"), []);
  assert.deepEqual(pathForColor(cleared, "jade"), [[1, 0], [1, 1]]);
});

test("occupiedCells maps every occupied cell to its colour", () => {
  let game = createGame(TWO_PAIR);
  game = setPath(game, "coral", [[0, 0], [0, 1]]);
  game = setPath(game, "jade", [[1, 0], [1, 1]]);
  const occupied = occupiedCells(game);
  assert.equal(occupied.get(cellKey(0, 0)), "coral");
  assert.equal(occupied.get(cellKey(1, 1)), "jade");
  assert.equal(occupied.get(cellKey(0, 1)), "coral");
  assert.equal(occupied.size, 4);
});

test("isSolved needs every pair connected and every cell covered", () => {
  let game = createGame(TWO_PAIR);
  assert.equal(isSolved(game), false);
  game = setPath(game, "coral", [[0, 0], [0, 1]]);
  assert.equal(isSolved(game), false);
  game = setPath(game, "jade", [[1, 0], [1, 1]]);
  assert.equal(isSolved(game), true);
});

test("isSolved rejects a complete but partial-coverage board", () => {
  const level = {
    id: "open",
    name: "Open",
    size: 3,
    pairs: [{ color: "coral", start: [0, 0], end: [2, 0] }],
  };
  const game = setPath(createGame(level), "coral", [
    [0, 0],
    [1, 0],
    [2, 0],
  ]);
  assert.equal(isSolved(game), false);
});
