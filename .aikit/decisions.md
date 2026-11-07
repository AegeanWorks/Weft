# Decisions

Why this project is built the way it is, oldest first. One entry per decision that changes a
contract, a dependency, a data format or the architecture; IDs are consecutive and never reused.

<!-- Entry format:
### ADR-NNN: <decision in one line>
- **Date**: YYYY-MM-DD
- **Status**: Accepted
- **Context**: <what forced the decision>
- **Decision**: <what was decided>
- **Consequences**: <what follows, including what it costs>
-->

### ADR-001: A pure engine drives a static browser loom
- **Date**: 2026-10-29
- **Status**: Accepted
- **Context**: The AegeanWorks Play catalog serves versioned static builds from GitHub Pages. A game that needed a Python or Node API would have to stay a local-run card, like Crypt-Crawler, instead of becoming a playable browser title.
- **Decision**: Keep all thread rules in `src/game/engine.js` with no DOM, clock, random source or storage dependency, and let `src/ui/app.js` only translate pointer and keyboard input into engine calls. Ship `index.html`, `src/` and `assets/` as the complete runtime.
- **Consequences**: The same rules power the browser, the tests and the level validator. The site sync can copy a build by commit and serve it from an iframe. There is no server-side anti-cheat or shared leaderboard; progress is local by design.

### ADR-002: Generate chambers from Hamiltonian paths and freeze their solutions
- **Date**: 2026-10-29
- **Status**: Accepted
- **Context**: Hand-authoring twelve total-coverage puzzles is slow and error-prone. A level is only valid when every pair is connected and every cell is covered exactly once, so an invalid chamber must fail before it reaches the browser.
- **Decision**: `scripts/generate-levels.mjs` builds a randomized Hamiltonian path, cuts it into the requested number of threads, and stores the segments as the solution. It retries cuts that place two spools next to each other, and `tests/levels.test.js` validates every level and replays every stored solution.
- **Consequences**: Every chamber provably has at least one solution and a hint route. The generator is deterministic per seed, so a regenerated file can be compared with the committed one. Alternative player solutions are allowed because win detection is rule-based, not solution-based.

### ADR-003: One versioned localStorage record, no account or network
- **Date**: 2026-10-29
- **Status**: Accepted
- **Context**: The game must work inside a static Play iframe and on a local server without an account, a cookie or a backend. A corrupt save must never block play.
- **Decision**: Store `{version, solved, settings, lastLevel}` under `weft.progress.v1`. Normalize every field on read, reset safely on corrupt or future-versioned JSON, keep the fastest time per chamber and derive sequential unlocks from the solved map.
- **Consequences**: A save is portable only within one browser origin. Clearing site data resets progress. The schema can add optional fields without discarding existing stars or best times.

### ADR-004: Deploy as a commit-versioned Play build
- **Date**: 2026-10-29
- **Status**: Accepted
- **Context**: The website already syncs browser games into `docs/play/<slug>/<commit>/` with a digest manifest, a license copy and a local-run fallback for server-backed titles.
- **Decision**: Publish Weft as a browser-mode game with `index.html`, `src/` and `assets/` as its runtime entries. The website sync records the game repository's commit, date, version and digest; the Play page loads the iframe from the copied path.
- **Consequences**: A new game release enters the site only after a commit and a sync run. Old commit directories are removed by the sync, so deep links to an old build are not stable. The game must keep every asset path relative to its own directory.

### ADR-005: Screen Changes Target Sections, Never the Body
- **Date**: 2026-10-29
- **Status**: Accepted
- **Context**: `setScreen` selected every `[data-screen]` element. After the first title-screen call set `body.dataset.screen`, the next screen change matched the body too, set `body.hidden = true`, and rendered the level cards inside a `display:none` document. The page was blank even though the DOM and state were correct. Centering an overflowing levels grid and retaining the title scroll offset made small viewports worse.
- **Decision**: Restrict the screen loop and heading lookup to `section[data-screen]`; keep `body.dataset.screen` as a state marker only; reset `window.scrollTo(0, 0)` on every screen change; and start the shell from the top (`justify-content: flex-start`) instead of centering overflowing screens. Add a regression assertion for the selector and scroll reset. Bump the game to 0.1.1.
- **Consequences**: The title, chamber index and board stay visible after every transition and always start at the top; the body marker remains available to screenshots and tests. The title screen still centers within its own min-height. The fix needs a refreshed Play build, but old build directories remain available for cached catalogs.
- Cross-principle check: no principle section changed. Serves PRINCIPLE-003 (the state marker no longer changes layout semantics), PRINCIPLE-011 (a transition never leaves a blank screen) and PRINCIPLE-014 (the regression is pinned).

