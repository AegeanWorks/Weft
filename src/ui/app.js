import {
  createGame,
  isSolved,
  setPath,
} from "../game/engine.js";
import { LEVELS, TOTAL_CHAMBERS } from "../game/levels.js";
import { createAudio } from "./audio.js";
import {
  isUnlocked,
  loadProgress,
  nextUnsolved,
  recordSolve,
  saveProgress,
  solvedCount,
} from "./progress.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const DELTAS = Object.freeze({
  ArrowUp: [0, -1],
  ArrowRight: [1, 0],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
});

function required(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Weft is missing the #${id} element.`);
  }
  return element;
}

const refs = {
  board: required("board"),
  timer: required("timer"),
  moveCount: required("move-count"),
  status: required("status"),
  levelKicker: required("level-kicker"),
  levelName: required("level-name"),
  titleProgress: required("title-progress"),
  levelsProgress: required("levels-progress"),
  levelGrid: required("level-grid"),
  helpDialog: required("help-dialog"),
  winDialog: required("win-dialog"),
  winKicker: required("win-kicker"),
  winSummary: required("win-summary"),
  winTime: required("win-time"),
  winMoves: required("win-moves"),
  winHints: required("win-hints"),
  btnPlay: required("btn-play"),
  btnHow: required("btn-how"),
  btnBackTitle: required("btn-back-title"),
  btnLevels: required("btn-levels"),
  btnUndo: required("btn-undo"),
  btnReset: required("btn-reset"),
  btnHint: required("btn-hint"),
  btnSoundTitle: required("btn-sound-title"),
  btnSoundGame: required("btn-sound-game"),
  btnNext: required("btn-next"),
  btnReplay: required("btn-replay"),
  btnWinLevels: required("btn-win-levels"),
};

const audio = createAudio();

const state = {
  screen: "title",
  level: null,
  game: null,
  moves: 0,
  hints: 0,
  undoStack: [],
  draft: null,
  activePointer: null,
  hintColor: null,
  hintTimer: null,
  preview: null,
  won: false,
  lastErrorAt: 0,
  progress: loadProgress(),
  sound: true,
  timer: { started: false, running: false, startedAt: 0, elapsed: 0, interval: null },
};

state.sound = state.progress.settings.sound !== false;
audio.setMuted(!state.sound);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function colorVar(color) {
  return `var(--thread-${color})`;
}

function cellKey(x, y) {
  return `${x},${y}`;
}

