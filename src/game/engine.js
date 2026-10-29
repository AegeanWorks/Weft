/**
 * Weft's pure thread-routing rules.
 *
 * A level is a square loom with one or more coloured spool pairs and a stored
 * solution. A path starts at a pair's first spool, ends at its second spool,
 * moves one orthogonal cell at a time, and may not share a cell with another
 * colour. A chamber is solved when every pair is connected and every cell of
 * the loom is covered by exactly one thread.
 *
 * The module has no DOM, clock, random source or storage dependency, so the
 * same calls drive the browser, the tests and the level validator.
 */

const DELTAS = Object.freeze([
  Object.freeze([0, -1]),
  Object.freeze([1, 0]),
  Object.freeze([0, 1]),
  Object.freeze([-1, 0]),
]);

export function cellKey(x, y) {
  return `${x},${y}`;
}

function pointKey(point) {
  return cellKey(point[0], point[1]);
}

function isPoint(point) {
  return (
    Array.isArray(point) &&
    point.length === 2 &&
    Number.isInteger(point[0]) &&
    Number.isInteger(point[1])
  );
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function validatePoint(point, size, label) {
  assert(isPoint(point), `${label} must be an [x, y] integer pair.`);
  const [x, y] = point;
  assert(
    x >= 0 && y >= 0 && x < size && y < size,
    `${label} leaves the ${size}x${size} loom.`,
  );
}

function assertOrthogonal(a, b, label) {
  const distance = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  assert(distance === 1, `${label} must move one orthogonal cell at a time.`);
}

function validatePathCells(path, level, color, label) {
  const size = level.size;
  assert(Array.isArray(path), `${label} must be an array of cells.`);
  const seen = new Set();
  for (let index = 0; index < path.length; index += 1) {
    validatePoint(path[index], size, `${label} cell ${index}`);
    if (index > 0) {
      assertOrthogonal(path[index - 1], path[index], `${label} cell ${index}`);
    }
    const key = pointKey(path[index]); // aikit:allow-secret a two-integer cell coordinate, not a credential
    assert(!seen.has(key), `${label} visits ${key} twice.`);
    seen.add(key);
  }
  assert(seen.size === path.length, `${label} contains duplicate cells.`);
  return seen;
}

/**
 * Validate a frozen level definition.
 *
 * The optional solution is checked as strictly as a player's win: it must use
 * the declared endpoints, move orthogonally and cover every cell exactly once.
 */
export function validateLevel(level) {
  assert(level && typeof level === "object", "A level must be an object.");
  assert(
    typeof level.id === "string" && level.id.length > 0,
    "A level needs a non-empty id.",
  );
  assert(
    typeof level.name === "string" && level.name.length > 0,
    `Level ${level.id} needs a non-empty name.`,
  );
  assert(
    Number.isInteger(level.size) && level.size >= 2,
    `Level ${level.id} needs an integer size of at least 2.`,
  );
  assert(
    Array.isArray(level.pairs) && level.pairs.length > 0,
    `Level ${level.id} needs at least one spool pair.`,
  );

  const colors = new Set();
  const endpoints = new Map();
  for (const pair of level.pairs) {
    assert(
      pair && typeof pair === "object",
      `Level ${level.id} contains a non-object pair.`,
    );
    assert(
      typeof pair.color === "string" && pair.color.length > 0,
      `Level ${level.id} contains a pair without a colour.`,
    );
    assert(
      !colors.has(pair.color),
      `Level ${level.id} repeats the colour '${pair.color}'.`,
    );
    colors.add(pair.color);
    validatePoint(pair.start, level.size, `Pair '${pair.color}' start`);
    validatePoint(pair.end, level.size, `Pair '${pair.color}' end`);
    assert(
      pointKey(pair.start) !== pointKey(pair.end),
      `Pair '${pair.color}' in ${level.id} starts and ends on the same cell.`,
    );
    for (const point of [pair.start, pair.end]) {
      const key = pointKey(point);
      assert(
        !endpoints.has(key),
        `Level ${level.id} places two spools on ${key}.`,
      );
      endpoints.set(key, pair.color);
    }
  }

  if (level.solution !== undefined) {
    assert(
      level.solution && typeof level.solution === "object",
      `Level ${level.id} has an invalid solution object.`,
    );
    const covered = new Set();
    for (const pair of level.pairs) {
      const path = level.solution[pair.color];
      const label = `Solution for '${pair.color}' in ${level.id}`;
      assert(Array.isArray(path) && path.length >= 2, `${label} is missing.`);
      assert(
        pointKey(path[0]) === pointKey(pair.start),
        `${label} does not begin at its first spool.`,
      );
      assert(
        pointKey(path[path.length - 1]) === pointKey(pair.end),
        `${label} does not end at its second spool.`,
      );
      const pathCells = validatePathCells(path, level, pair.color, label);
      for (const key of pathCells) {
        assert(
          !covered.has(key),
          `${label} covers ${key}, already used by another thread.`,
        );
        covered.add(key);
      }
    }
    const expected = level.size * level.size;
    assert(
      covered.size === expected,
      `Solution for ${level.id} covers ${covered.size} of ${expected} cells.`,
    );
  }

  return level;
}

/**
 * Build a fresh, immutable game for a validated level.
 */
export function createGame(level) {
  validateLevel(level);
  const paths = {};
  for (const pair of level.pairs) {
    paths[pair.color] = Object.freeze([]);
  }
  return Object.freeze({
    level,
    paths: Object.freeze(paths),
  });
}

export function pairForColor(game, color) {
  const pair = game.level.pairs.find((candidate) => candidate.color === color);
  assert(pair, `Unknown thread colour '${color}'.`);
  return pair;
}

export function pathForColor(game, color) {
  pairForColor(game, color);
  return game.paths[color];
}

/**
 * Return a map of every occupied cell key to its colour.
 */
export function occupiedCells(game) {
  const occupied = new Map();
  for (const pair of game.level.pairs) {
    for (const cell of game.paths[pair.color]) {
      occupied.set(pointKey(cell), pair.color);
    }
  }
  return occupied;
}

/**
 * Replace one colour's path after validating it against the level and every
 * other thread. Passing an empty array clears the thread.
 */
export function setPath(game, color, cells) {
  const pair = pairForColor(game, color);
  assert(Array.isArray(cells), `Path for '${color}' must be an array.`);
  const next = cells.map((cell) => {
    validatePoint(cell, game.level.size, `Path cell for '${color}'`);
    return Object.freeze([cell[0], cell[1]]);
  });

  if (next.length === 0) {
    return Object.freeze({
      level: game.level,
      paths: Object.freeze({ ...game.paths, [color]: Object.freeze([]) }),
    });
  }

  assert(
    pointKey(next[0]) === pointKey(pair.start),
    `Path for '${color}' must begin at ${pointKey(pair.start)}, not ${pointKey(next[0])}.`,
  );
  assert(
    pointKey(next[next.length - 1]) === pointKey(pair.end),
    `Path for '${color}' must end at ${pointKey(pair.end)}, not ${pointKey(next[next.length - 1])}.`,
  );
  validatePathCells(next, game.level, color, `Path for '${color}'`);

  const otherEndpoints = new Map();
  for (const candidate of game.level.pairs) {
    if (candidate.color !== color) {
      otherEndpoints.set(pointKey(candidate.start), candidate.color);
      otherEndpoints.set(pointKey(candidate.end), candidate.color);
    }
  }

  const occupied = occupiedCells(game);
  for (const cell of next) {
    const key = pointKey(cell);
    assert(
      !otherEndpoints.has(key),
      `Path for '${color}' crosses the ${otherEndpoints.get(key)} spool at ${key}.`,
    );
    const owner = occupied.get(key);
    assert(
      owner === undefined || owner === color,
      `Path for '${color}' crosses the '${owner}' thread at ${key}.`,
    );
  }

  return Object.freeze({
    level: game.level,
    paths: Object.freeze({ ...game.paths, [color]: Object.freeze(next) }),
  });
}

export function clearPath(game, color) {
  return setPath(game, color, []);
}

/**
 * True when every pair is connected and every cell is covered exactly once.
 */
export function isSolved(game) {
  const total = game.level.size * game.level.size;
  const covered = new Set();
  for (const pair of game.level.pairs) {
    const path = game.paths[pair.color];
    if (path.length < 2) {
      return false;
    }
    if (pointKey(path[0]) !== pointKey(pair.start)) {
      return false;
    }
    if (pointKey(path[path.length - 1]) !== pointKey(pair.end)) {
      return false;
    }
    for (const cell of path) {
      const key = pointKey(cell);
      if (covered.has(key)) {
        return false;
      }
      covered.add(key);
    }
  }
  return covered.size === total;
}

export { DELTAS };
