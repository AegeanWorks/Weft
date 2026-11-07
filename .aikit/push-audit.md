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

## Push run 2 — cycles 1→6 (adds saves, card previews, audio cues)

- **Scope**: cycles 1-6 and their interactions: victory/reset/help, campaign
  total filtering, mini-loom previews and the three new audio cues.
- **Finding**: the title screen's Sound on/off control was 32px high, the only
  interactive target below the game's 44px standard; the focused outline wrapped
  a visibly shorter box than Play/Daily/How and the in-game sound button.
- **Fix**: `fix(a11y): raise the title sound control to 44px` (`cf37967`,
  ADR-037). It is now an inline-flex 44px box with the text vertically centered;
  the focus outline and copy are unchanged.
- **Visual proof**: same 390x844 title, keyboard focus on Sound on:
  - before: `assets/screenshots/2026-11-08-sound-target-before.png` — 32px focus
    box around the link.
  - after: `assets/screenshots/2026-11-08-sound-target-after.png` — 44px focus
    box, text centered.
- **Played run**: `node scratch/weft-play.mjs sound-target` reports
  `height=32` before and `height=44, display=inline-flex` after;
  `npm run dogfood` measures the control before the keyboard sequence and requires
  at least 44px, then completes the full run with 0 page errors.
- **Gates**: `npm test` 96/96 pass; `python aikit.py check weft` 5/5;
  `npm run dogfood` OK with 0 page errors; `python aikit.py ui verify weft` OK.
- **Push**: `git push origin master` after the record commit; remote head
  confirmed with `git ls-remote origin`.

## Push run 3 — cycles 1→9 (adds daily clamp, level balance, skip link)

- **Scope**: cycles 1-9 and their interactions, especially level entry paths,
  the daily clamp and the keyboard skip link.
- **Finding**: a plain `?level=shuttle` link opened the locked ninth chamber on a
  fresh profile; the index card was disabled but the URL bypassed the sequential
  unlock and a solve would record a best time and stars for it. A preview URL was
  the only documented way to render an arbitrary chamber.
- **Fix**: `fix(progress): keep locked chambers locked on deep links` (`084e03b`,
  ADR-038). `openLevel` checks `isUnlocked` and returns to the index unless an
  explicit `preview` option is present; QA previews remain available. Dogfood now
  checks both the blocked plain link and the still-working `preview=solved` path.
- **Visual proof**: same URL/state/viewport (1440x900, fresh profile,
  `?level=shuttle`):
  - before: `assets/screenshots/2026-11-08-locked-deeplink-before.png` — the
    locked Shuttle board opens as a playable game screen.
  - after: `assets/screenshots/2026-11-08-locked-deeplink-after.png` — the same
    URL returns to the index, where Shuttle is locked.
- **Played run**: `node scratch/weft-play.mjs locked-deep-link` reports
  `screen=game, level=Shuttle` before and `screen=levels` after, with the preview
  URL still reporting `screen=game, won=true`. `npm run dogfood` performs the
  locked-link and preview checks, then the full help/solve/victory/reset/12×12/
  daily/late-index run with 0 page errors.
- **Gates**: `npm test` 96/96 pass; `python aikit.py check weft` 5/5;
  `npm run dogfood` OK with 0 page errors; `python aikit.py ui verify weft` OK.
- **Push**: `git push origin master` after the record commit; remote head
  confirmed with `git ls-remote origin`.
