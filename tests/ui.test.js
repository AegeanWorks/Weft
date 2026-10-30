import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const theme = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/ui/app.js", import.meta.url), "utf8");
const progress = readFileSync(new URL("../src/ui/progress.js", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function ids() {
  return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
}

function attributes(name) {
  return new Set(
    [...html.matchAll(new RegExp(`data-${name}="([^"]+)"`, "g"))].map((match) => match[1]),
  );
}

test("the shell has the required screens, dialogs and controls", () => {
  const found = ids();
  for (const id of [
    "title-heading",
    "levels-heading",
    "level-grid",
    "board",
    "timer",
    "move-count",
    "status",
    "btn-play",
    "btn-how",
    "btn-back-title",
    "btn-levels",
    "btn-undo",
    "btn-reset",
    "btn-hint",
    "btn-sound-title",
    "btn-sound-game",
    "help-dialog",
    "win-dialog",
    "btn-next",
    "btn-replay",
    "btn-win-levels",
  ]) {
    assert.ok(found.has(id), `missing #${id}`);
  }
});

test("the UI inventory names every control, panel and cue", () => {
  assert.deepEqual(
    [...attributes("ui")].sort(),
    [
      "back-title",
      "chambers",
      "hint",
      "how-to-play",
      "next-chamber",
      "play",
      "replay",
      "reset",
      "sound-game",
      "sound-title",
      "undo",
      "win-chambers",
    ],
  );
  assert.deepEqual([...attributes("panel")].sort(), [
    "game",
    "help",
    "levels",
    "loom",
    "title",
    "win",
  ]);
  assert.deepEqual([...attributes("cue")].sort(), ["status", "win"]);
});

test("every static button has visible text or an accessible label", () => {
  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  assert.ok(buttons.length >= 10);
  for (const [, attrs, body] of buttons) {
    const text = body.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    assert.ok(text.length > 0 || /aria-label="[^"]+"/.test(attrs), `button without a label: ${attrs}`);
  }
  assert.doesNotMatch(html, /\son\w+=/i);
});

test("the page loads only local module scripts and token styles", () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /<title>Weft/);
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /<script type="module" src="\.\/src\/ui\/app\.js"><\/script>/);
  assert.match(html, /href="\.\/src\/theme\.css"/);
  assert.match(html, /href="\.\/src\/styles\.css"/);
  assert.doesNotMatch(html, /src="\/|href="\/|src="http|href="http/);
  assert.doesNotMatch(html, /style="/);
});

test("styles.css uses theme tokens rather than raw colour literals", () => {
  assert.doesNotMatch(styles, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(styles, /rgb\(|hsl\(/);
  assert.match(styles, /var\(--bronze\)/);
  assert.match(styles, /var\(--thread-gold\)/);
  for (const color of [
    "coral",
    "amber",
    "jade",
    "lapis",
    "violet",
    "rose",
    "teal",
    "gold",
    "pearl",
  ]) {
    assert.match(theme, new RegExp(`--thread-${color}:`));
  }
});

test("the app imports the pure engine, levels, progress and audio", () => {
  assert.match(app, /from "\.\.\/game\/engine\.js"/);
  assert.match(app, /from "\.\.\/game\/levels\.js"/);
  assert.match(app, /from "\.\/progress\.js"/);
  assert.match(app, /from "\.\/audio\.js"/);
  assert.doesNotMatch(app, /\bfetch\s*\(|XMLHttpRequest/);
  assert.match(progress, /weft\.progress\.v1/);
  assert.doesNotMatch(progress, /\bfetch\s*\(|XMLHttpRequest/);
});

test("the package declares the local play and regression commands", () => {
  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.version, "0.2.0");
  assert.equal(packageJson.scripts.test, "node --test tests");
  assert.equal(packageJson.scripts.start, "node scripts/serve.mjs --open");
  assert.equal(packageJson.scripts["ui:snapshot"], "node scripts/ui-inventory.mjs");
});

test("screen switching targets sections, never the body, and resets scroll", () => {
  assert.match(app, /querySelectorAll\("section\[data-screen\]"\)/);
  assert.doesNotMatch(app, /querySelectorAll\("\[data-screen\]"\)/);
  assert.match(app, /section\[data-screen="\$\{name\}"\] h1/);
  assert.match(app, /window\.scrollTo\(0, 0\)/);
  assert.match(styles, /\.shell\s*\{[\s\S]*?justify-content:\s*flex-start;/);
});

test("the UI inventory script reports a stable, non-empty catalogue", () => {
  const output = execFileSync(process.execPath, ["scripts/ui-inventory.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.match(output, /^control: play @ index\.html$/m);
  assert.match(output, /^panel: title @ index\.html$/m);
  assert.match(output, /^cue: status @ index\.html$/m);
  assert.match(output, /^panel: win @ index\.html$/m);
  assert.ok(output.trim().split("\n").length >= 20);
});
