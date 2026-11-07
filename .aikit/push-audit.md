# Push audit runs

Append-only log for the push-by-push verification protocol. The twelve delivered
improvement cycles are the push units. Forward runs audit the cumulative windows
**1→3**, **1→6**, **1→9**, **1→12 (End)**; the return sweep covers **12→9**,
**12→6**, **12→3**, **12→1 (beginning)**. Every run re-reads the current tree in
that window, fixes any surviving defect, runs the full gate set, records the
evidence and pushes.

## Push run 1 — cycles 1→3 (victory recovery, Reset integrity, help readability)

- **Scope**: cycles 1-3 and the daily-generation gate repair.
- **Finding**: after solving First Thread, advancing through the victory dialog's
  Next chamber button, and pressing the game's Chambers button, the index focused
  the First Thread card even though the game title was Crossweave. A played run
  reported `active=first-thread` with `level=Crossweave`; a keyboard or screen
  reader user was returned to the wrong card.
- **Fix**: `fix(ui): return Chambers to the current chamber card` (`dc5d540`,
  ADR-036). Every `openBoard` updates the return target to the level being played;
  the levels scroll is still restored when the open started from the index, and
  the focused card is scrolled into view if it is outside the viewport.
- **Visual proof**: same 1440x900 save/state:
  - before: `assets/screenshots/2026-11-08-chambers-return-before.png` — First
    Thread carries the focus ring while Crossweave is the next chamber.
  - after: `assets/screenshots/2026-11-08-chambers-return-after.png` — Crossweave
    carries the focus ring and Next badge after returning from it.
- **Played run**: `node scratch/weft-play.mjs next-chambers` reports
  `active=first-thread` before and `active=crossweave` after; `npm run dogfood`
  now solves First Thread, advances to Crossweave, presses Chambers and requires
  `document.activeElement.dataset.level === "crossweave"` before the rest of the
  run, with 0 page errors.
- **Gates**: `npm test` 96/96 pass; `python aikit.py check weft` 5/5;
  `npm run dogfood` OK with 0 page errors; `python aikit.py ui verify weft` OK.
- **Push**: `git push origin master` after the record commit; remote head
  confirmed with `git ls-remote origin`.
