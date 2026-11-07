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

## Cycle 4 — Progression and saves: unknown ids cannot fake a finished campaign

- **Area**: save-integrity truthfulness in the campaign totals (the victory flow
  and Reset integrity were cycles 1 and 2; this is the read-side data path).
- **Baseline**: commit `594effb`; `npm test` 89/89 pass; `python aikit.py check weft`
  5/5 gates pass; dogfood green.
- **Finding**: a save with 24 unknown solved ids (`ghost-01`..`ghost-24`, three
  stars each) produced `24 of 24 woven · 72/72 stars · next: First Thread` on the
  title while the chamber index showed `24 of 24 woven · 72/72 stars`, only one
  unlocked chamber and zero real stars. The same save would come from renamed or
  future level ids, not only from a deliberate edit. The new dogfood check failed
  with `[FAIL] Weft dogfood: Unknown chamber ids inflated the title: saved=24,
  title=24 of 24 woven · 72/72 stars · next: First Thread.`
- **Dead end (one line)**: dropping unknown entries inside `normalizeProgress`
  was rejected because it would erase a renamed or future chamber's record; the
  read-side filter keeps the save intact and only stops it from lying.
- **Fix**: `fix(progress): ignore unknown chamber ids in campaign totals`
  (`33c76b6`). `solvedCount` and `totalStars` accept an optional `levels` list
  and count only ids present in it; `app.js` passes `LEVELS` at both call sites.
  No save format, engine rule or layout change.
- **Visual proof**: same build/save/viewport (1440x900, fresh profile, injected
  24-ghost save):
  - before (`594effb`): `assets/screenshots/2026-11-07-poisoned-save-before.png`
    — title claims `24 of 24 woven · 72/72 stars · next: First Thread`.
  - after (`33c76b6`): `assets/screenshots/2026-11-07-poisoned-save-after.png`
    — same save shows `24 chambers · 3 stars each · no account · no network`.
- **Played run**: `npm run dogfood` injects the 24 ghost ids, reloads the title
  and asserts the fresh line, reloads the index and asserts `0 of 24 woven` with
  one unlocked chamber, removes the poison, then completes the help, chamber
  index, 3-thread solve, victory recovery, Reset check, 12x12 finale and daily
  flow with 0 page errors. A scratch replay reports `saved=24` in both runs, so
  the before/after difference is the display, not the injected data.
- **Gates after the fix**: `npm test` 90/90 pass; `npm run dogfood` OK with
  `0 page errors`; `python aikit.py check weft` 5/5 (test, mechanics, hygiene,
  guidelines, secrets); `python aikit.py ui verify weft` OK before closing the
  bounded surface task.
- **Commands run and results**:
  - `npm test` -> 90 tests, 90 pass, 0 fail.
  - `npm run dogfood` -> pre-fix FAIL (ghost ids inflated title), post-fix
    `[OK] Weft dogfood: title, 24 chambers, a 3-thread solve, the victory dialog,
    the 12x12 finale and the daily weave; 0 page errors.`
  - `python aikit.py check weft` -> 5/5 gates passed.
  - Before/after capture: `node scratch/weft-play.mjs poisoned-save` at
    1440x900 against the pre-fix and fixed trees on `http://127.0.0.1:4175`.

## Cycle 5 — Graphics and effects: chamber cards preview their looms

- **Area**: graphics/effects on the chamber index, distinct from the mobile
  dialog readability of cycle 3 and the count-integrity work of cycle 4.
- **Baseline**: commit `1b6d36d`; `npm test` 90/90 pass; `python aikit.py check weft`
  5/5 gates pass; dogfood green.
- **Finding**: every card carried the same decorative circle, so the 5x5 opener
  and the 12x12 finale looked alike apart from text. There was no way to see a
  chamber's spool distribution or density before opening it. The new dogfood
  check failed with `[FAIL] Weft dogfood: The chamber previews are incomplete:
  minis=0, firstSpools=0, lastSpools=0.`
- **Fix**: `feat(ui): preview each chamber's spool layout on its card`
  (`a44b721`). A generated `.level-mini` SVG draws the frame, grid and one
  coloured dot per spool from the existing pair data; it sits behind the card
  text as a watermark and replaces the generic circle. No solution lines, so no
  route spoiler. No asset, save, engine or click-target change.
- **Visual proof**: same viewport/state (1440x900, fresh profile,
  `?screen=levels`):
  - before (`1b6d36d`): `assets/screenshots/2026-11-07-level-previews-before.png`
    — all cards show the same faint circle.
  - after (`a44b721`): `assets/screenshots/2026-11-07-level-previews-after.png`
    — each card shows its own grid and spool dots; the 12x12 cards read denser
    than the 5x5 opener. A 390x844 render was also checked and fits without
    horizontal overflow.