### ADR-006: Act II extends the loom without changing the rules
- **Date**: 2026-10-30
- **Status**: Accepted
- **Context**: The campaign stopped at twelve chambers and a 9×9 loom, so a solved save had nothing left to unlock and the generator, engine and UI all already accepted larger sizes. A second act had to add content without a new mechanic, a save migration or a second deployment lane.
- **Decision**: Append six chambers (13–18) at 10×10–12×12 with eight or nine threads, generated from fixed `weft-13`…`weft-18` seeds by the existing Hamiltonian cut. Act II uses an even cut so every thread carries a similar share of the loom instead of one thread taking the remainder; the first twelve chamber definitions are regenerated unchanged. Keep the same rules, the same `weft.progress.v1` record and the same sequential unlock; only `TOTAL_CHAMBERS`, the README table and the UI copy change. Bump the game to 0.2.0.
- **Consequences**: A completed Act I now unlocks Act II in place, and old saves keep their best times because new ids only append. The largest loom renders 144 cells in the same square stage, so cell targets shrink but the keyboard and pointer path is unchanged. Generation of all eighteen chambers takes about sixteen seconds, still a one-off script rather than a build dependency. The Play catalog needs a fresh build for 0.2.0; `tests/levels.test.js` proves all eighteen stored solutions remain total and winnable.

### ADR-007: Stars Measure a Clean Weave, Not a Target Time
- **Date**: 2026-10-30
- **Status**: Accepted
- **Context**: The eighteen chambers stored best times and hint counts, but the chamber index showed only the time. A hinted solve and a clean solve looked identical, and there was no second goal after finishing a chamber. Time targets would need per-chamber tuning and would drift as the generator or hardware changed.
- **Decision**: Derive three stars from hint use only: no hints earns three, one hint earns two, more than one earns one. Store the rating beside the best time in the existing `weft.progress.v1` entry, keep the highest rating even when a later run is faster, and derive a rating from the stored hint count when an older entry has none. Show the rating on chamber cards, in the victory dialog, and as a campaign total out of `TOTAL_CHAMBERS * 3`.
- **Consequences**: Every chamber gains a replay goal that needs no authored par data, and old saves show a meaningful rating immediately. A player can upgrade stars with a slower clean run without losing a fast time, so the stored hints and stars can come from different runs; the star field is authoritative and the record stays readable. The save schema stays version 1 because the field is additive. Time remains an independent best-time chase rather than a rating input.

### ADR-008: Daily Weave Shares the Generator and Keeps Its Own Save
- **Date**: 2026-10-30
- **Status**: Accepted
- **Context**: The campaign is finite and progress is local, so Weft had no reason to be opened again after the last chamber. A daily puzzle needed a fresh chamber without a server, an account or a network call, and it could not be allowed to disturb campaign stars, unlocks or best times.
- **Decision**: Move the Hamiltonian construction into the pure `src/game/generate.js`, shared by the fixed campaign script and the browser. Build one 7×7, six-thread chamber from the player's local `YYYY-MM-DD` date, store its best time and stars under the separate `weft.daily.v1` key, derive the streak from consecutive solved days, and offer a copyable result line. The daily has its own game-screen context and never writes `weft.progress.v1`.
- **Consequences**: Two players on the same local date get the same loom, and a browser can generate it offline in a few milliseconds. Players in different time zones see different dailies, and changing the system clock changes the daily; both follow from having no server. The daily and campaign share one generator and one star rule, so a fix to either cannot fork the mechanics. The daily is outside the campaign total and unlock chain by design.

### ADR-009: Keep the Stored Record and Share Text Visible
- **Date**: 2026-10-30
- **Status**: Accepted
- **Context**: The best time and stars lived only on the chamber index, so a player replaying a chamber could not see the record they were chasing. A failed clipboard write left the daily result in a transient status line behind the modal, and undo was pointer- or button-only despite the keyboard-first loom.
- **Decision**: Add a Best stat to the game HUD, filled from the campaign or daily record and labelled for screen readers. Render the daily result line inside the victory dialog before copying, so it stays selectable when the clipboard is unavailable. Bind Ctrl/Cmd+Z to the same `undo()` path as the button, and raise the locked-card opacity from 0.46 to 0.55.
- **Consequences**: A replay has a visible target without leaving the board, and a daily result is never lost to a permission prompt. The HUD reads the same record as the index, so the two cannot disagree. The shortcut is harmless outside the game screen and no save field changes. The modal now carries a line of selectable text; the copy button remains an enhancement rather than the only way to share.

### ADR-010: Threads Carry a Pattern as Well as a Colour
- **Date**: 2026-10-30
- **Status**: Accepted
- **Context**: Nine thread colours identify both ends of every pair and every drawn route. Players with red-green or blue-purple colour-vision deficiency can lose a pair or follow the wrong thread, and the game had no second visual channel.
- **Decision**: Give every colour a unique SVG `stroke-dasharray` in `src/ui/threads.js`, applied to the thread core, the live draft and the spool ring. Coral stays solid as the control; the other eight use distinct dash, dot and dash-dot rhythms. A unit test requires every colour to have a unique pattern and an unknown colour to fall back to solid.
- **Consequences**: Pairs and routes are readable without hue, at desktop and mobile cell sizes, with no asset, setting or stored preference. The draft keeps the same texture as its colour, so the preview does not introduce a second vocabulary. The glow remains solid behind the dashes, so the woven aesthetic stays intact. The pattern is a presentation detail; the pure engine and saves are unchanged.

