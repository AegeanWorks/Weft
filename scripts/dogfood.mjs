#!/usr/bin/env node
/**
 * Weft's browser dogfood pass.
 *
 * Starts the real static server, launches an installed Edge/Chrome in headless
 * mode, solves the first chamber through the DevTools protocol, and checks the
 * victory dialog. It skips cleanly when no Chromium browser or WebSocket client
 * is available; the HTTP and engine tests still run in those environments.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LEVELS, TOTAL_CHAMBERS } from "../src/game/levels.js";
import { createDailyLevel, dateKey } from "../src/game/daily.js";
import { startServer } from "./serve.mjs";

const BASE = "http://127.0.0.1";

const WINDOWS_BROWSERS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

const MAC_BROWSERS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

export function findBrowser(platform = process.platform, exists = existsSync) {
  if (platform === "win32") {
    return WINDOWS_BROWSERS.find((path) => exists(path)) ?? null;
  }
  if (platform === "darwin") {
    return MAC_BROWSERS.find((path) => exists(path)) ?? null;
  }
  for (const command of ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"]) {
    const result = spawnSync("which", [command], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  }
  return null;
}

function freePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createNetServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTarget(port, url, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = targets.find(
        (target) => target.type === "page" && target.url.startsWith(url),
      );
      if (page?.webSocketDebuggerUrl) {
        return page;
      }
    } catch {
      // The debugging endpoint is not listening yet.
    }
    await wait(200);
  }
  throw new Error("The browser did not expose a Weft page over CDP.");
}

async function connect(webSocketUrl) {
  const ws = new WebSocket(webSocketUrl);
  const pending = new Map();
  const errors = [];
  let nextId = 0;
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params?.exceptionDetails;
      errors.push(details?.exception?.description ?? details?.text ?? "uncaught exception");
    } else if (
      message.method === "Log.entryAdded" &&
      message.params?.entry?.level === "error"
    ) {
      errors.push(message.params.entry.text);
    }
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    }
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  return {
    ws,
    errors,
    send(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    async evaluate(expression) {
      const result = await this.send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails) {
        const details = result.exceptionDetails;
        throw new Error(details.exception?.description ?? details.text);
      }
      return result.result.value;
    },
  };
}

async function cellCenter(connection, x, y) {
  const center = await connection.evaluate(`(() => {
    const cell = document.querySelector('.cell[data-x="${x}"][data-y="${y}"]');
    if (!cell) return null;
    const rect = cell.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`);
  if (!center) {
    throw new Error(`The loom has no cell at ${x},${y}.`);
  }
  return center;
}

async function pressKey(connection, key, code, windowsVirtualKeyCode) {
  for (const type of ["rawKeyDown", "keyUp"]) {
    await connection.send("Input.dispatchKeyEvent", {
      type,
      key,
      code,
      windowsVirtualKeyCode,
    });
  }
  await wait(160);
}

async function pressEscape(connection) {
  await pressKey(connection, "Escape", "Escape", 27);
}

async function clickSelector(connection, selector) {
  const center = await connection.evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`);
  if (!center) {
    throw new Error(`The page has no ${selector} to click.`);
  }
  for (const type of ["mousePressed", "mouseReleased"]) {
    await connection.send("Input.dispatchMouseEvent", {
      type,
      x: center.x,
      y: center.y,
      button: "left",
      buttons: type === "mousePressed" ? 1 : 0,
      clickCount: 1,
    });
  }
  await wait(200);
}

async function clickCell(connection, x, y) {
  const point = await cellCenter(connection, x, y);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await connection.send("Input.dispatchMouseEvent", {
      type,
      x: point.x,
      y: point.y,
      button: "left",
      buttons: type === "mousePressed" ? 1 : 0,
      clickCount: 1,
    });
  }
  await wait(160);
}

async function drawPair(connection, pair, solution) {
  const first = await cellCenter(connection, pair.start[0], pair.start[1]);
  await connection.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: first.x,
    y: first.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  for (const [x, y] of solution.slice(1)) {
    const point = await cellCenter(connection, x, y);
    await connection.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: point.x,
      y: point.y,
      button: "left",
      buttons: 1,
    });
    await wait(12);
  }
  const last = await cellCenter(connection, pair.end[0], pair.end[1]);
  await connection.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: last.x,
    y: last.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
  await wait(140);
}

async function main() {
  if (typeof WebSocket !== "function") {
    console.log("[SKIP] Weft dogfood needs a Node.js with the global WebSocket client (22+).");
    return 0;
  }
  const browser = findBrowser();
  if (!browser) {
    console.log("[SKIP] No Edge/Chrome found; install one to run the browser dogfood pass.");
    return 0;
  }

  const { server, url } = await startServer({ port: 0 });
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), "weft-dogfood-"));
  const child = spawn(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1440,900",
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${port}`,
      url,
    ],
    { stdio: "ignore", windowsHide: true },
  );

  let connection = null;
  try {
    const target = await waitForTarget(port, url);
    connection = await connect(target.webSocketDebuggerUrl);
    await connection.send("Page.enable");
    await connection.send("Runtime.enable");
    await connection.send("Log.enable");
    await connection.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await connection.send("Page.navigate", { url: `${url}?screen=title` });
    await wait(900);
    await pressKey(connection, "Tab", "Tab", 9);
    const firstStop = await connection.evaluate(`(() => ({
      className: document.activeElement?.className ?? "",
      text: document.activeElement?.textContent?.trim() ?? ""
    }))()`);
    if (!firstStop.className.includes("skip-link") || firstStop.text !== "Skip to content") {
      throw new Error(
        `The first Tab stop is not the skip link: class=${firstStop.className}, text=${firstStop.text}.`,
      );
    }
    await pressKey(connection, "Enter", "Enter", 13);
    await wait(250);
    const skipped = await connection.evaluate(`(() => ({
      active: document.activeElement?.id || document.activeElement?.tagName || "",
      hash: location.hash
    }))()`);
    if (skipped.active !== "main" || skipped.hash !== "#main") {
      throw new Error(
        `The skip link did not focus main: active=${skipped.active}, hash=${skipped.hash}.`,
      );
    }
    await pressKey(connection, "Tab", "Tab", 9);
    const nextStop = await connection.evaluate(
      "document.activeElement?.textContent?.trim() ?? ''",
    );
    if (nextStop !== "Play") {
      throw new Error(`Tab after the skip target reached '${nextStop}', not Play.`);
    }
    await clickSelector(connection, "#btn-how");
    const help = await connection.evaluate(`(() => {
      const dialog = document.getElementById('help-dialog');
      return {
        open: dialog.open,
        scrollTop: dialog.scrollTop,
        active: document.activeElement?.id ?? ""
      };
    })()`);
    if (!help.open || help.scrollTop !== 0 || help.active !== "help-title") {
      throw new Error(
        `How to play did not open at its heading: open=${help.open}, scrollTop=${help.scrollTop}, active=${help.active}.`,
      );
    }
    await pressEscape(connection);
    const helpClosed = await connection.evaluate(`(() => ({
      open: document.getElementById('help-dialog').open,
      active: document.activeElement?.id ?? ""
    }))()`);
    if (helpClosed.open || helpClosed.active !== "btn-how") {
      throw new Error(
        `How to play did not close back to its opener: open=${helpClosed.open}, active=${helpClosed.active}.`,
      );
    }

    await connection.evaluate(`(() => {
      const solved = {};
      for (let index = 1; index <= ${TOTAL_CHAMBERS}; index += 1) {
        solved['ghost-' + String(index).padStart(2, '0')] = {
          bestMs: 1000 + index,
          hints: 0,
          moves: 3,
          at: '2026-11-07T00:00:00.000Z',
          stars: 3
        };
      }
      localStorage.setItem('weft.progress.v1', JSON.stringify({
        version: 1,
        solved,
        settings: { sound: false },
        lastLevel: 'ghost-${TOTAL_CHAMBERS}'
      }));
    })()`);
    await connection.send("Page.navigate", { url: `${url}?screen=title` });
    await wait(900);
    const poisonedTitle = await connection.evaluate(`(() => ({
      title: document.getElementById('title-progress').textContent,
      saved: Object.keys(JSON.parse(localStorage.getItem('weft.progress.v1') || '{}').solved || {}).length
    }))()`);
    if (
      poisonedTitle.saved !== TOTAL_CHAMBERS ||
      !poisonedTitle.title.startsWith(`${TOTAL_CHAMBERS} chambers`)
    ) {
      throw new Error(
        `Unknown chamber ids inflated the title: saved=${poisonedTitle.saved}, title=${poisonedTitle.title}.`,
      );
    }
    await connection.send("Page.navigate", { url: `${url}?screen=levels` });
    await wait(900);
    const poisonedLevels = await connection.evaluate(`(() => ({
      header: document.getElementById('levels-progress').textContent,
      unlocked: [...document.querySelectorAll('.level-card')].filter((card) => !card.disabled).length
    }))()`);
    if (
      !poisonedLevels.header.startsWith(`0 of ${TOTAL_CHAMBERS} woven`) ||
      poisonedLevels.unlocked !== 1
    ) {
      throw new Error(
        `Unknown chamber ids inflated the index: header=${poisonedLevels.header}, unlocked=${poisonedLevels.unlocked}.`,
      );
    }
    await connection.evaluate("localStorage.removeItem('weft.progress.v1')");

    await connection.send("Page.navigate", { url: `${url}?screen=levels` });
    await wait(900);

    const chamberCount = await connection.evaluate(
      "document.querySelectorAll('.level-card').length",
    );
    if (chamberCount !== TOTAL_CHAMBERS) {
      throw new Error(
        `The chamber index rendered ${chamberCount} cards, not ${TOTAL_CHAMBERS}.`,
      );
    }
    const previews = await connection.evaluate(`(() => ({
      minis: document.querySelectorAll('.level-card .level-mini').length,
      firstSpools: document.querySelectorAll('.level-card[data-level="first-thread"] .level-mini .mini-spool').length,
      lastSpools: document.querySelectorAll('.level-card[data-level="${LEVELS.at(-1).id}"] .level-mini .mini-spool').length
    }))()`);
    if (
      previews.minis !== TOTAL_CHAMBERS ||
      previews.firstSpools !== LEVELS[0].pairs.length * 2 ||
      previews.lastSpools !== LEVELS.at(-1).pairs.length * 2
    ) {
      throw new Error(
        `The chamber previews are incomplete: minis=${previews.minis}, firstSpools=${previews.firstSpools}, lastSpools=${previews.lastSpools}.`,
      );
    }

    await clickSelector(connection, '.level-card[data-level="first-thread"]');
    await wait(900);
    const cells = await connection.evaluate("document.querySelectorAll('.cell').length");
    if (cells !== 25) {
      throw new Error(`The first loom rendered ${cells} cells, not 25.`);
    }
    await connection.evaluate(`(() => {
      const log = [];
      window.__weftAudio = log;
      class FakeParam {
        constructor(name) { this.name = name; }
        setValueAtTime(value, at) {
          if (this.name === 'frequency') log.push({ kind: 'freq', value, at });
        }
        exponentialRampToValueAtTime() {}
      }
      class FakeOscillator {
        constructor() {
          this.frequency = new FakeParam('frequency');
          this.type = 'sine';
        }
        connect() {}
        start(at) { log.push({ kind: 'start', at, type: this.type }); }
        stop(at) { log.push({ kind: 'stop', at }); }
      }
      class FakeGain {
        constructor() { this.gain = new FakeParam('gain'); }
        connect() {}
      }
      class FakeContext {
        constructor() {
          this.state = 'running';
          this.currentTime = 0;
          this.destination = {};
        }
        resume() { return Promise.resolve(); }
        createOscillator() { return new FakeOscillator(); }
        createGain() { return new FakeGain(); }
      }
      window.AudioContext = FakeContext;
      window.webkitAudioContext = FakeContext;
    })()`);

    const level = LEVELS[0];
    for (const pair of level.pairs) {
      await drawPair(connection, pair, level.solution[pair.color]);
    }

    const result = await connection.evaluate(`(() => {
      const saved = JSON.parse(localStorage.getItem('weft.progress.v1') || '{}');
      return {
        win: document.getElementById('win-dialog').open,
        moves: document.getElementById('move-count').textContent,
        threads: document.querySelectorAll('.thread-core').length,
        stars: document.getElementById('win-stars').getAttribute('aria-label'),
        best: document.getElementById('best').textContent,
        savedStars: saved.solved?.['first-thread']?.stars
      };
    })()`);
    if (!result.win || result.moves !== "3" || result.threads !== 3) {
      throw new Error(
        `The first chamber did not close: win=${result.win}, moves=${result.moves}, threads=${result.threads}.`,
      );
    }
    if (result.stars !== "3 of 3 stars" || result.savedStars !== 3) {
      throw new Error(
        `A clean solve did not record three stars: dialog=${result.stars}, saved=${result.savedStars}.`,
      );
    }
    if (!result.best.includes("3/3")) {
      throw new Error(`The HUD did not show the best rating: best=${result.best}.`);
    }

    await pressEscape(connection);
    const dismissed = await connection.evaluate(`(() => ({
      open: document.getElementById('win-dialog').open,
      status: document.getElementById('status').textContent
    }))()`);
    if (dismissed.open || !dismissed.status.includes("reopen")) {
      throw new Error(
        `A dismissed victory left no recovery path: open=${dismissed.open}, status=${dismissed.status}.`,
      );
    }
    await clickCell(connection, level.pairs[0].start[0], level.pairs[0].start[1]);
    const reopened = await connection.evaluate(`(() => ({
      open: document.getElementById('win-dialog').open,
      status: document.getElementById('status').textContent
    }))()`);
    if (!reopened.open || reopened.status !== "Chamber woven.") {
      throw new Error(
        `The won loom did not reopen its result: open=${reopened.open}, status=${reopened.status}.`,
      );
    }
    await connection.evaluate("document.getElementById('btn-next').click()");
    await wait(500);
    const advanced = await connection.evaluate(`(() => ({
      screen: document.body.dataset.screen,
      level: document.getElementById('level-name').textContent,
      kicker: document.getElementById('level-kicker').textContent
    }))()`);
    if (
      advanced.screen !== "game" ||
      advanced.level !== LEVELS[1].name ||
      !advanced.kicker.startsWith("Chamber 02")
    ) {
      throw new Error(
        `The recovered victory did not advance: screen=${advanced.screen}, level=${advanced.level}, kicker=${advanced.kicker}.`,
      );
    }

    const second = LEVELS[1];
    await connection.evaluate("document.getElementById('btn-hint').click()");
    await wait(160);
    const hintThreads = await connection.evaluate(
      "document.querySelectorAll('.hint-thread').length",
    );
    if (hintThreads !== 1) {
      throw new Error(`Chamber 02 did not show its hint ghost: ${hintThreads}.`);
    }
    await drawPair(
      connection,
      second.pairs[0],
      second.solution[second.pairs[0].color],
    );
    await connection.evaluate("document.getElementById('btn-undo').click()");
    await wait(200);
    for (const pair of second.pairs.slice(0, 2)) {
      await drawPair(connection, pair, second.solution[pair.color]);
    }
    await connection.evaluate("document.getElementById('btn-reset').click()");
    await wait(250);
    const reset = await connection.evaluate(`(() => ({
      moves: document.getElementById('move-count').textContent,
      threads: document.querySelectorAll('.thread-core').length,
      undoDisabled: document.getElementById('btn-undo').disabled,
      timer: document.getElementById('timer').textContent,
      hintThreads: document.querySelectorAll('.hint-thread').length
    }))()`);
    if (
      reset.moves !== "0" ||
      reset.threads !== 0 ||
      !reset.undoDisabled ||
      reset.timer !== "00:00" ||
      reset.hintThreads !== 0
    ) {
      throw new Error(
        `Reset did not start a clean attempt: moves=${reset.moves}, threads=${reset.threads}, undoDisabled=${reset.undoDisabled}, timer=${reset.timer}, hintThreads=${reset.hintThreads}.`,
      );
    }
    const audioLog = await connection.evaluate("window.__weftAudio || []");
    const audioFrequencies = audioLog
      .filter((entry) => entry.kind === "freq")
      .map((entry) => entry.value);
    const hasRun = (sequence) =>
      audioFrequencies.some((_, start) =>
        sequence.every((value, offset) => audioFrequencies[start + offset] === value),
      );
    if (
      !hasRun([880, 1174.66]) ||
      !hasRun([392, 293.66]) ||
      !hasRun([196])
    ) {
      throw new Error(
        `The action cues are not distinct in the browser: ${JSON.stringify(audioFrequencies)}.`,
      );
    }

    await connection.send("Page.navigate", { url: `${url}?screen=levels` });
    await wait(900);
    const firstCard = await connection.evaluate(`(() => {
      const card = document.querySelector('.level-card[data-level="first-thread"]');
      const row = card?.querySelector('.level-card-stars');
      return {
        stars: card?.querySelectorAll('.star.is-on').length ?? 0,
        label: row?.getAttribute('aria-label') ?? ''
      };
    })()`);
    if (firstCard.stars !== 3 || firstCard.label !== "3 of 3 stars") {
      throw new Error(
        `The chamber card did not show three stars: on=${firstCard.stars}, label=${firstCard.label}.`,
      );
    }

    const last = LEVELS.at(-1);
    await connection.send("Page.navigate", { url: `${url}?level=${last.id}` });
    await wait(900);
    const lastBoard = await connection.evaluate(`(() => ({
      cells: document.querySelectorAll('.cell').length,
      spools: document.querySelectorAll('[data-spool]').length,
      name: document.getElementById('level-name').textContent
    }))()`);
    if (
      lastBoard.cells !== last.size * last.size ||
      lastBoard.spools !== last.pairs.length * 2 ||
      lastBoard.name !== last.name
    ) {
      throw new Error(
        `The last chamber did not render: cells=${lastBoard.cells}, spools=${lastBoard.spools}, name=${lastBoard.name}.`,
      );
    }

    const dailyKey = dateKey();
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    const pastKey = dateKey(pastDate);
    await connection.send("Page.navigate", { url: `${url}?daily=${pastKey}` });
    await wait(900);
    const pastLink = await connection.evaluate(`(() => ({
      boardLevel: document.getElementById('board').dataset.level,
      kicker: document.getElementById('level-kicker').textContent,
      saved: localStorage.getItem('weft.daily.v1')
    }))()`);
    if (pastLink.boardLevel !== `daily-${dailyKey}` || pastLink.saved !== null) {
      throw new Error(
        `A past daily link opened or saved a historical day: board=${pastLink.boardLevel}, saved=${pastLink.saved}.`,
      );
    }
    const daily = createDailyLevel(dailyKey);
    await connection.send("Page.navigate", { url: `${url}?daily=1` });
    await wait(900);
    const dailyBoard = await connection.evaluate(`(() => ({
      cells: document.querySelectorAll('.cell').length,
      spools: document.querySelectorAll('[data-spool]').length,
      kicker: document.getElementById('level-kicker').textContent
    }))()`);
    if (
      dailyBoard.cells !== daily.size * daily.size ||
      dailyBoard.spools !== daily.pairs.length * 2 ||
      !dailyBoard.kicker.startsWith("Daily weave")
    ) {
      throw new Error(
        `The daily chamber did not render: cells=${dailyBoard.cells}, spools=${dailyBoard.spools}, kicker=${dailyBoard.kicker}.`,
      );
    }
    for (const pair of daily.pairs) {
      await drawPair(connection, pair, daily.solution[pair.color]);
    }
    const dailyResult = await connection.evaluate(`(() => {
      const saved = JSON.parse(localStorage.getItem('weft.daily.v1') || '{}');
      return {
        win: document.getElementById('win-dialog').open,
        nextHidden: document.getElementById('btn-next').hidden,
        shareHidden: document.getElementById('btn-share').hidden,
        shareHiddenText: document.getElementById('daily-share').hidden,
        share: document.getElementById('daily-share').textContent,
        best: document.getElementById('best').textContent,
        stars: saved.days?.['${dailyKey}']?.stars
      };
    })()`);
    if (
      !dailyResult.win ||
      !dailyResult.nextHidden ||
      dailyResult.shareHidden ||
      dailyResult.shareHiddenText ||
      dailyResult.stars !== 3
    ) {
      throw new Error(
        `The daily chamber did not close cleanly: win=${dailyResult.win}, nextHidden=${dailyResult.nextHidden}, shareHidden=${dailyResult.shareHidden}, stars=${dailyResult.stars}.`,
      );
    }
    if (!dailyResult.share.includes(dailyKey) || !dailyResult.best.includes("3/3")) {
      throw new Error(
        `The daily result line or best rating is missing: share=${dailyResult.share}, best=${dailyResult.best}.`,
      );
    }
    await connection.send("Page.navigate", { url: `${url}?screen=levels` });
    await wait(900);
    const history = await connection.evaluate(`(() => {
      const days = [...document.querySelectorAll('.daily-day')];
      return {
        count: days.length,
        lastState: days.at(-1)?.dataset.state ?? '',
        lastLabel: days.at(-1)?.getAttribute('aria-label') ?? ''
      };
    })()`);
    if (
      history.count !== 7 ||
      history.lastState !== "solved" ||
      !history.lastLabel.includes("3 of 3 stars")
    ) {
      throw new Error(
        `The daily history did not show seven solved days: count=${history.count}, last=${history.lastState}, label=${history.lastLabel}.`,
      );
    }
    const lateTarget = LEVELS[12];
    await connection.evaluate(`(() => {
      const levels = ${JSON.stringify(LEVELS.slice(0, 12).map((level) => level.id))};
      const solved = {};
      levels.forEach((id, index) => {
        solved[id] = {
          bestMs: 1000 + index,
          hints: 0,
          moves: 3,
          at: '2026-11-08T00:00:00.000Z',
          stars: 3
        };
      });
      localStorage.setItem('weft.progress.v1', JSON.stringify({
        version: 1,
        solved,
        settings: { sound: false },
        lastLevel: levels.at(-1)
      }));
    })()`);
    await connection.send("Page.navigate", { url: `${url}?screen=levels` });
    await wait(900);
    const scrolled = await connection.evaluate(`(() => {
      const card = document.querySelector('.level-card[data-level="${lateTarget.id}"]');
      card.scrollIntoView({ block: 'center' });
      return { scrollY: window.scrollY, top: card.getBoundingClientRect().top };
    })()`);
    await clickSelector(connection, `.level-card[data-level="${lateTarget.id}"]`);
    await wait(500);
    const lateOpened = await connection.evaluate(
      "document.getElementById('level-name').textContent",
    );
    if (lateOpened !== lateTarget.name) {
      throw new Error(`The late card opened ${lateOpened}, not ${lateTarget.name}.`);
    }
    await clickSelector(connection, "#btn-levels");
    await wait(500);
    const restored = await connection.evaluate(`(() => {
      const card = document.querySelector('.level-card[data-level="${lateTarget.id}"]');
      return {
        scrollY: window.scrollY,
        top: card.getBoundingClientRect().top,
        active: document.activeElement?.dataset?.level ?? ""
      };
    })()`);
    if (
      Math.abs(restored.scrollY - scrolled.scrollY) > 4 ||
      restored.active !== lateTarget.id
    ) {
      throw new Error(
        `The index did not restore its scroll and focus: before=${scrolled.scrollY}, after=${restored.scrollY}, active=${restored.active}.`,
      );
    }
    await connection.evaluate("localStorage.removeItem('weft.progress.v1')");
    if (connection.errors.length > 0) {
      throw new Error(
        `The played run logged ${connection.errors.length} page error(s): ${connection.errors.join(" | ")}`,
      );
    }
    console.log(
      `[OK] Weft dogfood: title, ${TOTAL_CHAMBERS} chambers, a 3-thread solve, the victory dialog, the ${last.size}x${last.size} finale and the daily weave; 0 page errors.`,
    );
    return 0;
  } catch (error) {
    console.error(`[FAIL] Weft dogfood: ${error.message}`);
    console.error("Fix: run `npm start`, open the game, and check the browser console.");
    return 1;
  } finally {
    connection?.ws.close();
    if (process.platform === "win32" && child.pid) {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      child.kill("SIGTERM");
    }
    await new Promise((resolveClose) => server.close(resolveClose));
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    } catch {
      // A lingering browser lock is harmless; the OS temp cleaner handles it.
    }
  }
}

process.exitCode = await main();
