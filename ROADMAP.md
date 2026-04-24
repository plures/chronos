# chronos Roadmap

## Role in OASIS
Chronos provides graph‑native observability for OASIS applications. It chronicles PluresDB state diffs so Radix, plugins, and agents can debug, audit, and replay state changes without manual logging.

## Current State
- Chronicle capture, causal graph, diffing, and time‑travel APIs are implemented.
- Unum integration exists; no open issues.

## Phase 1 — Reliability & Streaming
- Streaming diff output to sinks (console/file/WebSocket).
- Harden retention policies and archival targets.
- Add chronicle subgraph query helpers for common OASIS workflows.

## Phase 2 — Search & Query UX
- Semantic search over state changes.
- Query helpers for “when did X change” and “what caused Y.”
- Export tooling (JSON/CSV) for audits and external analysis.

## Phase 3 — Distributed Observability
- Chronicle sync across nodes (P2P where available; GitHub relay fallback if needed).
- Context propagation helpers for browser and server runtimes.
- Performance tuning for high‑frequency update streams (batching/sampling).

## Phase 4 — UI Surfaces
- Design‑dojo timeline + diff viewer components.
- Radix dashboard widget for state health and causal hot‑spots.
- Visual time‑travel debugger with replay controls.