### ADR-011: Daily History Is a Record, Not a Back-Fill
- **Date**: 2026-10-30
- **Status**: Accepted
- **Context**: The daily streak was a single number. A returning player could not see which of the last days were woven, and the only way to inspect a missed day would have been to replay it, which would silently repair a broken streak.
- **Decision**: Derive the last seven calendar days from the existing `weft.daily.v1` days map with a pure `recentDays` helper and render them as a compact, display-only list under the daily card. Each chip carries the day number and up to three stars; today is outlined, solved days are gold and missed days stay dim. The list is not interactive.
- **Consequences**: The streak becomes legible without changing the save format, adding a key or inventing a second streak counter. A missed day cannot be back-filled, so the number and the strip cannot disagree. The helper uses UTC midnights for the date walk, so month, year and daylight-saving boundaries are stable. A player who wants more history keeps it in the daily save; the UI deliberately shows a bounded week.

### ADR-012: Calm the Owned-Cell Wash So Threads Read First
- **Date**: 2026-11-03
- **Status**: Accepted
- **Context**: Solved looms photographed with pale per-cell tint blocks (11% `--owner` wash) that read as patchwork rectangles behind threads, worst on 5x5 and 12x12 solved boards.
- **Decision**: Lower `.cell::before` `--owner` opacity from 0.11 to 0.04; keep cell borders and thread rendering order unchanged (SVG already paints above cells).
- **Consequences**: Territory hint survives at a glance while threads carry the contrast; no DOM, stacking, save or engine change. Verified by before/after solved-board screenshots at 5x5 and 12x12.

### ADR-013: Slim the Glow, Strengthen the Core
- **Date**: 2026-11-03
- **Status**: Accepted
- **Context**: Solved-board captures showed thick glow washing out fine dash textures, worst on gold/teal/jade at 12x12 where sub-0.1-unit dashes aliased.
- **Decision**: Thread glow width 0.34 to 0.28, core and draft width 0.14 to 0.16; widen gold dashes to 0.09/0.09, teal to 0.2/0.12, jade to 0.12/0.16 while keeping all nine patterns unique and coral solid.
- **Consequences**: Cores stay legible at small cells without reintroducing patchiness; dash vocabulary unchanged, so the existing uniqueness test still pins it. Verified by 12x12 solved before/after pair.

### ADR-014: Give Spools More Presence on Large Looms
- **Date**: 2026-11-03
- **Status**: Accepted
- **Context**: 10x10-12x12 captures showed spool rings dissolving at ~30px cells, and 390px portraits left 29px tap targets with cramped chrome.
- **Decision**: Enlarge spool geometry in `appendSpool` (glow r 0.3 to 0.32, ring r 0.22 to 0.24, core r 0.1 to 0.12) and ring stroke to 0.07; trim ≤520px shell padding 16px to 12px so the loom gains a few pixels. No layout reorder, no new breakpoints.
- **Consequences**: Spools and their dash textures read at 12x12 on desktop and 390px; cells remain ~30px on small phones, so the 44px target stays a documented constraint rather than a claimed fix. Verified by 390px empty-loom capture.

### ADR-015: Make the Hint Ghost Read at a Glance
- **Date**: 2026-11-03
- **Status**: Accepted
- **Context**: Timed captures showed the coral ghost route renders (status "A ghost thread shows one route for coral", 4.2s timer) but reads pale against bright threads; the earlier "missing hint" capture was a post-timer screenshot, not a rendering bug.
- **Decision**: Widen `.hint-thread` 0.075 to 0.09 and raise base opacity 0.62 to 0.72; keep the 1.6s pulse, dash rhythm and timer unchanged.
- **Consequences**: Ghost stays clearly visible through a full pulse cycle without competing with committed threads; headless check (click Hint, `.hint-thread` present, status correct, pulse opacity mid-cycle) plus the pre-fix ghost capture verify behavior. No engine, save or timer change.

### ADR-016: Surface Loom Coverage Beside Thread Count
- **Date**: 2026-11-03
- **Status**: Accepted
- **Context**: Threads-woven count hides the partial-coverage trap: all pairs connected is not a win until every cell is covered, and nothing on screen said how much loom was left.
- **Decision**: Add a pure `coverage(game)` helper (`{covered, total}`) in `src/game/engine.js` with unit tests, and show `N of M threads woven · P% of the loom` in the game status line. No schema, rule, timer or layout change.
- **Consequences**: Players see the second half of the win condition while weaving; win detection stays in `isSolved`. Verified by engine tests (empty/partial/full) plus a scripted frozen-level run (0/25, 5/25 unsolved, 25/25 solved) and a solved-board capture reading "100% of the loom".

### ADR-017: Act III Holds the 12x12 Finale Line
- **Date**: 2026-11-03
- **Status**: Accepted
- **Context**: A solved campaign ended at eighteen chambers with nothing left to unlock; the generator, engine and UI already accept 12x12 looms, and the finale deserved a longer summit than a single 12x12.
- **Decision**: Append six chambers (19-24: Harbor Loom, Salt Meridian, Moon Loom, Coral Deep, Star Citadel, The Eternal Weave) at 12x12 with eight or nine threads from fixed `weft-19`…`weft-24` seeds via the existing Hamiltonian even cut. Keep the same rules, the same `weft.progress.v1` record and sequential unlock; only the SPECS, `TOTAL_CHAMBERS`, README table/copy and version change. Bump to 0.8.0.
- **Consequences**: Old saves keep their stars and unlock Act III in place through append-only ids; `tests/levels.test.js` now pins twenty-four chambers and an Act III finale-line rule. The largest loom stays 12x12, so tap-target constraints do not regress. Dogfood renders 24 cards, solves chamber 1, renders the new finale and solves the daily.

