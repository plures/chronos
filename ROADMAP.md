# Chronos Roadmap

## Current: v0.2.0

## Phase 1: Core Stability (v0.3)
- [ ] Diff compression — deduplicate repeated state snapshots
- [ ] Configurable retention — TTL-based pruning of old state entries
- [ ] Batch diff capture — group rapid state changes into single entries
- [ ] Error boundaries — graceful degradation when PluresDB unavailable
- [ ] Performance profiling — measure overhead of state tracking per operation

## Phase 2: Query & Replay (v0.4)
- [ ] Time-travel queries — reconstruct state at any historical timestamp
- [ ] Diff search — find when a specific field changed and by whom
- [ ] State replay — step through state changes forward/backward
- [ ] Aggregate diffs — summarize changes over time periods
- [ ] Export — dump state history as JSON/CSV for external analysis

## Phase 3: Integration (v0.5)
- [ ] Svelte component — `<Chronicle>` wrapper that auto-tracks child state
- [ ] Unum adapter — native integration with @plures/unum reactive stores
- [ ] Praxis integration — constraint history (when did a rule fire? what changed?)
- [ ] PluresDB procedures — chronicle procedure execution and side effects
- [ ] WebSocket push — real-time state change notifications to connected clients

## Phase 4: Visualization (v1.0)
- [ ] Timeline component — visual state history in design-dojo
- [ ] Diff viewer — side-by-side comparison of state snapshots
- [ ] Causal graph — visualize which changes caused other changes
- [ ] Dashboard widget — state health overview for pares-radix

