## [0.6.0] — 2026-05-08

- feat: automatic logging via contracts, levels, rolling buffer, and log gate (ADR-0016) (190b170)
- chore(deps-dev): bump svelte in the dev-dependencies group (#99) (b61639e)
- fix: suppress ci-feedback issue spam (24h dedup window) (10a8f3f)
- docs: refresh ROADMAP.md with OASIS strategic alignment (150c75e)
- docs: update copilot-instructions with praxis, design-dojo, automation rules (df5cafb)
- chore(deps-dev): bump the dev-dependencies group with 3 updates (#95) (ce7b041)
- feat(release): add target_version input for milestone-driven releases (d3ca345)
- feat(lifecycle): milestone-close triggers roadmap-aware release (3ff9c0c)
- docs: update copilot-instructions with Plures stack architecture (91c1316)
- docs: update copilot-instructions with Plures stack architecture (20ab16b)

## [0.4.0] — 2026-04-18

- feat(lifecycle v12): auto-release when milestone completes (24487a2)

## [0.3.0] — 2026-04-18

- feat(lifecycle v11): smart CI failure handling — infra vs code (61ccc82)

## [0.2.2] — 2026-04-17

- fix(lifecycle): label-based retry counter + CI fix priority (411ffe6)
- chore(deps-dev): bump the dev-dependencies group with 4 updates (#94) (89c1999)

## [0.2.1] — 2026-04-14

- fix: resolve moderate security vulnerabilities in hono transitive deps (#93) (f69d58e)
- chore(deps-dev): bump the dev-dependencies group with 3 updates (#91) (9200814)
- ci: inline lifecycle workflow — fix schedule failures (2867784)
- docs: add structured ROADMAP.md for automated issue generation (f01b4c2)
- chore: remove redundant workflow — handled by release-reusable.yml (966abd3)

## [0.2.0] — 2026-04-07

- chore: centralize release to org-wide reusable workflow (ab74aef)
- chore: centralize CI to org-wide reusable workflow (ada269a)
- fix: resolve CI deno fmt failures from PR #80 with individually documented re-exports (#90) (7425c3c)
- Initial plan (#89) (52f58de)
- fix: update vite to 8.0.5 to resolve high severity CVEs (CI npm audit fix) (#88) (f9383f9)
- ci: standardize Node version to lts/* — remove hardcoded versions (7c70c1c)
- fix: npm audit — update lodash and path-to-regexp (security) (aacc13e)
- chore(deps-dev): bump the dev-dependencies group with 3 updates (#83) (3b48835)
- chore(deps): bump @plures/praxis in the production-dependencies group (#84) (1c6b7c7)
- style: run deno fmt to fix CI (4d85e2a)
- ci: tech-doc-writer triggers on minor prerelease only [actions-optimization] (4465e47)
- ci: add concurrency group to copilot-pr-lifecycle [actions-optimization] (4041af4)
- ci: centralize lifecycle — event-driven with schedule guard (c52235c)
- ci: remove @copilot mentions from ci-feedback-loop — no comments rule (e6b1bf9)
- refactor: centralize lifecycle — call reusable from plures/repo-template (177b50c)
- refactor: centralize lifecycle — call reusable workflow from praxis-business (fb6e87c)
- chore: add Copilot coding instructions (#67) (8e9c1e7)
- fix: lifecycle v4.4 — catch self-approval error, don't crash on own PRs (65d5e12)
- fix: lifecycle v4.3 — guard notify step, escape PR title in JSON (d8807b2)
- fix: lifecycle v4.2 — filter out release/publish checks from CI evaluation (ad8871c)
- fix: lifecycle v4.1 — process all PRs independently, add Path F debug logging (0f50e1b)
- feat: lifecycle v4 — merge all PRs, Copilot default reviewer, no nudges (cf16938)
- fix(lifecycle): v9.2 — process all PRs per tick (return→continue), widen bot filter (4347d82)
- fix(lifecycle): change return→continue so all PRs process in one tick (5230eb8)
- fix(lifecycle): v9.1 — fix QA dispatch (client_payload as JSON object) (15ec3ec)
- fix(lifecycle): rewrite v9 — apply suggestions, merge, no nudges (4a0bef4)
- chore: license BSL 1.1 (commercial product) (a5e32f8)
- chore: standardize copilot-pr-lifecycle.yml to canonical version (6e86b2b)
- fix: add packages:write + id-token:write to release workflow (71092bb)
- docs: add ROADMAP.md (bace526)
- chore: cleanup and housekeeping (c23dd25)
- chore: add standard CI workflow (ea9409e)
- fix: resolve deno lint no-unused-vars errors (lint-clean 0% → 100%) (#72) (abf95b1)
- test: raise coverage from 0% to 99.24% (target 80%) (#71) (282a324)
- ci: enforce coverage thresholds in CI pipeline (#68) (13aee5f)
- fix: bump @plures/praxis to 2.4.33 to resolve no-known-vulns dimension (#66) (582f1fb)
- docs: add JSDoc to all re-exported symbols — api-documented 0% → 100% (#65) (946d1c3)

# Changelog

All notable changes to `@plures/chronos` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned

- Semantic search over state-change content (vector embeddings via PluresDB)
- Dashboard UI component (`design-dojo` integration)
- PluresDB Hyperswarm sync for distributed multi-node observability

---

## [0.1.1] — 2026-03-26

### Fixed

- **npm publish pipeline** — releases created automatically by `release.yml`
  (via `GITHUB_TOKEN`) do not fire the `release: published` event for other
  workflows (by design in GitHub Actions), so `publish.yml` never ran and the
  package was never pushed to the npm registry.  The `release.yml` workflow now
  includes a second `publish` job that runs immediately after the GitHub release
  is created, resolving the `version-published` dimension (0% → 100%).

---

## [0.1.0] — 2026-03-25

Initial public release of `@plures/chronos`.

### Added

- **Core chronicle** (`@plures/chronos/chronicle`) — `createChronicle()` factory
  that subscribes to a PluresDB instance and records every state diff as a
  `ChronicleNode` in an append-only causal graph.
- **Causal chain inference** (`@plures/chronos/causal`) — automatic causality
  tracking via `AsyncLocalStorage` (`withCause` / `currentCause`). No manual
  instrumentation required.
- **Minimal diff engine** (`@plures/chronos/diff`) — `computeDiff()` produces a
  compact, structural description of the change between two values; used to
  annotate every `ChronicleNode`.
- **Time-range & path queries** (`@plures/chronos/query`) — `query()`,
  `queryByTimeRange()`, `queryByPath()`, `queryByPathPrefix()`, and
  `queryByContext()` utilities operating directly on raw `nodes[]` / `edges[]`
  arrays.
- **Graph-traversal trace** (`@plures/chronos/trace`) — `traceCausalChain()`
  performs BFS forward or backward through the causal edge graph to identify
  root causes or downstream effects.
- **Time-travel debugger** (`@plures/chronos/time-travel`) —
  `createTimeTravelDebugger()` supports `stepForward`, `stepBackward`, `seek`,
  `current`, `snapshot`, and `replay` over a node array.
- **Retention rules** (`@plures/chronos/rules`) — four Praxis rule modules:
  - `diff-classification` — severity classification, change-type detection,
    and impact scoring for every recorded diff.
  - `retention-policy` — TTL-based pruning, quota enforcement, and archival
    triggers.
  - `alerting` — burst detection, critical-spike alerts, and anomaly detection.
  - `integrity` — contiguity checks, gap detection, and replay validation.
- **Praxis engine integration** (`@plures/chronos/praxis`) —
  `createChronosEngine()` wires all four rule modules into a single
  `PraxisEngine` instance ready for production use.
- **Persistent writer** (`src/persistent.js`) — optional write-through layer
  for PluresDB persistence with batched async writes.
- **Semantic indexing** (`src/semantic.js`) — foundation for future vector
  search over chronicle content.
- **Automated vulnerability scanning** — `npm audit` CI step added to the
  security-audit workflow; all direct and transitive dependencies verified
  clean on release.

### Architecture

- ESM-only package (`"type": "module"`); no CommonJS exports.
- Requires Node.js ≥ 18 or a modern browser (no `node:async_hooks` in browser
  builds; automatically shimmed via `package.json#browser`).
- Zero runtime dependencies beyond `@plures/praxis`.

---

[Unreleased]: https://github.com/plures/chronos/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/plures/chronos/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/plures/chronos/releases/tag/v0.1.0
