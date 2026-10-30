import test from "node:test";
import assert from "node:assert/strict";

import { COLORS } from "../src/game/generate.js";
import { THREAD_PATTERNS, threadPattern } from "../src/ui/threads.js";

test("every thread colour has a unique dash pattern", () => {
  const patterns = COLORS.map((color) => threadPattern(color));
  assert.equal(new Set(patterns).size, COLORS.length);
  assert.equal(patterns.filter((pattern) => pattern === "none").length, 1);
  for (const color of COLORS) {
    assert.equal(typeof THREAD_PATTERNS[color], "string");
  }
});

test("an unknown colour falls back to a solid thread", () => {
  assert.equal(threadPattern("unknown"), "none");
});