### ADR-018: First screenshot keepers; fix stale twelve-chamber copy and library mislabel
- **Date**: 2026-11-03
- **Status**: Accepted
- **Context**: Weft shipped approved thread/loom brand but `media.json` said `has_ui:false/ui_kind:library` (it is a static web game), `assets/screenshots/` did not exist, and the Act III expansion to 24 chambers left stale copy: the social SVG footer and `package.json` description said twelve/twelve.
- **Decision**: Correct `media.json` to `has_ui:true/ui_kind:web`; change the social footer to 24 CHAMBERS and the package description to twenty-four chambers; correct the ASSETS.md levels row and add the screenshots row (AGL-1.1). Capture `npm start` at `http://127.0.0.1:4175`, viewport 1440x900, commit `06bdbb7`: `2026-11-03-title.png` (served title via capture browser) and `2026-11-03-chamber.png` (deep link `?level=first-thread` via headless Edge `--screenshot`, after capture-browser control dropped mid-session). Register both in `.aikit/media.json` and the README `aegean:screenshots` block.
- **Consequences**: README proves title plus real chamber; the deep link is the documented share-link shape, so the chamber capture is reproducible without clicking. Reproduce with: `npm start`, screenshot the title; `msedge --headless=new --screenshot --window-size=1440,900` the deep link.

### ADR-019: Reject invalid solve times and lock unknown chambers
- **Date**: 2026-11-03
- **Status**: Accepted
- **Context**: Wave audit 0,10,20 (27 commits) reproduced that `recordSolve` and `recordDaily` accepted a missing, NaN, negative or infinite `bestMs` as a `0`ms three-star best, and `isUnlocked` returned true for an unknown level id; `media.json` still described the social card as a 12-chamber promise after Act III moved the build to 24 chambers.
- **Decision**: Return the current record unchanged when `bestMs` is not a finite number `>= 0`; return false from `isUnlocked` for an unknown id (first chamber stays open, empty levels lock); correct the `media.json` social-preview review note to the 24-chamber promise. Pin with `recordSolve rejects a missing or invalid time`, `recordDaily rejects a missing or invalid time` and `unknown chambers stay locked`.
- **Consequences**: No invented `0`ms best can unlock the next chamber or inflate totals; the UI path already supplies a real elapsed time so play is unchanged. Cross-principle check: no principle section changed. Serves PRINCIPLE-003 (empirical save integrity), PRINCIPLE-011 (no surprise unlock) and PRINCIPLE-014 (failing-first regression).

### ADR-020: A zero-millisecond best is never a record
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: ADR-019 stopped missing, NaN, negative and infinite `bestMs` values from becoming `0`ms three-star bests, but an explicit `0` still passed both recorders and `normalizeEntry` kept it on load, so legacy `0`ms rows survived every restart and a sub-millisecond time floored to `0` on write.
- **Decision**: Treat `bestMs <= 0` as invalid in `recordSolve` and `recordDaily`, and require a floored value `> 0` in both `normalizeEntry` helpers so stored `0`ms rows drop back to an empty record on the next load. Pin with `normalizeProgress drops zero-millisecond records` and `normalizeDaily drops zero-millisecond records` plus the extended invalid-time cases (`0`, `0.4`).
- **Consequences**: No human or synthetic run can store `00:00`; old `0`ms rows clean themselves without a migration. Cross-principle check: no principle section changed. Serves PRINCIPLE-003 (empirical save integrity) and PRINCIPLE-014 (failing-first regression).

### ADR-021: Cap the Hamiltonian search so unlucky dates cannot freeze the daily
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: Wave audit perf profiling (instrumented node counts) showed a successful attempt walks straight to a full path with one node per cell (48 nodes for 7x7, 143 for 12x12, zero backtracking), while a doomed attempt burns the whole 120000-node budget. Five of twelve sampled late-October/early-November dates needed several burned attempts first, freezing the browser 5-18s on open; even two campaign specs paid seconds at authoring time. The single-date perf test only pinned a fast seed, so the tail hid.
- **Decision**: Cut the per-attempt node budget from 120000 to 1000 (about 7x the largest observed success cost) and keep 24 attempts. A smaller budget only abandons attempts that can never succeed in time; every emitted puzzle is still a total Hamiltonian path cut into valid threads, so a seed can only change which valid puzzle it yields, never whether it is valid. Five multi-attempt campaign chambers (first-thread, bronze-loom, aegean-fold, meridian-weave, deep-current) regenerate with new solutions; the other nineteen are bit-identical. Pin with `previously slow dates stay interactive` (six formerly slow dates each under 1500ms) and `every month of a leap year yields a valid, solvable daily`. Bump to 0.9.0.
- **Consequences**: The worst sampled daily fell from ~18s to under 400ms and a 366-day leap-year sweep solves everywhere with no throw; saves stay valid because only solutions changed, not ids or the record format. The trade is five refreshed campaign solutions for the same rules. Cross-principle check: no principle section changed. Serves PRINCIPLE-003 (measured before believed), PRINCIPLE-010 (unbounded input effort capped) and PRINCIPLE-014 (failing-first regression).

