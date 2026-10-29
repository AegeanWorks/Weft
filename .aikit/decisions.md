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

