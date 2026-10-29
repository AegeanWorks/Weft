import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_PORT = 4175;
const TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
});

export function browserCommand(platform, url) {
  if (platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", url] };
  }
  if (platform === "darwin") {
    return { command: "open", args: [url] };
  }
  return { command: "xdg-open", args: [url] };
}

export function looksLikeWeft(body) {
  return typeof body === "string" && body.includes("<title>Weft");
}

export function launchBrowser(url, platform = process.platform, spawnProcess = spawn) {
  const { command, args } = browserCommand(platform, url);
  try {
    const child = spawnProcess(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", () => {});
    child.unref();
    return child;
  } catch {
    return null;
  }
}

export function safePath(urlPath = "/", base = root) {
  let clean;
  try {
    clean = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  if (clean.includes("\0")) {
    return null;
  }
  const relative =
    clean === "/" || clean === ""
      ? "index.html"
      : clean.replace(/^[/\\]+/, "").replace(/\\/g, "/");
  const candidate = normalize(join(base, relative));
  return candidate === base || candidate.startsWith(`${base}${sep}`) ? candidate : null;
}

const PUBLIC_ENTRIES = Object.freeze(["index.html", "src", "assets"]);

function isPublic(filePath, base = root) {
  const relative = normalize(filePath).slice(normalize(base).length + 1).replaceAll("\\", "/");
  return PUBLIC_ENTRIES.some(
    (entry) => relative === entry || relative.startsWith(`${entry}/`),
  );
}

async function handler(request, response) {
  const filePath = safePath(request.url ?? "/");
  if (!filePath || !isPublic(filePath)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }).end("Forbidden");
    return;
  }
  try {
    const info = await stat(filePath);
    const target = info.isDirectory() ? join(filePath, "index.html") : filePath;
    const body = await readFile(target);
    response.writeHead(200, {
      "Content-Type": TYPES[extname(target)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
}

export function startServer({ port = DEFAULT_PORT, host = "127.0.0.1" } = {}) {
  const server = createServer(handler);
  return new Promise((resolveStart, rejectStart) => {
    server.once("error", rejectStart);
    server.listen(port, host, () => {
      server.off("error", rejectStart);
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolveStart({ server, url: `http://${host}:${actualPort}/` });
    });
  });
}

async function alreadyRunning(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok && looksLikeWeft(await response.text());
  } catch {
    return false;
  }
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Port must be a whole number from 1 to 65535, not '${value}'.`);
  }
  return port;
}

const isMain =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  const portArg = process.argv.indexOf("--port");
  const hostArg = process.argv.indexOf("--host");
  let port = DEFAULT_PORT;
  let host = "127.0.0.1";
  try {
    port = portArg > -1 ? parsePort(process.argv[portArg + 1]) : DEFAULT_PORT;
    host = hostArg > -1 ? process.argv[hostArg + 1] : "127.0.0.1";
  } catch (error) {
    console.error(`Weft could not start: ${error.message}`);
    console.error("Fix: use --port 4175, or another whole number from 1 to 65535.");
    process.exitCode = 2;
  }
  if (!process.exitCode) {
    startServer({ port, host })
      .then(({ url }) => {
        console.log(`Weft running at ${url}`);
        if (process.argv.includes("--open")) {
          launchBrowser(url);
        }
      })
      .catch(async (error) => {
        if (error.code === "EADDRINUSE") {
          const url = `http://${host}:${port}/`;
          if (process.argv.includes("--open") && (await alreadyRunning(url))) {
            console.log(`Weft is already running at ${url}`);
            launchBrowser(url);
            return;
          }
          console.error(`Port ${port} is already in use, so Weft did not start.`);
          console.error(`Fix: open ${url} if Weft is already running, or pass --port <number>.`);
          process.exitCode = 1;
          return;
        }
        console.error(`Weft could not start: ${error.message}`);
        process.exitCode = 1;
      });
  }
}