### ADR-022: Pin the sound cues and refresh the proof captures
- **Date**: 2026-11-04
- **Status**: Accepted
- **Context**: The coverage sweep found `src/ui/audio.js` had no unit tests despite being the whole sound contract (generated cues, no files), and the commit-stamped screenshots still showed the pre-0.9.0 first-thread spool layout. A single dogfood run also flaked on the daily close under machine load and passed clean in isolation, so it stays a watch item rather than a finding.
- **Decision**: Add `tests/audio.test.js` with six stub-context tests (no-context silence, unknown cue, mute, tick frequency, win ascent, suspended unlock). Recapture the title and first chamber at the 0.9.0 tree as dated files, keep the 06bdbb7 captures as history, and point the README block plus `media.json` at the new pair after a genuine vision check.
- **Consequences**: The suite grows to 89 tests with the sound contract pinned; the README depicts the shipped spool layout again. No game, rule, save or version change. Cross-principle check: no principle section changed. Serves PRINCIPLE-011 (audible cues stay reliable) and PRINCIPLE-014 (failing-first regression).

### ADR-023: Keep a won loom recoverable after the victory dialog closes
- **Date**: 2026-11-07
- **Status**: Accepted
- **Context**: A played solve of First Thread showed that Escape closes the native victory dialog and leaves the won board frozen: `beginDraft` refuses every cell, Undo/Reset/Hint are disabled, and the Next/Replay buttons disappear with the dialog. The only visible exit is the Chambers button, so a player who dismisses the result by accident loses the next-chamber path. A real headless-Edge run reproduced the state (`winOpen=false`, status `Chamber woven.`, click on a spool leaves the dialog closed).
- **Decision**: When the board is won and the dialog is closed, a pointer tap or Enter/Space on the loom resets the status to `Chamber woven.` and reopens the existing victory dialog through `showWinDialog`. The dialog close handler tells the player `Chamber woven. Click the loom to reopen the result.` and keeps focus on the first spool. No new control, no HTML/CSS, no save field and no change to the win rules.
- **Consequences**: The finished tapestry stays inspectable after dismissal while Next and Replay remain one gesture away for pointer, touch and keyboard players. `scripts/dogfood.mjs` pins the flow end to end: solve, Escape, recovery hint, reopen, advance to Chamber 02, then the 12x12 finale and daily; the pass also fails on any page error. Verified by a 1440x900 before/after pair on the same fresh-profile first-chamber solve. Cross-principle check: no principle section changed. Serves PRINCIPLE-009 (reuse the existing dialog path), PRINCIPLE-011 (no dead-end state) and PRINCIPLE-014 (browser reproduction and regression pin).

### ADR-024: Reset starts a clean attempt, never a timer rollback
- **Date**: 2026-11-07
- **Status**: Accepted
- **Context**: `resetLevel` zeroed the timer but pushed the pre-reset game onto the undo stack. A played First Thread run drew two threads for 3.7s, pressed Reset (`00:00`), pressed Undo, and got both threads back while the clock stayed at zero; finishing recorded `bestMs` 1662 for an 8.8s attempt. The same reset also left an active hint ghost painted over the cleared loom. The pre-fix dogfood reset check reproduced both: `undoDisabled=false, hintThreads=1`.
- **Decision**: Reset now starts one clean attempt: it clears the undo stack, cancels and removes the active hint ghost and its timer, rebuilds the empty game and resets the clock. The hint count intentionally survives so a hint used before a reset still costs a star; the reset is not undoable. Remove the `pushUndo()` call from `resetLevel`.
- **Consequences**: Reset can no longer manufacture a fast best time, Undo is disabled on the cleared loom, and a stale ghost cannot outlive its attempt. A player who wants a fresh timed run without spending hints still leaves and reopens the chamber, which already starts a new run. `scripts/dogfood.mjs` pins hint ghost present, two threads drawn, Reset, then `moves=0`, `threads=0`, `undoDisabled=true`, `timer=00:00`, `hintThreads=0`. Verified by a 1440x900 before/after pair from the same hint-plus-two-thread Reset+Undo state. Cross-principle check: no principle section changed. Serves PRINCIPLE-003 (played measurement before the fix), PRINCIPLE-011 (one unambiguous Reset) and PRINCIPLE-014 (browser regression pin).

### ADR-025: Open How to play at its heading, not its footer
- **Date**: 2026-11-07
- **Status**: Accepted
- **Context**: At 390x844 the help dialog holds 876px of content in a 718px frame. Native `showModal` autofocuses the only focusable descendant, the footer Ready button, so the dialog opened at `scrollTop=158` with the heading at `-45.7px`: the title and first rule were hidden. At 1440x900 it still scrolled 21px and focused Ready. The mobile capture showed the dialog starting mid-sentence.
- **Decision**: Give the help heading `tabindex="-1"`, focus it after `showModal`, and set the dialog's `scrollTop` to 0. Keep the Ready form close and the existing modal layout. No other dialog changes.
- **Consequences**: How to play opens at its title on every viewport, screen readers announce the heading first, and Escape returns focus to the How-to-play button. `scripts/dogfood.mjs` opens the dialog with a real click at 1440x900 and asserts `scrollTop=0`, `activeElement=help-title`, then Escape closes back to `btn-how`. A 390x844 real click replay returns the same state, and the before/after pair is committed. Cross-principle check: no principle section changed. Serves PRINCIPLE-011 (the first screen is usable immediately) and PRINCIPLE-014 (browser regression pin).

