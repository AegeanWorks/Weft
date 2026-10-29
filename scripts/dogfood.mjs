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
import { LEVELS } from "../src/game/levels.js";
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
  let nextId = 0;
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
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
        throw new Error(result.exceptionDetails.text);
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
      "--no-first-run",
      "--no-default-browser-check",
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
    await connection.send("Page.navigate", { url: `${url}?screen=levels` });
    await wait(900);

    const chamberCount = await connection.evaluate(
      "document.querySelectorAll('.level-card').length",
    );
    if (chamberCount !== 12) {
      throw new Error(`The chamber index rendered ${chamberCount} cards, not 12.`);
    }

    await connection.send("Page.navigate", { url: `${url}?level=first-thread` });
    await wait(900);
    const cells = await connection.evaluate("document.querySelectorAll('.cell').length");
    if (cells !== 25) {
      throw new Error(`The first loom rendered ${cells} cells, not 25.`);
    }

    const level = LEVELS[0];
    for (const pair of level.pairs) {
      await drawPair(connection, pair, level.solution[pair.color]);
    }

    const result = await connection.evaluate(`(() => ({
      win: document.getElementById('win-dialog').open,
      moves: document.getElementById('move-count').textContent,
      threads: document.querySelectorAll('.thread-core').length,
      saved: Boolean(localStorage.getItem('weft.progress.v1'))
    }))()`);
    if (!result.win || result.moves !== "3" || result.threads !== 3) {
      throw new Error(
        `The first chamber did not close: win=${result.win}, moves=${result.moves}, threads=${result.threads}.`,
      );
    }
    if (!result.saved) {
      throw new Error("The victory was not written to localStorage.");
    }
    console.log("[OK] Weft dogfood: title, 12 chambers, a 3-thread solve and the victory dialog.");
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
