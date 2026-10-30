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