### ADR-026: Pin deterministic daily search work, not the machine's wall clock
- **Date**: 2026-11-07
- **Status**: Accepted
- **Context**: `previously slow dates stay interactive` asserted each known slow daily generated in under 1500ms. With the workstation at 100% CPU from unrelated desktop sessions, 2024-02-28 took 12.4s and failed `npm test` and `ui verify` twice even though the algorithm was unchanged and the same test passed 12 consecutive runs when idle. A wall-clock assertion was measuring the machine, not the search.
- **Decision**: Expose an optional passive `stats` object from `generateLevel` and `createDailyLevel` that records search `attempts` and `nodes`. Replace the two wall-clock assertions with deterministic bounds: a fast date must stay within the 24000-node cap, and the six previously slow dates must stay within 16 attempts and 16000 nodes while still solving. Generator output, seeds, budgets and behavior are unchanged.
- **Consequences**: The canonical gate is load-independent and still catches the old 120k-node burn or an attempt blow-up; the live browser dogfood remains the end-to-end interactivity proof. The measured worst known date uses 12 attempts and 11329 nodes, leaving headroom under the 16/16000 bounds. Cross-principle check: no principle section changed. Serves PRINCIPLE-003 (measure the algorithm, not the host), PRINCIPLE-010 (bounded search work) and PRINCIPLE-014 (a reliable regression gate).

### ADR-027: Unknown chamber ids never count toward the campaign totals
- **Date**: 2026-11-07
- **Status**: Accepted
- **Context**: A save containing 24 unknown solved ids made the title read `24 of 24 woven · 72/72 stars · next: First Thread` while the chamber index showed only one unlocked chamber and zero real stars. `isUnlocked` already rejected unknown ids (ADR-019), but `solvedCount` and `totalStars` counted every key in the stored map. A renamed or future chamber id would have the same effect without any malicious edit.
- **Decision**: Give `solvedCount` and `totalStars` an optional `levels` argument; when supplied, only ids present in the live level list count. The app passes `LEVELS` at both call sites. Unknown rows stay in the save untouched (so a future build or a restored id still has its record), but they are inert for the current totals. Without a level list the old counting behavior remains for pure callers.
- **Consequences**: Campaign counts, the completion message, the next-chamber line and the chamber index all agree with the levels that exist; an all-unknown save shows the fresh `24 chambers · 3 stars each` line. A unit test covers mixed known and unknown ids plus the empty-list case, and dogfood injects 24 ghost ids, reloads the title and index, then clears them before the full run. Verified by a same-save 1440x900 title pair. Cross-principle check: no principle section changed. Serves PRINCIPLE-003 (save integrity measured in the browser), PRINCIPLE-011 (truthful counts) and PRINCIPLE-014 (failing-first regression).

### ADR-028: Every chamber card previews its own spool layout
- **Date**: 2026-11-07
- **Status**: Accepted
- **Context**: All 24 chamber cards shared the same decorative circle. Size and thread count were text-only, so the index could not show how dense a loom is or where its spools sit; the 5x5 opener and the 12x12 finale looked alike at a glance.
- **Decision**: Generate a `.level-mini` SVG for each card from its existing `pairs`: a frame, the cell grid and two coloured spool dots per pair. Render it as a 100px watermark behind the text (0.32 opacity, 0.16 locked, 0.52 hover/focus, `pointer-events:none`) and replace the old `::after` circle. Solution lines are deliberately omitted so the index does not spoil a route.
- **Consequences**: The index becomes a visual campaign map without a new asset, save field or engine rule; the card remains one button and its click target is unchanged. `scripts/dogfood.mjs` asserts one preview per card, six spool dots on the 5x5 opener and eighteen on the 12x12 finale, then opens the first chamber by clicking its card instead of deep-linking. Verified by a 1440x900 before/after pair and a 390x844 render check. Cross-principle check: no principle section changed. Serves PRINCIPLE-009 (reuse the level data at a presentation boundary) and PRINCIPLE-014 (browser regression pin).

### ADR-029: Give hint, undo and reset their own short cues
- **Date**: 2026-11-07
- **Status**: Accepted
- **Context**: `beginDraft`, `undo`, `resetLevel` and `showHint` all called `audio.play("tick")`. A browser probe that intercepted oscillator scheduling showed hint = `[660]`, undo added `[660]`, and reset added `[660]`; the four most common loom actions were audibly identical, so a blind player or someone looking away could not tell what changed.
- **Decision**: Add three named cues: `hint` (rising triangle pair 880/1174.66), `undo` (falling sine pair 392/293.66) and `reset` (one low 196 sine). Keep `tick` for beginning a draft and the sound toggle, `connect` for a committed thread, `error` and `win` unchanged. Route the three call sites to the new names. No files, no settings and no volume change; the existing mute still silences everything.
- **Consequences**: Every common action has a distinct, short signature, and the action vocabulary stays inside the generated WebAudio cue table. Unit tests pin each frequency pair plus distinctness from the tick; dogfood injects a recording `AudioContext` and asserts the hint, undo and reset sequences during a real played run. The visual UI is unchanged, so this cycle makes no visual claim and carries no screenshot pair. Cross-principle check: no principle section changed. Serves PRINCIPLE-011 (non-visual feedback) and PRINCIPLE-014 (browser regression pin).

