# Weft improvement cycles

Append-only record. One entry per cycle: area, finding, fix, before/after proof,
played run, gate results and the exact commands. Areas rotate so a cycle does not
repeat one that is already covered.

## Cycle 1 — Progression/UX: recover a dismissed victory result

- **Area**: progression and victory flow (first cycle in this series).
- **Baseline**: commit `58ae9a5`; `npm test` 89/89 pass; `python aikit.py check weft`
  5/5 gates pass; the existing dogfood pass (single solve) green.
- **Finding**: after a chamber is won, Escape closes the native victory dialog and
  leaves the board frozen. `beginDraft` refuses every cell, Undo/Reset/Hint are
  disabled, and Next/Replay are gone with the dialog; only the Chambers button
  remains. Reproduced with a real headless-Edge solve of First Thread: after
  Escape, `winOpen=false`, status `Chamber woven.`, and a click on a spool left
  `winOpen=false`. The pre-fix dogfood assertion failed with
  `[FAIL] Weft dogfood: A dismissed victory left no recovery path: open=false, status=Chamber woven..`
- **Dead ends (one line each)**: a hint-then-Reset hypothesis was rejected because
  Reset is disabled while the board is pristine; hints surviving a reset after a
  drawn thread is the intended star penalty, not a defect.
- **Fix**: `fix(ui): reopen the victory result from a won loom` (`b69af90`).
  When `state.won` and the dialog is closed, a pointer tap or Enter/Space on the
  loom calls the existing `showWinDialog` and restores the status; the dialog
  close handler writes `Chamber woven. Click the loom to reopen the result.` and
  keeps focus on the first spool. No new control, no HTML/CSS, no save change.
- **Visual proof**: same build/state/viewport (1440x900, fresh profile, First
  Thread solved with the three stored routes, Escape then click the top-left
  spool):
  - before (`58ae9a5`): `assets/screenshots/2026-11-07-victory-reopen-before.png`
    — frozen solved board, no dialog, only disabled controls.
  - after (`b69af90`): `assets/screenshots/2026-11-07-victory-reopen-after.png`
    — the victory dialog is back with Next chamber, Replay and Chambers.
- **Played run**: `npm run dogfood` solves First Thread with three real drags,
  checks the 3-star dialog and saved record, presses Escape, observes the recovery
  hint, clicks the first spool, verifies the dialog reopened, presses Next and
  verifies Chamber 02 (`Level 2`) loaded, then continues through the chamber
  index, the 12x12 finale and a full daily solve. Frame health: 0 page errors and
  0 console errors over the whole run; the pass now fails if either appears.
- **Gates after the fix**: `npm test` 89/89 pass; `npm run dogfood` OK with
  `0 page errors`; `python aikit.py check weft` 5/5 (test, mechanics, hygiene,
  guidelines, secrets); `python aikit.py ui verify weft` OK before closing the
  bounded surface task.
- **Commands run and results**:
  - `npm test` -> 89 tests, 89 pass, 0 fail.
  - `npm run dogfood` -> pre-fix FAIL (dismissed victory), post-fix
    `[OK] Weft dogfood: title, 24 chambers, a 3-thread solve, the victory dialog,
    the 12x12 finale and the daily weave; 0 page errors.`
  - `python aikit.py check weft` -> 5/5 gates passed.
  - Before capture: worktree at `58ae9a5`, `node scripts/serve.mjs --port 4187`,
    `node scratch/weft-play.mjs escape-real` with `WEFT_ROOT=http://127.0.0.1:4187`.
  - After capture: current build on `http://127.0.0.1:4175`, same harness with
    `WEFT_ROOT=http://127.0.0.1:4175`.

## Cycle 2 — Thread-routing mechanics: Reset cannot roll the clock back

- **Area**: core interaction/time integrity (Reset and Undo), distinct from the
  victory flow covered in cycle 1.
- **Baseline**: commit `7ca3abb`; `npm test` 89/89 pass; `python aikit.py check weft`
  5/5 gates pass; dogfood green before the new assertion.
- **Finding**: Reset zeroed the timer but kept the pre-reset game on the undo
  stack. A played First Thread run drew two threads (timer `00:03`, wall 3.7s),
  pressed Reset, then Undo: both threads returned while the clock read `00:00`.
  Finishing the last thread won at `00:01` and saved `bestMs: 1662` for an 8.8s
  attempt. Reset also left an active hint ghost on the cleared loom. The new
  dogfood assertion failed before the fix with
  `[FAIL] Weft dogfood: Reset did not start a clean attempt: moves=0, threads=0,
  undoDisabled=false, timer=00:00, hintThreads=1.`
- **Fix**: `fix(game): make reset start a clean timed attempt` (`034da64`).
  `resetLevel` now clears the undo stack, cancels the hint ghost and its timer,
  rebuilds the empty game and resets the clock; hints used before the reset still
  count toward stars. No engine, save-format or layout change.
- **Visual proof**: same build/state/viewport (1440x900, fresh profile, First
  Thread, hint shown, two threads drawn, Reset then Undo):
  - before (`7ca3abb`): `assets/screenshots/2026-11-07-reset-undo-before.png`
    — Undo restores the two-thread board while the timer reads `00:00`.
  - after (`034da64`): `assets/screenshots/2026-11-07-reset-undo-after.png`
    — the loom stays empty, the ghost is gone and Undo is disabled.
