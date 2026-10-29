import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ATTRIBUTE_PATTERN = /data-(ui|panel|cue)\s*=\s*"([^"]+)"/g;
const KINDS = Object.freeze({ ui: "control", panel: "panel", cue: "cue" });
const EXTENSIONS = new Set([".html", ".js", ".mjs"]);
const root = fileURLToPath(new URL("..", import.meta.url));
const skip = new Set(["node_modules", ".git", ".aikit", "tests", "scripts"]);

function sourceFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (skip.has(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      found.push(path);
    }
  }
  return found.sort();
}

const entries = new Set();
for (const path of sourceFiles(root)) {
  const text = readFileSync(path, "utf8");
  for (const match of text.matchAll(ATTRIBUTE_PATTERN)) {
    entries.add(`${KINDS[match[1]]}: ${match[2]} @ ${relative(root, path).replaceAll("\\", "/")}`);
  }
}

if (entries.size === 0) {
  console.error("ui:snapshot found no data-ui, data-panel or data-cue entries.");
  process.exit(1);
}

console.log([...entries].sort().join("\n"));