function samePoint(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function inBounds(x, y, size) {
  return x >= 0 && y >= 0 && x < size && y < size;
}

function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function findPair(color) {
  return state.level.pairs.find((pair) => pair.color === color);
}

function findOwner(x, y) {
  for (const pair of state.level.pairs) {
    const path = state.game.paths[pair.color];
    if (path.some(([px, py]) => px === x && py === y)) {
      return pair.color;
    }
  }
  return null;
}

function currentElapsed() {
  if (!state.timer.running) {
    return state.timer.elapsed;
  }
  return state.timer.elapsed + (performance.now() - state.timer.startedAt);
}

function startTimer() {
  if (state.timer.running || state.won) {
    return;
  }
  state.timer.started = true;
  state.timer.startedAt = performance.now();
  state.timer.running = true;
  clearInterval(state.timer.interval);
  state.timer.interval = setInterval(() => {
    refs.timer.textContent = formatTime(currentElapsed());
  }, 250);
}

function stopTimer() {
  if (state.timer.running) {
    state.timer.elapsed += performance.now() - state.timer.startedAt;
    state.timer.running = false;
  }
  clearInterval(state.timer.interval);
  state.timer.interval = null;
  refs.timer.textContent = formatTime(state.timer.elapsed);
}

function resetTimer() {
  stopTimer();
  state.timer = { started: false, running: false, startedAt: 0, elapsed: 0, interval: null };
  refs.timer.textContent = "00:00";
}

function setScreen(name, { focus = true } = {}) {
  for (const section of document.querySelectorAll("section[data-screen]")) {
    section.hidden = section.dataset.screen !== name;
  }
  state.screen = name;
  document.body.dataset.screen = name;
  window.scrollTo(0, 0);
  if (!focus) {
    return;
  }
  const heading = document.querySelector(`section[data-screen="${name}"] h1`);
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
}

function renderTitleProgress() {
  const count = solvedCount(state.progress);
  const next = nextUnsolved(state.progress, LEVELS);
  if (count === 0) {
    refs.titleProgress.textContent = `${TOTAL_CHAMBERS} chambers · no account · no network`;
  } else if (next) {
    refs.titleProgress.textContent = `${count} of ${TOTAL_CHAMBERS} chambers woven · next: ${next.name}`;
  } else {
    refs.titleProgress.textContent = `All ${TOTAL_CHAMBERS} chambers woven · the tapestry is complete`;
  }
}

function syncSound() {
  for (const button of [refs.btnSoundTitle, refs.btnSoundGame]) {
    button.textContent = state.sound ? "Sound on" : "Sound off";
    button.setAttribute("aria-pressed", String(state.sound));
  }
}

function setSound(enabled) {
  state.sound = Boolean(enabled);
  state.progress = {
    ...state.progress,
    settings: { ...state.progress.settings, sound: state.sound },
  };
  saveProgress(state.progress);
  audio.setMuted(!state.sound);
  syncSound();
  if (state.sound) {
    audio.play("tick");
  }
}

function renderLevels() {
  refs.levelGrid.replaceChildren();
  const next = nextUnsolved(state.progress, LEVELS);
  LEVELS.forEach((level, index) => {
    const solved = state.progress.solved[level.id];
    const unlocked = isUnlocked(state.progress, LEVELS, level.id);
    const isNext = next?.id === level.id;
    const card = element("button", "level-card");
    card.type = "button";
    card.dataset.level = level.id;
    card.dataset.locked = String(!unlocked);
    card.dataset.solved = String(Boolean(solved));
    card.dataset.next = String(isNext);
    card.disabled = !unlocked;
    card.setAttribute("aria-current", isNext ? "true" : "false");
    card.setAttribute(
      "aria-label",
      `${level.name}, chamber ${index + 1}, ${level.size} by ${level.size}, ${level.pairs.length} threads${solved ? ", woven" : isNext ? ", next" : unlocked ? ", open" : ", locked"}`,
    );

    const top = element("span", "level-card-top");
    top.append(
      element("span", "level-number", String(index + 1).padStart(2, "0")),
      element(
        "span",
        "level-state",
        solved ? "Woven" : isNext ? "Next" : unlocked ? "Open" : "Locked",
      ),
    );

    const body = element("span", "level-card-body");
    body.append(
      element("span", "level-card-name", level.name),
      element(
        "span",
        "level-card-meta",
        `${level.size}×${level.size} · ${level.pairs.length} threads`,
      ),
      element(
        "span",
        "level-card-best",
        solved
          ? `Best ${formatTime(solved.bestMs)}`
          : unlocked
            ? "Unplayed"
            : "Finish the previous chamber",
      ),
    );

    card.append(top, body);
    card.addEventListener("click", () => openLevel(level.id));
    refs.levelGrid.append(card);
  });
  refs.levelsProgress.textContent = `${solvedCount(state.progress)} of ${TOTAL_CHAMBERS} woven`;
}

function showTitle() {
  if (state.timer.running) {
    stopTimer();
  }
  renderTitleProgress();
  setScreen("title");
}

function showLevels() {
  if (state.timer.running) {
    stopTimer();
  }
  renderLevels();
  setScreen("levels");
}

function pathData(cells) {
  return cells
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x + 0.5} ${y + 0.5}`)
    .join(" ");
}

function appendThread(svg, cells, color) {
  if (cells.length < 2) {
    return;
  }
  const d = pathData(cells);
  const glow = document.createElementNS(SVG_NS, "path");
  glow.setAttribute("class", "thread-glow");
  glow.setAttribute("d", d);
  glow.setAttribute("stroke", colorVar(color));
  glow.setAttribute("stroke-width", "0.34");

  const core = document.createElementNS(SVG_NS, "path");
  core.setAttribute("class", "thread-core");
  core.setAttribute("d", d);
  core.setAttribute("stroke", colorVar(color));
  core.setAttribute("stroke-width", "0.14");

  svg.append(glow, core);
}

function appendDraft(svg, cells, color) {
  if (cells.length < 2) {
    return;
  }
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("class", "draft-thread");
  path.setAttribute("d", pathData(cells));
  path.setAttribute("stroke", colorVar(color));
  path.setAttribute("stroke-width", "0.14");
  svg.append(path);
}

function appendHint(svg, cells) {
  if (!cells || cells.length < 2) {
    return;
  }
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("class", "hint-thread");
  path.setAttribute("d", pathData(cells));
  svg.append(path);
}

function appendSpool(svg, [x, y], color) {
  const cx = x + 0.5;
  const cy = y + 0.5;

  const glow = document.createElementNS(SVG_NS, "circle");
  glow.setAttribute("class", "spool-glow");
  glow.setAttribute("cx", String(cx));
  glow.setAttribute("cy", String(cy));
  glow.setAttribute("r", "0.3");
  glow.setAttribute("fill", colorVar(color));

  const ring = document.createElementNS(SVG_NS, "circle");
  ring.setAttribute("class", "spool-ring");
  ring.setAttribute("cx", String(cx));
  ring.setAttribute("cy", String(cy));
  ring.setAttribute("r", "0.22");
  ring.setAttribute("stroke", colorVar(color));

  const core = document.createElementNS(SVG_NS, "circle");
  core.setAttribute("class", "spool-core");
  core.setAttribute("cx", String(cx));
  core.setAttribute("cy", String(cy));
  core.setAttribute("r", "0.1");
  core.setAttribute("fill", colorVar(color));

  svg.append(glow, ring, core);
}

function renderBoard() {
  if (!state.level || !state.game) {
    return;
  }
  const level = state.level;
  const size = level.size;
  const focused = document.activeElement?.closest?.(".cell");
  const focusKey =
    focused && refs.board.contains(focused)
      ? cellKey(Number(focused.dataset.x), Number(focused.dataset.y))
      : null;

  refs.board.replaceChildren();
  refs.board.style.setProperty("--loom-size", String(size));
  refs.board.dataset.level = level.id;
  refs.board.setAttribute("aria-label", `${level.name} loom, ${size} by ${size}`);
  refs.board.classList.toggle("is-won", state.won);

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "threads");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("aria-hidden", "true");

  for (const pair of level.pairs) {
    if (state.draft && state.draft.color === pair.color) {
      continue;
    }
    appendThread(svg, state.game.paths[pair.color], pair.color);
  }
  if (state.hintColor) {
    appendHint(svg, level.solution[state.hintColor]);
  }
  if (state.draft) {
    appendDraft(svg, state.draft.cells, state.draft.color);
  }
  for (const pair of level.pairs) {
    appendSpool(svg, pair.start, pair.color);
    appendSpool(svg, pair.end, pair.color);
  }
  refs.board.append(svg);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cell = element("button", "cell");
      cell.type = "button";
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      cell.tabIndex = -1;
      const spool = level.pairs.find(
        (pair) => samePoint(pair.start, [x, y]) || samePoint(pair.end, [x, y]),
      );
      let label = `Row ${y + 1}, column ${x + 1}`;
      if (spool) {
        cell.dataset.spool = spool.color;
        cell.style.setProperty("--thread-color", colorVar(spool.color));
        label += `, ${spool.color} spool`;
      }
      const owner = findOwner(x, y);
      if (owner) {
        cell.dataset.owner = owner;
        cell.style.setProperty("--owner", colorVar(owner));
        label += `, ${owner} thread`;
      } else {
        label += ", empty";
      }
      cell.setAttribute("aria-label", label);
      refs.board.append(cell);
    }
  }

  const focusTarget = focusKey
    ? refs.board.querySelector(`.cell[data-x="${focusKey.split(",")[0]}"][data-y="${focusKey.split(",")[1]}"]`)
    : null;
  const first = focusTarget ?? refs.board.querySelector("[data-spool]") ?? refs.board.querySelector(".cell");
  if (first) {
    first.tabIndex = 0;
  }
  if (focusTarget) {
    focusTarget.focus({ preventScroll: true });
  }
}

function updateHud() {
  if (!state.level) {
    return;
  }
  const index = LEVELS.indexOf(state.level);
  refs.levelKicker.textContent = `Chamber ${String(index + 1).padStart(2, "0")} · ${state.level.size}×${state.level.size}`;
  refs.levelName.textContent = state.level.name;
  refs.moveCount.textContent = String(state.moves);
  refs.timer.textContent = formatTime(currentElapsed());
  const complete = state.level.pairs.filter(
    (pair) => state.game.paths[pair.color].length >= 2,
  ).length;
  if (!state.won) {
    refs.status.textContent =
      complete === 0
        ? "Begin at any spool."
        : `${complete} of ${state.level.pairs.length} threads woven.`;
  }
  refs.btnUndo.disabled = state.undoStack.length === 0 || state.won;
  refs.btnReset.disabled = state.won || (state.moves === 0 && complete === 0);
  refs.btnHint.disabled = state.won || state.hintColor !== null;
  const next = LEVELS[index + 1];
  refs.btnNext.hidden = !next;
  refs.btnNext.dataset.next = next?.id ?? "";
}

function pushUndo() {
  state.undoStack.push({ game: state.game, moves: state.moves });
  if (state.undoStack.length > 50) {
    state.undoStack.shift();
  }
}

function reportError(message) {
  const now = performance.now();
  if (now - state.lastErrorAt < 450) {
    return;
  }
  state.lastErrorAt = now;
  refs.status.textContent = message;
  refs.board.classList.remove("is-error");
  void refs.board.offsetWidth;
  refs.board.classList.add("is-error");
  setTimeout(() => refs.board.classList.remove("is-error"), 360);
  audio.play("error");
}

function commitDraft() {
  const draft = state.draft;
  if (!draft) {
    return;
  }
  const cells = draft.cells.map(([x, y]) => [x, y]);
  if (draft.fromEnd) {
    cells.reverse();
  }
  try {
    const next = setPath(state.game, draft.color, cells);
    pushUndo();
    state.game = next;
    state.moves += 1;
    state.draft = null;
    state.activePointer = null;
    audio.play("connect");
    renderBoard();
    updateHud();
    checkWin();
  } catch (error) {
    state.draft = null;
    state.activePointer = null;
    renderBoard();
    updateHud();
    reportError(error.message);
  }
}

function straightLine(from, to) {
  const [fx, fy] = from;
  const [tx, ty] = to;
  if (fx !== tx && fy !== ty) {
    return null;
  }
  const points = [];
  const dx = Math.sign(tx - fx);
  const dy = Math.sign(ty - fy);
  let x = fx;
  let y = fy;
  while (x !== tx || y !== ty) {
    x += dx;
    y += dy;
    points.push([x, y]);
  }
  return points;
}

function extendDraft(x, y) {
  const draft = state.draft;
  if (!draft || !inBounds(x, y, state.level.size)) {
    return;
  }
  const cells = draft.cells;
  const last = cells[cells.length - 1];
  if (x === last[0] && y === last[1]) {
    return;
  }
  const existing = cells.findIndex(([cx, cy]) => cx === x && cy === y);
  if (existing >= 0) {
    cells.length = existing + 1;
    renderBoard();
    return;
  }
  if (draft.blocked.has(cellKey(x, y))) {
    reportError("That cell belongs to another thread.");
    return;
  }
  const line = straightLine(last, [x, y]);
  if (!line) {
    return;
  }
  const target = draft.fromEnd ? draft.pair.start : draft.pair.end;
  for (const [nx, ny] of line) {
    if (draft.blocked.has(cellKey(nx, ny))) {
      reportError("That cell belongs to another thread.");
      return;
    }
    const loop = cells.findIndex(([cx, cy]) => cx === nx && cy === ny);
    if (loop >= 0) {
      cells.length = loop + 1;
      renderBoard();
      return;
    }
    cells.push([nx, ny]);
    if (samePoint([nx, ny], target)) {
      commitDraft();
      return;
    }
  }
  renderBoard();
}

function beginDraft(cell) {
  if (state.won) {
    return false;
  }
  const x = Number(cell.dataset.x);
  const y = Number(cell.dataset.y);
  const spoolColor = cell.dataset.spool;
  let color = spoolColor;
  let cells;
  let fromEnd = false;
  if (spoolColor) {
    const pair = findPair(spoolColor);
    fromEnd = samePoint([x, y], pair.end);
    cells = [[x, y]];
  } else {
    color = findOwner(x, y);
    if (!color) {
      return false;
    }
    const path = state.game.paths[color];
    const index = path.findIndex(([px, py]) => px === x && py === y);
    if (index < 0) {
      return false;
    }
    cells = path.slice(0, index + 1).map(([px, py]) => [px, py]);
  }

  const pair = findPair(color);
  const blocked = new Set();
  for (const candidate of state.level.pairs) {
    if (candidate.color === color) {
      continue;
    }
    for (const [bx, by] of state.game.paths[candidate.color]) {
      blocked.add(cellKey(bx, by));
    }
    blocked.add(cellKey(candidate.start[0], candidate.start[1]));
    blocked.add(cellKey(candidate.end[0], candidate.end[1]));
  }

  state.draft = { color, cells, fromEnd, pair, blocked };
  audio.unlock();
  audio.play("tick");
  startTimer();
  renderBoard();
  updateHud();
  refs.status.textContent = `Drawing ${color}.`;
  return true;
}

function cancelDraft() {
  if (!state.draft) {
    return;
  }
  state.draft = null;
  state.activePointer = null;
  renderBoard();
  updateHud();
}

function undo() {
  if (state.won) {
    return;
  }
  const previous = state.undoStack.pop();
  if (!previous) {
    return;
  }
  state.game = previous.game;
  state.moves = previous.moves;
  state.draft = null;
  state.activePointer = null;
  audio.play("tick");
  renderBoard();
  updateHud();
}

function resetLevel() {
  if (state.won || !state.level) {
    return;
  }
  const complete = state.level.pairs.filter(
    (pair) => state.game.paths[pair.color].length >= 2,
  ).length;
  if (state.moves === 0 && complete === 0) {
    return;
  }
  pushUndo();
  state.game = createGame(state.level);
  state.moves = 0;
  state.draft = null;
  state.activePointer = null;
  resetTimer();
  audio.play("tick");
  renderBoard();
  updateHud();
}

function showHint() {
  if (state.won || state.hintColor) {
    return;
  }
  const current = state.game;
  const candidate = state.level.pairs.find((pair) => {
    const path = current.paths[pair.color];
    const solution = state.level.solution[pair.color];
    return (
      path.length !== solution.length ||
      path.some((cell, index) => !samePoint(cell, solution[index]))
    );
  });
  if (!candidate) {
    refs.status.textContent = "Every thread already matches the stored weave.";
    return;
  }
  startTimer();
  state.hintColor = candidate.color;
  state.hints += 1;
  audio.play("tick");
  renderBoard();
  updateHud();
  refs.status.textContent = `A ghost thread shows one route for ${candidate.color}.`;
  clearTimeout(state.hintTimer);
  state.hintTimer = setTimeout(() => {
    state.hintColor = null;
    state.hintTimer = null;
    renderBoard();
    updateHud();
  }, 4200);
}

function showWinDialog(elapsed) {
  const index = LEVELS.indexOf(state.level);
  const next = LEVELS[index + 1];
  refs.winKicker.textContent = `Chamber ${String(index + 1).padStart(2, "0")} woven`;
  refs.winSummary.textContent =
    state.hints === 0
      ? "A clean weave. Every cell is covered."
      : "The tapestry holds, with a little help from the hint.";
  refs.winTime.textContent = formatTime(elapsed);
  refs.winMoves.textContent = String(state.moves);
  refs.winHints.textContent = String(state.hints);
  refs.btnNext.hidden = !next;
  refs.btnNext.dataset.next = next?.id ?? "";
  if (!refs.winDialog.open) {
    refs.winDialog.showModal();
  }
}

function checkWin() {
  if (!isSolved(state.game)) {
    return;
  }
  state.won = true;
  stopTimer();
  const elapsed = state.timer.elapsed;
  if (!state.preview) {
    state.progress = recordSolve(state.progress, state.level.id, {
      bestMs: elapsed,
      hints: state.hints,
      moves: state.moves,
      at: new Date().toISOString(),
    });
    saveProgress(state.progress);
    renderTitleProgress();
  }
  refs.board.classList.add("is-won");
  updateHud();
  refs.status.textContent = "Chamber woven.";
  audio.play("win");
  showWinDialog(elapsed);
}

function applySolution() {
  for (const pair of state.level.pairs) {
    state.game = setPath(state.game, pair.color, state.level.solution[pair.color]);
  }
  state.moves = state.level.pairs.length;
  renderBoard();
  updateHud();
}

function openLevel(id, { preview = null } = {}) {
  const level = LEVELS.find((candidate) => candidate.id === id);
  if (!level) {
    showLevels();
    return;
  }
  clearTimeout(state.hintTimer);
  state.level = level;
  state.game = createGame(level);
  state.moves = 0;
  state.hints = 0;
  state.undoStack = [];
  state.draft = null;
  state.activePointer = null;
  state.hintColor = null;
  state.hintTimer = null;
  state.preview = preview;
  state.won = false;
  resetTimer();
  renderBoard();
  updateHud();
  setScreen("game");
  if (preview === "solved" || preview === "win") {
    applySolution();
    state.won = true;
    refs.board.classList.add("is-won");
    updateHud();
    if (preview === "win") {
      showWinDialog(0);
    }
  } else if (preview === "hint") {
    showHint();
  } else if (preview === "help") {
    openHelp();
  }
}

function openHelp() {
  if (!refs.helpDialog.open) {
    refs.helpDialog.showModal();
  }
}

function focusCell(x, y) {
  const cell = refs.board.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
  if (!cell) {
    return;
  }
  for (const other of refs.board.querySelectorAll(".cell")) {
    other.tabIndex = -1;
  }
  cell.tabIndex = 0;
  cell.focus({ preventScroll: true });
}

function bindEvents() {
  refs.btnPlay.addEventListener("click", showLevels);
  refs.btnHow.addEventListener("click", openHelp);
  refs.btnBackTitle.addEventListener("click", showTitle);
  refs.btnLevels.addEventListener("click", showLevels);
  refs.btnUndo.addEventListener("click", undo);
  refs.btnReset.addEventListener("click", resetLevel);
  refs.btnHint.addEventListener("click", showHint);
  refs.btnSoundTitle.addEventListener("click", () => setSound(!state.sound));
  refs.btnSoundGame.addEventListener("click", () => setSound(!state.sound));
  refs.btnNext.addEventListener("click", () => {
    const next = refs.btnNext.dataset.next;
    refs.winDialog.close();
    if (next) {
      openLevel(next);
    } else {
      showLevels();
    }
  });
  refs.btnReplay.addEventListener("click", () => {
    refs.winDialog.close();
    openLevel(state.level.id);
  });
  refs.btnWinLevels.addEventListener("click", () => {
    refs.winDialog.close();
    showLevels();
  });

  refs.board.addEventListener("pointerdown", (event) => {
    if (state.activePointer !== null) {
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    const cell = event.target.closest?.(".cell");
    if (!cell) {
      return;
    }
    event.preventDefault();
    audio.unlock();
    if (!beginDraft(cell)) {
      return;
    }
    state.activePointer = event.pointerId;
    try {
      refs.board.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is an optimisation; drawing still works without it.
    }
  });

  refs.board.addEventListener("pointermove", (event) => {
    if (state.activePointer !== event.pointerId || !state.draft) {
      return;
    }
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const cell = target?.closest?.(".cell");
    if (!cell || !refs.board.contains(cell)) {
      return;
    }
    extendDraft(Number(cell.dataset.x), Number(cell.dataset.y));
  });

  const endPointer = (event) => {
    if (state.activePointer === event.pointerId) {
      try {
        refs.board.releasePointerCapture(event.pointerId);
      } catch {
        // The capture may already be gone.
      }
      state.activePointer = null;
    }
    if (state.draft) {
      state.draft = null;
      renderBoard();
      updateHud();
    }
  };
  refs.board.addEventListener("pointerup", endPointer);
  refs.board.addEventListener("pointercancel", endPointer);

  refs.board.addEventListener("keydown", (event) => {
    const cell = event.target.closest?.(".cell");
    if (!cell) {
      return;
    }
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    if (event.key === "Escape") {
      if (state.draft) {
        event.preventDefault();
        cancelDraft();
      }
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!state.draft) {
        beginDraft(cell);
      }
      return;
    }
    const delta = DELTAS[event.key];
    if (!delta) {
      return;
    }
    event.preventDefault();
    const [dx, dy] = delta;
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny, state.level.size)) {
      return;
    }
    if (state.draft) {
      extendDraft(nx, ny);
    }
    if (!state.won) {
      focusCell(nx, ny);
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.draft) {
      event.preventDefault();
      cancelDraft();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (state.timer.running) {
        stopTimer();
      }
    } else if (state.screen === "game" && state.timer.started && !state.won) {
      startTimer();
    }
  });

  refs.winDialog.addEventListener("close", () => {
    if (state.screen === "game" && state.won) {
      const first = refs.board.querySelector("[data-spool]");
      first?.focus({ preventScroll: true });
    }
  });
}

function boot() {
  bindEvents();
  syncSound();
  const params = new URLSearchParams(window.location.search);
  const preview = params.get("preview");
  const levelId = params.get("level");
  if (levelId) {
    openLevel(levelId, { preview });
    return;
  }
  if (params.get("screen") === "levels") {
    showLevels();
  } else {
    showTitle();
  }
  if (preview === "help") {
    openHelp();
  }
}

boot();