- **Played run**: `npm run dogfood` now verifies 24 previews, six spool dots on
  First Thread, eighteen on The Eternal Weave, then opens First Thread by
  clicking its card and completes the whole help, solve, victory recovery,
  Reset, 12x12 and daily flow with 0 page errors.
- **Gates after the fix**: `npm test` 90/90 pass; `npm run dogfood` OK with
  `0 page errors`; `python aikit.py check weft` 5/5 (test, mechanics, hygiene,
  guidelines, secrets); `python aikit.py ui verify weft` OK before closing the
  bounded surface task.
- **Commands run and results**:
  - `npm test` -> 90 tests, 90 pass, 0 fail.
  - `npm run dogfood` -> pre-fix FAIL (no previews), post-fix
    `[OK] Weft dogfood: title, 24 chambers, a 3-thread solve, the victory dialog,
    the 12x12 finale and the daily weave; 0 page errors.`
  - `python aikit.py check weft` -> 5/5 gates passed.
  - Before capture: worktree at `1b6d36d`, `node scripts/serve.mjs --port 4189`,
    `node scratch/weft-play.mjs levels` with `WEFT_ROOT=http://127.0.0.1:4189`.
  - After capture: current build on `http://127.0.0.1:4175`, same scenario at
    1440x900 and 390x844.

## Cycle 6 — Audio cues: hint, undo and reset stop sharing one tick

- **Area**: audio feedback, the first non-visual cycle; the graphical surface is
  unchanged from cycle 5.
- **Baseline**: commit `fffe6b6`; `npm test` 90/90 pass; `python aikit.py check weft`
  5/5 gates pass; dogfood green.
- **Finding**: `beginDraft`, `undo`, `resetLevel` and `showHint` all played the
  660Hz 35ms `tick`. A browser probe that recorded `createOscillator` calls on
  the real UI returned `hint: [660]`, then undo `[660]`, then reset `[660]`; the
  actions were audibly identical.
- **Fix**: `feat(audio): give hint, undo and reset distinct cues` (`7385430`).
  Hint is a rising triangle pair (880/1174.66), undo a falling sine pair
  (392/293.66), reset one low sine (196). Begin/toggle keep the tick; connect,
  error and win are unchanged. No file, setting or volume change.
- **Visual proof**: not applicable — this cycle changes audio only. The UI is
  pixel-identical to the cycle-5 captures; the evidence is the before/after audio
  graph and the unit frequency pins.
- **Played run**: a real browser probe (`node scratch/weft-play.mjs audio-cues`)
  clicked Hint, drew a thread, clicked Undo, drew two threads and clicked Reset:
  - before: hint `[660]`, undo appended `[660]`, reset appended `[660]`.
  - after: hint `[880, 1174.66]`, undo `[392, 293.66]`, reset `[196]`, with
    begin `[660]` and connect `[523.25, 783.99]` unchanged.
  `npm run dogfood` injects a recording `AudioContext` before the first draw and
  asserts the hint, undo and reset sequences inside the full played run; it also
  keeps the 0-page-error check.
- **Gates after the fix**: `npm test` 94/94 pass; `npm run dogfood` OK with
  `0 page errors`; `python aikit.py check weft` 5/5 (test, mechanics, hygiene,
  guidelines, secrets); `python aikit.py ui verify weft` OK before closing the
  bounded surface task.
- **Commands run and results**:
  - `npm test` -> 94 tests, 94 pass, 0 fail.
  - `npm run dogfood` -> `[OK] Weft dogfood: title, 24 chambers, a 3-thread
    solve, the victory dialog, the 12x12 finale and the daily weave; 0 page
    errors.`
  - `python aikit.py check weft` -> 5/5 gates passed.
  - Before/after audio graph: `node scratch/weft-play.mjs audio-cues` against the
    pre-fix tree and the fixed tree on `http://127.0.0.1:4175`.

## Cycle 7 — Accessibility: the skip link becomes the first keyboard stop

- **Area**: keyboard accessibility and focus order, distinct from the visual
  readability of cycle 3 and the audio cues of cycle 6.
- **Baseline**: commit `a2a41c5`; `npm test` 94/94 pass; `python aikit.py check weft`
  5/5 gates pass; dogfood green.
- **Finding**: the skip link is first in the document, but boot focused the title
  `h1`, so the first Tab landed on Play (`btn btn-primary`), Enter did nothing
  (`hash=""`), and the next Tab reached Daily weave. `<main id="main">` had no
  `tabindex`, so even activating the link could not move focus into the content.
  The new dogfood keyboard check would fail on the first assertion.