- **Played run**: `npm run dogfood` now plays Chamber 02, shows its hint ghost,
  draws two threads, presses Reset and asserts `moves=0`, `threads=0`,
  `undoDisabled=true`, `timer=00:00`, `hintThreads=0`; it then continues through
  the chamber index, the 12x12 finale and the daily. Frame health: 0 page errors,
  0 console errors. The full exploit run was also replayed after the fix: Reset
  left `00:00`, Undo was a no-op, solving from scratch won at `00:02` with
  `bestMs: 2887` — the post-reset attempt only.
- **Gates after the fix**: `npm test` 89/89 pass; `npm run dogfood` OK with
  `0 page errors`; `python aikit.py check weft` 5/5 (test, mechanics, hygiene,
  guidelines, secrets); `python aikit.py ui verify weft` OK before closing the
  bounded surface task.
- **Commands run and results**:
  - `npm test` -> 89 tests, 89 pass, 0 fail.
  - `npm run dogfood` -> pre-fix FAIL (Reset kept Undo and the ghost), post-fix
    `[OK] Weft dogfood: title, 24 chambers, a 3-thread solve, the victory dialog,
    the 12x12 finale and the daily weave; 0 page errors.`
  - `python aikit.py check weft` -> 5/5 gates passed.
  - Before capture: worktree at `7ca3abb`, `node scripts/serve.mjs --port 4188`,
    `node scratch/weft-play.mjs reset-hint-state` with
    `WEFT_ROOT=http://127.0.0.1:4188`; exploit run with
    `node scratch/weft-play.mjs reset-undo-time`.
  - After capture: current build on `http://127.0.0.1:4175`, same
    `reset-hint-state` run plus `reset-clean-time`.

## Cycle 3 — UI readability: How to play opens at its heading on mobile

- **Area**: UI readability at short viewports (help dialog), distinct from the
  victory flow and Reset integrity covered earlier.
- **Baseline**: commit `45d324f`; `npm test` 89/89 pass; `python aikit.py check weft`
  5/5 gates pass; dogfood green.
- **Finding**: at 390x844 the help dialog has 876px of content in a 718px frame.
  Native `showModal` auto-focuses the only focusable child, the footer Ready
  button, so opening `?preview=help` left `scrollTop=158`, the heading at
  `-45.7px` and `activeElement` on the Ready button; the title and first rule
  were hidden. At 1440x900 it still scrolled 21px and focused Ready. The pre-fix
  dogfood help check failed with
  `[FAIL] Weft dogfood: How to play did not open at its heading: open=true,
  scrollTop=21, active=.`
- **Dead ends (one line each)**: the 12x12 mobile cell size was already recorded
  as a 44px constraint in ADR-014 and is not reopened; all seven captured states
  had `scrollWidth === clientWidth`, so no horizontal-overflow fix was warranted.
- **Fix**: `fix(ui): open help at its heading on short viewports` (`8da1bd1`).
  The help heading is focusable via `tabindex="-1"`; `openHelp` focuses it after
  `showModal` and resets `scrollTop` to 0. No layout, save or game-rule change.
- **Visual proof**: same URL/state/viewport (390x844, fresh profile,
  `?preview=help`):
  - before (`45d324f`): `assets/screenshots/2026-11-07-help-mobile-before.png`
    — opens mid-rule 1, no title.
  - after (`8da1bd1`): `assets/screenshots/2026-11-07-help-mobile-after.png`
    — opens at “How to weave / One loom, twenty-four chambers” with rules 1-4.
- **Played run**: `npm run dogfood` opens How to play with a real mouse click at
  1440x900, asserts `scrollTop=0` and `activeElement=help-title`, presses Escape,
  and verifies focus returns to `btn-how`; it then completes the chamber index,
  a 3-thread solve, the victory recovery, the Reset check, the 12x12 finale and
  the daily with 0 page errors. A 390x844 real-click replay
  (`node scratch/weft-play.mjs help-click`) returns `open=true, scrollTop=0,
  active=help-title`.
- **Gates after the fix**: `npm test` 89/89 pass; `npm run dogfood` OK with
  `0 page errors`; `python aikit.py check weft` 5/5 (test, mechanics, hygiene,
  guidelines, secrets); `python aikit.py ui verify weft` OK before closing the
  bounded surface task.
- **Commands run and results**:
  - `npm test` -> 89 tests, 89 pass, 0 fail.
  - `npm run dogfood` -> pre-fix FAIL (help heading hidden), post-fix
    `[OK] Weft dogfood: title, 24 chambers, a 3-thread solve, the victory dialog,
    the 12x12 finale and the daily weave; 0 page errors.`
  - `python aikit.py check weft` -> 5/5 gates passed.
  - Before capture: current build `45d324f` on `http://127.0.0.1:4175`,
    `WEFT_WIDTH=390 WEFT_HEIGHT=844 node scratch/weft-play.mjs help-state`.
  - After capture: same viewport and scenario on the fixed tree, plus a real
    `help-click` replay at 390x844.
- **Gate repair (same cycle, required to finish the gate)**: the UI fast proof
  failed twice on the pre-existing `previously slow dates stay interactive`
  wall-clock assertion while the workstation was at 100% CPU; 2024-02-28 took
  12.4s. Replaced the two wall-clock assertions with deterministic search-work
  bounds (ADR-026), commit `test(generate): pin bounded daily search work
  instead of wall time` (`5abb160`). `npm test` then passed 89/89 and
  `python aikit.py check weft` returned 5/5 under the same load. One dogfood
  help click also missed when the real window stayed 800x600 under a 1440x900
  emulation; `test(dogfood): match the browser window to the emulated viewport`
  (`1c2a8c5`) pinned both, and three consecutive dogfood runs passed.