### ADR-030: The first Tab stop is the skip link, and main is its target
- **Date**: 2026-11-07
- **Status**: Accepted
- **Context**: The skip link is first in the document, but boot called `setScreen("title")`, which moved focus to the title `h1`; the first Tab therefore landed on Play and the next on Daily weave, so the skip link was unreachable from the start. `<main id="main">` also had no `tabindex`, so even activating the link could not move focus into the content.
- **Decision**: Add `tabindex="-1"` to `<main id="main">` and add a `firstScreen` guard in `setScreen` that skips the heading focus on the initial screen load only. Later screen changes still focus the new `h1`, and the scroll reset is unchanged.
- **Consequences**: On first load Tab reveals `Skip to content`, Enter focuses main (`#main`), and the next Tab reaches Play; direct deep links start from the document top too. A keyboard user can bypass the title art without changing the visual layout. `scripts/dogfood.mjs` pins the Tab/Enter/Tab order before the rest of the run. Verified by a 1440x900 before/after pair of the focused title. Cross-principle check: no principle section changed. Serves PRINCIPLE-011 (keyboard usability) and PRINCIPLE-014 (browser regression pin).

### ADR-031: A daily link can only open and record the local day
- **Date**: 2026-11-07
- **Status**: Accepted
- **Context**: `boot` passed any `?daily=<date>` value to `openDaily`, and `recordDaily` accepted any valid date key. A played `?daily=2026-11-06` run loaded 6 Kas 2026, solved it, saved `days["2026-11-06"]`, and the chamber index showed 6 Kas solved with a 1-day streak while 7 Kas was missed. ADR-011 and the README say a missed daily cannot be back-filled.
- **Decision**: Add the pure `currentDailyKey(requested, today = dateKey())` helper; it returns the requested key only when it equals today, otherwise today. `openDaily` clamps through it, so past, future or malformed daily links open today's weave. `createDailyLevel` still accepts any key for tests and deterministic generation. A run legitimately started before midnight keeps its original key in memory and may still finish after midnight.
- **Consequences**: Stored or shared old daily links can no longer rewrite the history or streak; the only writable daily is the one the player is actually living in. The unit test covers past, today, empty and undefined keys; dogfood opens yesterday's link and requires today's board plus no daily save. Verified by a same-URL `?daily=2026-11-06` 1440x900 pair. Cross-principle check: no principle section changed. Serves PRINCIPLE-003 (played integrity), PRINCIPLE-011 (a link never surprises) and PRINCIPLE-014 (failing-first regression).

### ADR-032: Even-cut the two 8x8 Act I closers
- **Date**: 2026-11-07
- **Status**: Accepted
- **Context**: Shuttle's stored solution gave one thread 31 of 64 cells (48%) and set the other extremes at 3; Warp Song gave one thread 24 cells (38%). Every 8x8-or-larger chamber from Tapestry onward stayed under a quarter, and the evenness test only started at chamber 13, so the two Act I closers escaped the rule. A played Shuttle run had to draw one violet snake over half the board.
- **Decision**: Mark `warp-song` and `shuttle` as `balanced: true` in `scripts/generate-levels.mjs` and regenerate only those two solutions. The ids, names, sizes and pair counts are unchanged; every other chamber stays bit-identical. Extend the existing evenness test to start at Warp Song (`LEVELS.slice(7)`) with the same quarter-of-the-loom bound, and update the generator comment and README design bullet.
- **Consequences**: Warp Song's longest thread is now 13/64 (20%) and Shuttle's 12/64 (19%), with minimum lengths 8 and 7. All 24 stored solutions still validate as total and solvable. Existing best times and stars remain under the same ids but now describe the refreshed puzzles, the same trade recorded in ADR-021. Verified by a solved-Shuttle 1440x900 before/after pair and scripted plays. Cross-principle check: no principle section changed. Serves PRINCIPLE-003 (measured balance), PRINCIPLE-008 (the thread budget stays distributed) and PRINCIPLE-014 (regression pin).

