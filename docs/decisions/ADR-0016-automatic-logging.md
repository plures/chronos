# ADR-0016: Logging as a Consequence, Not an Action

**Status:** Accepted  
**Date:** 2026-05-08  
**Author:** kbristol  
**Scope:** @plures/chronos, @plures/praxis, PluresDB, pares-radix

## Context

Chronos was created to eliminate manual logging. But today, developers still manually call `ChronosTimeline.record()` and `createChronicle()`. The wiring is explicit — if you forget it, you get nothing. This defeats the purpose.

The thesis: **if you use Praxis, logging happens automatically.** No wiring, no manual calls. Logging is a consequence of contracts being evaluated, not a thing anyone does.

## Decision

### 1. All State Goes Through PluresDB — Last-State Only

Every mutation flows through PluresDB. The DB holds **only the current state** of each key — not history. When a key is written, the previous value is overwritten. This keeps DB size bounded to `O(keys)`, not `O(mutations)`.

```
App code → mutate(key, value) → PluresDB overwrites key
```

### 2. Writes Trigger Procedures — Procedures Decide What Gets Logged

PluresDB procedures fire on every write. The procedure evaluates the praxis contract for that key's namespace and decides:

- **Whether** to log (based on log level)
- **What** to log (full state, diff, or just metadata)
- **Where** to log (chronos file sink, plures-object, another DB namespace)

```
PluresDB write → procedure fires → contract evaluated → chronos sink (or not)
```

### 3. Contracts Define Log Levels

Logging levels are contract properties, not runtime configuration scattered across code. The contract is the single declaration of what matters.

```
contract "agent.tool-invocation" {
  level: info
  level_on_error: verbose
  retention: 7d
  sink: file
}

contract "agent.heartbeat" {
  level: debug
  retention: 1d
  sink: file
}

contract "agent.model-call" {
  level: warn
  retention: 30d
  sink: file
}
```

### 4. Log Levels

| Level     | What gets captured                      | Default sink         |
|-----------|-----------------------------------------|----------------------|
| `error`   | Failures, constraint violations         | File (with 5s buffer)|
| `warn`    | Degraded states, approaching limits     | File                 |
| `info`    | Significant state transitions           | File (pruned by TTL) |
| `debug`   | All state changes                       | File (short TTL)     |
| `verbose` | Everything incl. intermediate states    | Rolling DB buffer only|

The active log level is a single PluresDB key (`config:log-level`). Contracts at or above the active level produce log entries. Below it, they don't — unless error escalation triggers (see §5).

### 5. The 5-Second Rolling Buffer

This is the key innovation for efficient error debugging:

1. **All writes** (regardless of log level) go into a rolling 5-second window in a dedicated PluresDB namespace (`_buffer:`).
2. The buffer is a ring — old entries are overwritten as new ones arrive. Cost: bounded RAM proportional to write throughput × 5 seconds.
3. **If no error occurs** within the window, nothing is persisted to file. The buffer just rolls forward.
4. **If an error occurs**, the procedure:
   - Freezes the buffer
   - Flushes the entire 5-second window + the error to the chronos file sink
   - Resumes rolling

Result: you get full verbose context around every error, but pay zero disk cost in the happy path.

```
Time: ──────────────────────────────────────►
       [verbose verbose verbose verbose verbose]  ← rolling, overwriting
                                          ↑ ERROR
       [all 5 seconds + error] → flush to file
```

### 6. Chronos Becomes a Compiled Artifact

Today: developer writes `ChronosTimeline.record(...)` calls by hand.

After: developer writes contracts. At build time, contracts compile into PluresDB procedures. Those procedures are what call the chronos sink. Nobody manually calls `record()`.

```
Build time:
  contract DSL → compiler → PluresDB procedure definitions

Runtime:
  PluresDB write → procedure fires → chronos file sink
```

The `@plures/chronos` JS package becomes a **read layer** — querying the timeline, rendering in design-dojo, time-travel debugging. It does not write. Writing is the procedure's job.

### 7. Praxis Logic Lives in PluresDB

Praxis rules, contracts, and constraints are PluresDB data — not TypeScript files, not Rust structs. The Rust code in pares-radix is the **execution engine** for side effects (write file, send network, evaluate condition). The logic itself is data.

