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

## Push run 4 — cycles 1→12 (End; full window)

- **Scope**: the complete 12-cycle tree and its interactions, including the new
  locked-link guard, the static shell, the help focus and the index return.
- **Finding**: the locked-link guard returned to the index silently. A player
  following a shared `?level=shuttle` link saw the campaign map with no reason
  and could read the redirect as a broken link.
- **Fix**: `feat(ui): explain a blocked locked-chamber link` (`ddc2b60`,
  ADR-039). A polite `#levels-status` line says `"Shuttle is locked. Finish Warp
  Song first."`; normal index visits clear it. The small text size uses a
  `--text-sm` theme token so the UI style gate stays token-only.
- **Visual proof**: same URL/state/viewport (1440x900, fresh profile,
  `?level=shuttle`):
  - before: `assets/screenshots/2026-11-08-locked-notice-before.png` — the index
    with no explanation.
  - after: `assets/screenshots/2026-11-08-locked-notice-after.png` — the same
    index with the locked-chamber notice under the daily strip.
- **Played run**: `npm run dogfood` requires the notice to name both Shuttle and
  Warp Song, then performs the full help/solve/victory/reset/12×12/daily/
  late-index flow with 0 page errors.
- **Gates**: `npm test` 96/96 pass; `python aikit.py check weft` 5/5;
  `npm run dogfood` OK with 0 page errors; `python aikit.py ui verify weft` OK.
- **Push**: `git push origin master` after the record commit; remote head
  confirmed with `git ls-remote origin`.

## Push run 5 — return sweep 12→9

- **Scope**: cycles 12-9 (help focus, static shell, index return, level balance)
  plus the run-3/4 locked-link fixes, re-read from the end back.
- **Finding**: a legacy save with Shuttle solved out of order showed a faded,
  disabled "Woven" card with a best time, while Tapestry was already open because
  Shuttle was its immediate predecessor. The player could not replay the solved
  chamber; the card contradicted its own record.
- **Fix**: `fix(progress): let solved chambers replay through legacy gaps`
  (`569912e`, ADR-040). `isUnlocked` now accepts a solved chamber itself in
  addition to the normal previous-chamber rule; unsolved and unknown chambers are
  unchanged.
- **Visual proof**: same save/viewport (1440x900, Shuttle solved but 1-8 not):
  - before: `assets/screenshots/2026-11-08-legacy-replay-before.png` — Shuttle is
    faded, locked and disabled while showing Woven and Best.
  - after: `assets/screenshots/2026-11-08-legacy-replay-after.png` — Shuttle is
    fully visible, Woven and clickable; Tapestry remains open.
- **Played run**: `node scratch/weft-play.mjs out-of-order-save` reports
  `disabled=true, layout locked=true, opacity=0.55` before and
  `disabled=false, locked=false, opacity=1` after. `npm run dogfood` injects the
  same save, opens Shuttle from its card and returns, then completes the full run
  with 0 page errors.
- **Gates**: `npm test` 97/97 pass; `python aikit.py check weft` 5/5;
  `npm run dogfood` OK with 0 page errors; `python aikit.py ui verify weft` OK.
- **Push**: `git push origin master` after the record commit; remote head
  confirmed with `git ls-remote origin`.

## Push run 6 — return sweep 12→6

- **Scope**: cycles 12-6 (help focus, static shell, index return, level balance,
  daily clamp, skip link) plus the run-4/5 fixes.
- **Finding**: the skip-link keyboard sequence was verified only on the title
  screen. A direct `?level=first-thread` load starts on the game screen, where the
  first Tab stop, `main` focus and the next control were not covered; a regression
  there would have shipped unseen.
- **Fix**: `test(dogfood): cover the skip link on a deep-loaded game` (`3fad174`,
  test-only). The pass now loads a chamber directly, Tabs to `Skip to content`,
  Enters to focus `main`, and requires the next Tab to reach the Chambers button.
  No game code changed.
- **Visual proof**: not applicable; this run adds keyboard coverage and makes no
  visual claim. The existing skip-link screenshot pair remains the visual record.
- **Played run**: `npm run dogfood` reports the deep-loaded game skip sequence and
  completes the full run with 0 page errors.
- **Gates**: `npm test` 97/97 pass; `python aikit.py check weft` 5/5;
  `npm run dogfood` OK with 0 page errors.
- **Push**: `git push origin master` after the record commit; remote head
  confirmed with `git ls-remote origin`.
