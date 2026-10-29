import test from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";

import {
  browserCommand,
  looksLikeWeft,
  safePath,
  startServer,
} from "../scripts/serve.mjs";

function rawGet(url, path) {
  return new Promise((resolveResponse, rejectResponse) => {
    const req = request(url, { path }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        resolveResponse({ status: response.statusCode, body });
      });
    });
    req.on("error", rejectResponse);
    req.end();
  });
}

test("safePath maps the root to index.html and keeps nested assets", () => {
  assert.match(safePath("/"), /index\.html$/);
  assert.match(safePath("/src/ui/app.js"), /src[/\\]ui[/\\]app\.js$/);
  assert.match(safePath("/src/theme.css"), /src[/\\]theme\.css$/);
});

test("safePath refuses parent-directory traversal", () => {
  assert.equal(safePath("/../package.json"), null);
  assert.equal(safePath("/%2e%2e/package.json"), null);
  assert.equal(safePath("/..%5cpackage.json"), null);
  assert.equal(safePath("/%00index.html"), null);
});

test("safePath refuses a malformed percent escape", () => {
  assert.equal(safePath("/%E0%A4%A"), null);
});

test("looksLikeWeft checks the page title", () => {
  assert.equal(looksLikeWeft("<!doctype html><title>Weft — an Aegean thread puzzle</title>"), true);
  assert.equal(looksLikeWeft("<title>Something else</title>"), false);
  assert.equal(looksLikeWeft(null), false);
});

test("browserCommand picks a launcher per platform", () => {
  assert.equal(browserCommand("win32", "http://127.0.0.1/").command, "cmd");
  assert.equal(browserCommand("darwin", "http://127.0.0.1/").command, "open");
  assert.equal(browserCommand("linux", "http://127.0.0.1/").command, "xdg-open");
});

test("the server serves the game, assets and a 404 with safe headers", async (t) => {
  const { server, url } = await startServer({ port: 0 });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const home = await fetch(url);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /<title>Weft/);
  assert.equal(home.headers.get("x-content-type-options"), "nosniff");
  assert.equal(home.headers.get("referrer-policy"), "no-referrer");

  const script = await fetch(new URL("./src/ui/app.js", url));
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type"), /text\/javascript/);

  const missing = await fetch(new URL("./src/missing.txt", url));
  assert.equal(missing.status, 404);

  const privateFile = await fetch(new URL("./package.json", url));
  assert.equal(privateFile.status, 403);

  const traversal = await rawGet(url, "/%2e%2e/%2e%2e/AGENTS.md");
  assert.equal(traversal.status, 403);
  assert.doesNotMatch(traversal.body, /Agent Instructions/);
});