- **Fix**: `fix(a11y): make the skip link the first keyboard stop` (`ce47f12`).
  `<main>` gets `tabindex="-1"`, and `setScreen` skips heading focus on the
  initial screen load only; later SPA screen changes still focus their heading.
  No layout, copy, game or save change.
- **Visual proof**: same viewport/state (1440x900, fresh profile, title, one Tab):
  - before (`a2a41c5`): `assets/screenshots/2026-11-07-skip-link-before.png`
    — Play carries the focus ring and no skip link is visible.
  - after (`ce47f12`): `assets/screenshots/2026-11-07-skip-link-after.png`
    — “Skip to content” is revealed at the top-left and Play is unfocused.
- **Played run**: a keyboard probe (`node scratch/weft-play.mjs skip-link`) now
  reports Tab -> `skip-link` (“Skip to content”), Enter -> `main` with hash
  `#main`, next Tab -> Play. `npm run dogfood` performs the same Tab/Enter/Tab
  sequence before clicking How to play and completing the full run with 0 page
  errors.
- **Gates after the fix**: `npm test` 94/94 pass; `npm run dogfood` OK with
  `0 page errors`; `python aikit.py check weft` 5/5 (test, mechanics, hygiene,
  guidelines, secrets); `python aikit.py ui verify weft` OK before closing the
  bounded surface task.
- **Commands run and results**:
  - `npm test` -> 94 tests, 94 pass, 0 fail.
  - `npm run dogfood` -> `[OK] Weft dogfood: title, 24 chambers, a 3-thread
    solve, the victory dialog, the 12x12 finale and the daily weave; 0 page
    errors.`
  - `python aikit.py check weft` -> 5/5 gates passed.
  - Before/after keyboard state: `node scratch/weft-play.mjs skip-link` against
    the pre-fix and fixed trees on `http://127.0.0.1:4175`.

## Cycle 8 — Progression and saves: a daily link cannot back-fill history

- **Area**: daily save integrity and history truthfulness, distinct from the
  campaign-total filter of cycle 4.
- **Baseline**: commit `9d08d08`; `npm test` 94/94 pass; `python aikit.py check weft`
  5/5 gates pass; dogfood green.
- **Finding**: a played `/?daily=2026-11-06` run loaded `Daily weave · 6 Kas
  2026`, solved it, saved `days["2026-11-06"]`, and the index showed 6 Kas solved
  with a 1-day streak while 7 Kas was missed. ADR-011 and the README say a missed
  daily cannot be back-filled, so a stored or shared past link could rewrite the
  record.
- **Fix**: `fix(daily): clamp every daily open to the local day` (`8795c41`).
  The pure `currentDailyKey` helper returns the requested date only when it is
  today; `openDaily` uses it, so past/future/malformed daily links open today.
  `createDailyLevel` still accepts any key for tests and generation. No save
  schema change.
- **Visual proof**: same URL/state/viewport (1440x900, fresh profile,
  `?daily=2026-11-06`):
  - before (`9d08d08`): `assets/screenshots/2026-11-07-daily-backfill-before.png`
    — kicker `Daily weave · 6 KAS 2026` and the 6 Kas board.
  - after (`8795c41`): `assets/screenshots/2026-11-07-daily-backfill-after.png`
    — the same URL shows `Daily weave · 7 KAS 2026` and today's board.
- **Played run**: a real solve of the past-link run saved only `2026-11-06` and
  the history showed 6 Kas solved / 7 Kas missed; the same scenario after the fix
  loaded today, saved only `2026-11-07`, and the history showed 6 Kas missed /
  7 Kas solved. `npm run dogfood` opens yesterday's link, requires today's board
  and no daily save, then solves today's daily and checks the seven-day history
  with 0 page errors.
- **Gates after the fix**: `npm test` 95/95 pass; `npm run dogfood` OK with
  `0 page errors`; `python aikit.py check weft` 5/5 (test, mechanics, hygiene,
  guidelines, secrets); `python aikit.py ui verify weft` OK before closing the
  bounded surface task.
- **Commands run and results**:
  - `npm test` -> 95 tests, 95 pass, 0 fail.
  - `npm run dogfood` -> `[OK] Weft dogfood: title, 24 chambers, a 3-thread
    solve, the victory dialog, the 12x12 finale and the daily weave; 0 page
    errors.`
  - `python aikit.py check weft` -> 5/5 gates passed.
  - Before/after daily: `node scratch/weft-play.mjs daily-backfill` against the
    pre-fix and fixed trees on `http://127.0.0.1:4175`.