### ADR-033: Return to the same place in the chamber index
- **Date**: 2026-11-08
- **Status**: Accepted
- **Context**: The index renders 24 cards and `setScreen` always scrolls to the top. A seeded 12-solved save at 390x844 scrolled to Reef Weft (scrollY 2378), opened it, and returned to the top (scrollY 0) with focus on the index heading, so the player had to pass a dozen cards again. On the single-column mobile layout that is most of the screen height.
- **Decision**: When `openBoard` is entered from the levels screen, remember `window.scrollY` and the selector of the card or daily button that opened it. `showLevels({ restore: true })` — used by the game and win Chambers buttons — skips the heading focus, restores the scroll and focuses that same control; entering from the title still starts at the top. The state is in memory only.
- **Consequences**: Returning players land on the card they left, with keyboard focus on it, instead of replaying the scroll. A daily opened from the index returns to the daily button. No save, engine or card-layout change. `scripts/dogfood.mjs` seeds 12 solved chambers, scrolls to Reef Weft, opens and returns, and requires the scroll within 4px and focus on the card. Verified by a same-save 390x844 pair. Cross-principle check: no principle section changed. Serves PRINCIPLE-011 (navigation continuity) and PRINCIPLE-014 (browser regression pin).

### ADR-034: The static shell matches the 24-chamber campaign
- **Date**: 2026-11-08
- **Status**: Accepted
- **Context**: `index.html` still shipped `0 of 18 woven` in the levels header, a count left behind when Act III moved the campaign to 24 chambers, and its title default omitted the `3 stars each` rule. `app.js` overwrites both on boot, so normal play was correct, but the initial HTML paint and any blocked-module load were wrong, and no test tied the static defaults to `TOTAL_CHAMBERS`/`MAX_STARS`. A blocked-app.js capture returned `levelsProgress=0 of 18 woven` and `titleProgress=24 chambers · no account · no network`.
- **Decision**: Update the two static strings to `0 of 24 woven · 0/72 stars` and `24 chambers · 3 stars each · no account · no network`, and add a static test computed from `TOTAL_CHAMBERS` and `MAX_STARS` so a future content change fails rather than silently drifting. No JavaScript behavior changes.
- **Consequences**: The first HTML paint tells the same story as the hydrated game, and the test suite now owns the shell copy. Verified by a 1440x900 blocked-app.js before/after pair with the levels section forced visible. Cross-principle check: no principle section changed. Serves PRINCIPLE-005 (living documentation and shell), PRINCIPLE-011 (cold-start truthfulness) and PRINCIPLE-014 (drift pin).

### ADR-035: No focus rectangle on the help heading
- **Date**: 2026-11-08
- **Status**: Accepted
- **Context**: ADR-025 focuses the help `h2` so the dialog opens at its title and screen readers announce it. Because the heading is not a control, the browser's keyboard/programmatic `:focus-visible` path draws a white `outline: auto` rectangle around `One loom, twenty-four chambers`. A 390x844 `?preview=help` capture and a keyboard-opened dogfood run both show it; the mouse-opened path did not, which is why the cycle-3 check missed it.
- **Decision**: Suppress the outline for `.modal h2:focus` and `.modal h2:focus-visible` only. The heading keeps `tabindex="-1"` and remains the programmatic focus target; it is not tabbable, so no interactive focus indicator is lost.
- **Consequences**: The help title is clean on every open path while focus and screen-reader context stay on the heading. Dogfood now opens help by keyboard and asserts `outlineStyle === "none"` before Escape returns focus to the opener. Verified by a 390x844 before/after pair. Cross-principle check: no principle section changed. Serves PRINCIPLE-011 (clean, usable dialog) and PRINCIPLE-014 (keyboard regression pin).

### ADR-036: Chambers returns to the current chamber card, even after Next
- **Date**: 2026-11-08
- **Status**: Accepted
- **Context**: The index return logic remembered the card that first opened the board. After solving First Thread and advancing through the victory dialog's Next chamber button to Crossweave, the game's Chambers button still focused the First Thread card; a played run reported `active=first-thread` while the game title was Crossweave. The player had moved on, but the index did not.
- **Decision**: `openBoard` now updates `levelsFocus` to the level being opened on every campaign or daily open, while `levelsScroll` is still captured only when the open starts from the levels screen. On restore, the index scrolls to the remembered position, brings the focused card into view if it is outside the viewport, then focuses it.
- **Consequences**: Chambers after Next returns to the card for the chamber the player is actually in; a deep-linked late chamber also scrolls its card into view instead of focusing an off-screen card. The index scroll position is still preserved when it is meaningful. Dogfood solves First Thread, advances to Crossweave and asserts the return card is `crossweave`. Verified by a 1440x900 before/after pair. Cross-principle check: no principle section changed. Serves PRINCIPLE-011 (navigation matches the current context) and PRINCIPLE-014 (browser regression pin).

### ADR-037: The title sound control shares the 44px target
- **Date**: 2026-11-08
- **Status**: Accepted
- **Context**: The title screen's Sound on/off control was a 32px-high text link, while every other button and the game's own sound button use a 44px target. At 390x844 it was the only interactive control below that standard, and the focused outline wrapped a visibly shorter box.
- **Decision**: Make `.sound-toggle` an inline-flex box with `align-items:center`, `min-height:44px` and 2px horizontal padding. The text, underline and focus outline are unchanged; only the hit area and vertical centering grow.
- **Consequences**: The title sound control now matches the game's other targets on touch and keyboard, and its focus box is the same height. The title flow grows by 12px but still fits 390x844. Dogfood asserts the measured height is at least 44 before the keyboard run. Verified by a 390x844 focused before/after pair. Cross-principle check: no principle section changed. Serves PRINCIPLE-011 (usable touch targets) and PRINCIPLE-014 (regression pin).

