/**
 * Thread dash patterns: a colour-independent way to tell the nine threads apart.
 *
 * Each value is an SVG `stroke-dasharray` in loom-cell units. Coral stays solid
 * as the control; every other colour has a unique rhythm. The same pattern is
 * used on the thread and on its spool ring, so a pair can be matched by texture
 * as well as by hue.
 */

export const THREAD_PATTERNS = Object.freeze({
  coral: "none",
  lapis: "0.42 0.16",
  jade: "0.1 0.14",
  amber: "0.3 0.1 0.06 0.1",
  violet: "0.55 0.1",
  teal: "0.16 0.1",
  rose: "0.24 0.08 0.04 0.08",
  gold: "0.06 0.06",
  pearl: "0.5 0.24",
});

export function threadPattern(color) {
  return THREAD_PATTERNS[color] ?? "none";
}

export function applyPattern(node, color) {
  const pattern = threadPattern(color);
  node.style.strokeDasharray = pattern;
  return pattern;
}
