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

[Unreleased]: https://github.com/plures/chronos/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/plures/chronos/releases/tag/v0.1.0
