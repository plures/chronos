# Chronos Roadmap

## Role in Plures Ecosystem
Chronos is the observability layer for PluresDB-backed apps. It captures every state diff as a causal graph so developers can trace behavior, query history, and debug without writing manual logs.

## Current State
Chronicle capture, causal chain inference, diffing, time-range queries, trace APIs, retention rules, and time‑travel debugging are implemented. The package ships ESM JS with typings and integrates with Unum. Remaining gaps are around streaming exports, distributed sync for observability, semantic search, and UI surfaces for dashboards.

## Milestones

### Near-term (Q2 2026)
- Stabilize streaming diff output for external sinks (console, file, WebSocket).
- Finish semantic search module and document usage patterns.
- Add PluresDB query helpers for chronicle subgraph retrieval.
- Expand retention policies with pluggable archival targets.

### Mid-term (Q3-Q4 2026)
- Distributed observability via Hyperswarm sync for chronicle graphs.
- Dashboard widgets (Design Dojo) for timeline, causality, and diff inspection.
- Performance tuning for high‑frequency update streams (batching, sampling).
- Better context propagation helpers for browser and server runtimes.

### Long-term
- Unified observability API across Chronos + Praxis decision ledger.
- Visual time‑travel debugger with replay controls and snapshot export.
- Cross‑app tracing (multiple PluresDB instances, correlated contexts).