This means:
- Rules are queryable (`"show me all contracts with level: error"`)
- Rules are runtime-modifiable (change log level without recompile)
- Rules compose via graph relationships (contract → procedure → sink)
- Rules replicate via Hyperswarm (same constraints across machines)

### 8. Disk/RAM Budget

| Resource | Budget strategy |
|----------|----------------|
| PluresDB state | Last-state only per key. `O(keys)`, not `O(mutations)` |
| Rolling buffer | 5-second window. `O(write_rate × 5s)`. Bounded. |
| Chronos files | TTL-based retention per contract. Procedures prune expired entries. |
| Total disk | Configurable ceiling (e.g. 500MB). Oldest files pruned first when hit. |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Application                                         │
│  mutate("sprint/current", data)                      │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│  PluresDB                                            │
│                                                      │
│  ┌─────────────┐   ┌──────────────┐                  │
│  │ State keys  │   │ _buffer:     │ ← 5s rolling     │
│  │ (last val)  │   │ (ring buffer)│                   │
│  └──────┬──────┘   └──────┬───────┘                  │
│         │                 │                           │
│  ┌──────▼─────────────────▼───────┐                  │
│  │  Procedure Engine              │                  │
│  │  ┌───────────────────────┐     │                  │
│  │  │ Contract lookup       │     │                  │
│  │  │ (key namespace →      │     │                  │
│  │  │  contract → level)    │     │                  │
│  │  └───────────┬───────────┘     │                  │
│  │              │                 │                  │
│  │  ┌───────────▼───────────┐     │                  │
│  │  │ Level gate            │     │                  │
│  │  │ active >= contract?   │     │                  │
│  │  │ error escalation?     │     │                  │
│  │  └───────────┬───────────┘     │                  │
│  │              │ yes             │                  │
│  │  ┌───────────▼───────────┐     │                  │
│  │  │ Chronos sink (Rust)   │     │                  │
│  │  │ - JSONL file write    │     │                  │
│  │  │ - plures-object put   │     │                  │
│  │  └───────────────────────┘     │                  │
│  └────────────────────────────────┘                  │
│                                                      │
│  ┌──────────────────────────────┐                    │
│  │ Contracts (data, not code)   │                    │
│  │ Constraints (data)           │                    │
│  │ Procedures (data)            │                    │
│  └──────────────────────────────┘                    │
└──────────────────────────────────────────────────────┘
         │
         ▼ (read-only)
┌──────────────────────────┐
│  @plures/chronos (JS)    │
│  - Timeline queries      │
│  - Time-travel UI        │
│  - Causal graph viz      │
└──────────────────────────┘
```

## Consequences

### What changes
- `ChronosTimeline.record()` is no longer called by application code — procedures handle it
- Contracts get `level`, `level_on_error`, `retention`, `sink` fields
- PluresDB gets a `_buffer:` namespace with ring-buffer semantics
- Build step compiles contracts → procedure definitions
- `@plures/chronos` JS becomes read-only (queries, UI, time-travel)

### What stays the same
- ChronicleNode format (the entry shape)
- Causal chain structure (parent_id linking)
- JSONL file output format
- PluresDB as primary storage
- Praxis rule/contract DSL (extended, not replaced)

### Anti-patterns (these are now bugs)
- Calling `ChronosTimeline.record()` directly from application code
- Creating separate loggers (`tracing::info!`, `console.log`) for business events
- Configuring log levels in environment variables or config files (use contracts)
- Storing full history in the main PluresDB namespace (use sinks)

## Implementation Order

1. **Contract schema extension** — add `level`, `level_on_error`, `retention`, `sink` to contract type in PluresDB
2. **Rolling buffer namespace** — `_buffer:` with configurable window (default 5s) and ring semantics in PluresDB/Rust
3. **Procedure: log-gate** — evaluates contract level vs active level, writes to sink
4. **Procedure: error-escalation** — on error event, freeze + flush buffer
5. **Contract compiler** — build step that reads contract DSL, emits PluresDB procedure definitions
6. **Deprecate manual record()** — mark as `@deprecated`, add lint/warning
7. **Chronos JS refactor** — strip write paths, keep read/query/UI
8. **Retention pruner** — procedure that runs on schedule, prunes expired entries per contract TTL
