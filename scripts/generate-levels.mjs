#!/usr/bin/env node
/**
 * Generate the eighteen frozen Weft chambers.
 *
 * Every chamber starts from a randomized Hamiltonian path over the loom, then
 * cuts that path into the requested number of threads. That construction makes
 * the stored solution total by definition: every cell belongs to exactly one
 * segment, and every segment is an orthogonal path between its two spools.
 * Act II specs set `balanced: true`, which keeps every thread a similar share of
 * the loom instead of letting the final segment take whatever remains.
 *
 * Run from the project root:
 *   node scripts/generate-levels.mjs
 *
 * The output is deterministic for the seeds below, so a regenerated file can be
 * compared with the committed one.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "src/game/levels.js");

const COLORS = Object.freeze([
  "coral",
  "lapis",
  "jade",
  "amber",
  "violet",
  "teal",
  "rose",
  "gold",
  "pearl",
]);

const SPECS = Object.freeze([
  { id: "first-thread", name: "First Thread", size: 5, pairs: 3, seed: "weft-01" },
  { id: "crossweave", name: "Crossweave", size: 5, pairs: 4, seed: "weft-02" },
  { id: "loom-light", name: "Loom Light", size: 6, pairs: 4, seed: "weft-03" },
  { id: "tidal-knot", name: "Tidal Knot", size: 6, pairs: 5, seed: "weft-04" },
  { id: "bronze-loom", name: "Bronze Loom", size: 7, pairs: 5, seed: "weft-05" },
  { id: "salt-weave", name: "Salt Weave", size: 7, pairs: 6, seed: "weft-06" },
  { id: "aegean-fold", name: "Aegean Fold", size: 7, pairs: 7, seed: "weft-07" },
  { id: "warp-song", name: "Warp Song", size: 8, pairs: 6, seed: "weft-08" },
  { id: "shuttle", name: "Shuttle", size: 8, pairs: 7, seed: "weft-09" },
  { id: "tapestry", name: "Tapestry", size: 8, pairs: 8, seed: "weft-10" },
  { id: "the-long-weave", name: "The Long Weave", size: 9, pairs: 8, seed: "weft-11" },
  { id: "meridian-weave", name: "Meridian Weave", size: 9, pairs: 9, seed: "weft-12" },
  { id: "reef-weft", name: "Reef Weft", size: 10, pairs: 8, seed: "weft-13", balanced: true },
  { id: "lantern-weave", name: "Lantern Weave", size: 10, pairs: 9, seed: "weft-14", balanced: true },
  { id: "deep-current", name: "Deep Current", size: 11, pairs: 8, seed: "weft-15", balanced: true },
  { id: "star-loom", name: "Star Loom", size: 11, pairs: 9, seed: "weft-16", balanced: true },
  { id: "the-far-weave", name: "The Far Weave", size: 12, pairs: 8, seed: "weft-17", balanced: true },
  { id: "aegean-crown", name: "Aegean Crown", size: 12, pairs: 9, seed: "weft-18", balanced: true },
]);

function hashSeed(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRandom(seed) {
  const next = mulberry32(hashSeed(seed));
  return {
    next,
    int(maximum) {
      return Math.floor(next() * maximum);
    },
  };
}

function key(x, y) {
  return `${x},${y}`;
}

function neighbours(x, y, size) {
  const result = [];
  if (y > 0) result.push([x, y - 1]);
  if (x < size - 1) result.push([x + 1, y]);
  if (y < size - 1) result.push([x, y + 1]);
  if (x > 0) result.push([x - 1, y]);
  return result;
}

function onwardDegree(x, y, size, visited) {
  return neighbours(x, y, size).filter(([nx, ny]) => !visited.has(key(nx, ny))).length;
}

function remainingIsConnected(size, visited) {
  const unvisited = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!visited.has(key(x, y))) {
        unvisited.push([x, y]);
      }
    }
  }
  if (unvisited.length <= 1) {
    return true;
  }
  for (const [x, y] of unvisited) {
    const open = neighbours(x, y, size).filter(
      ([nx, ny]) => !visited.has(key(nx, ny)),
    );
    if (open.length === 0) {
      return false;
    }
  }
  const first = unvisited[0];
  const seen = new Set([key(first[0], first[1])]);
  const stack = [first];
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    for (const [nx, ny] of neighbours(x, y, size)) {
      const nextKey = key(nx, ny);
      if (!visited.has(nextKey) && !seen.has(nextKey)) {
        seen.add(nextKey);
        stack.push([nx, ny]);
      }
    }
  }
  return seen.size === unvisited.length;
}

/**
 * A randomized depth-first Hamiltonian path with a Warnsdorff ordering and a
 * connectivity cut. Each attempt has a node budget; a trapped attempt is
 * abandoned and restarted from another cell, which is much safer than one
 * unbounded search.
 */
function hamiltonianPath(size, random, attemptBudget = 120000, attempts = 24) {
  const total = size * size;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const start = [random.int(size), random.int(size)];
    const path = [start];
    const visited = new Set([key(start[0], start[1])]);
    let nodes = 0;

    function search() {
      if (path.length === total) {
        return true;
      }
      nodes += 1;
      if (nodes > attemptBudget) {
        return false;
      }
      const [x, y] = path[path.length - 1];
      const candidates = neighbours(x, y, size)
        .filter(([nx, ny]) => !visited.has(key(nx, ny)))
        .map((point) => ({
          point,
          degree: onwardDegree(point[0], point[1], size, visited),
          order: random.next(),
        }))
        .sort((a, b) => a.degree - b.degree || a.order - b.order);

      for (const candidate of candidates) {
        const [nx, ny] = candidate.point;
        visited.add(key(nx, ny));
        path.push([nx, ny]);
        if (path.length === total || remainingIsConnected(size, visited)) {
          if (search()) {
            return true;
          }
        }
        path.pop();
        visited.delete(key(nx, ny));
      }
      return false;
    }

    if (search()) {
      return path;
    }
  }

  throw new Error(`No Hamiltonian path found for size ${size}.`);
}

function cutOnce(path, pairCount, random) {
  const minimum = 3;
  const lengths = [];
  let remaining = path.length;
  for (let index = 0; index < pairCount - 1; index += 1) {
    const later = pairCount - index - 1;
    const maximum = Math.min(
      remaining - minimum * later,
      Math.max(minimum, Math.round(path.length / pairCount) + 4),
    );
    const length = minimum + random.int(maximum - minimum + 1);
    lengths.push(length);
    remaining -= length;
  }
  lengths.push(remaining);

  const segments = [];
  let offset = 0;
  for (const length of lengths) {
    segments.push(path.slice(offset, offset + length));
    offset += length;
  }
  return segments;
}

/**
 * Cut a Hamiltonian path into threads of a similar length.
 *
 * Each cut aims for the current mean and jitters by two cells, so a large loom
 * does not end up with one thread covering a third of the board.
 */
function cutEvenly(path, pairCount, random) {
  const minimum = 3;
  const lengths = [];
  let remaining = path.length;
  for (let index = 0; index < pairCount - 1; index += 1) {
    const later = pairCount - index - 1;
    const ideal = Math.round(remaining / (later + 1));
    const target = ideal + random.int(5) - 2;
    const upper = Math.max(minimum, remaining - minimum * later);
    const length = Math.max(minimum, Math.min(upper, target));
    lengths.push(length);
    remaining -= length;
  }
  lengths.push(remaining);

  const segments = [];
  let offset = 0;
  for (const length of lengths) {
    segments.push(path.slice(offset, offset + length));
    offset += length;
  }
  return segments;
}

function endpointsAreApart(segments) {
  return segments.every((segment) => {
    const [ax, ay] = segment[0];
    const [bx, by] = segment[segment.length - 1];
    return Math.abs(ax - bx) + Math.abs(ay - by) > 1;
  });
}

function cutPath(path, pairCount, random, balanced = false) {
  const minimum = 3;
  runLengthCheck(path.length, pairCount, minimum);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const segments = balanced
      ? cutEvenly(path, pairCount, random)
      : cutOnce(path, pairCount, random);
    if (endpointsAreApart(segments)) {
      return segments;
    }
  }
  return balanced ? cutEvenly(path, pairCount, random) : cutOnce(path, pairCount, random);
}

function runLengthCheck(total, pairCount, minimum) {
  if (total < pairCount * minimum) {
    throw new Error(`A ${pairCount}-pair level needs at least ${pairCount * minimum} cells.`);
  }
}

function makeLevel(spec, index) {
  const random = makeRandom(spec.seed);
  const path = hamiltonianPath(spec.size, random);
  const segments = cutPath(path, spec.pairs, random, spec.balanced === true);
  const offset = (index * 2) % COLORS.length;
  const rotated = [...COLORS.slice(offset), ...COLORS.slice(0, offset)];
  const colors = rotated.slice(0, spec.pairs);
  const pairs = [];
  const solution = {};
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const color = colors[index];
    pairs.push({
      color,
      start: segment[0],
      end: segment[segment.length - 1],
    });
    solution[color] = segment;
  }
  return {
    id: spec.id,
    name: spec.name,
    size: spec.size,
    pairs,
    solution,
  };
}

function formatPoint(point) {
  return `[${point[0]}, ${point[1]}]`;
}

function formatPath(path) {
  return `[${path.map(formatPoint).join(", ")}]`;
}

function formatLevel(level) {
  const pairs = level.pairs
    .map(
      (pair) =>
        `      { color: ${JSON.stringify(pair.color)}, start: ${formatPoint(pair.start)}, end: ${formatPoint(pair.end)} },`,
    )
    .join("\n");
  const solution = level.pairs
    .map(
      (pair) =>
        `      ${JSON.stringify(pair.color)}: ${formatPath(level.solution[pair.color])},`,
    )
    .join("\n");
  return `  Object.freeze({
    id: ${JSON.stringify(level.id)},
    name: ${JSON.stringify(level.name)},
    size: ${level.size},
    pairs: Object.freeze([
${pairs}
    ]),
    solution: Object.freeze({
${solution}
    }),
  }),`;
}

function buildFile() {
  const levels = SPECS.map((spec, index) => makeLevel(spec, index));
  const body = levels.map(formatLevel).join("\n");
  return `/**
 * Weft's eighteen frozen chambers.
 *
 * Generated by scripts/generate-levels.mjs. Every solution is total: the
 * segments partition the loom, each segment moves one orthogonal cell at a
 * time, and each segment ends on its declared spool. Do not hand-edit a cell
 * without regenerating and rerunning the level tests.
 */

export const LEVELS = Object.freeze([
${body}
]);

export const LEVEL_BY_ID = Object.freeze(
  Object.fromEntries(LEVELS.map((level) => [level.id, level])),
);

export const TOTAL_CHAMBERS = LEVELS.length;
`;
}

const output = buildFile();
await writeFile(OUTPUT, output, "utf8");
console.log(`[OK] Wrote ${SPECS.length} chambers to ${OUTPUT}`);
