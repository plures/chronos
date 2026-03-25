# @plures/chronos — API Reference

Graph-native application state chronicle — zero-effort observability through PluresDB state diffs.

> **Status:** All exports are ESM-only (`"type": "module"` in `package.json`).

---

## Table of Contents

1. [Main entry (`@plures/chronos`)](#main-entry-plureschronos)
2. [Chronicle (`@plures/chronos/chronicle`)](#chronicle-plureschronoschronicle)
3. [Diff engine (`@plures/chronos/diff`)](#diff-engine-plureschronosdiff)
4. [Causal context (`@plures/chronos/causal`)](#causal-context-plureschronoscausal)
5. [Query API (`@plures/chronos/query`)](#query-api-plureschronosquery)
6. [Trace API (`@plures/chronos/trace`)](#trace-api-plureschronostrace)
7. [Time-travel debugger (`@plures/chronos/time-travel`)](#time-travel-debugger-plureschronostime-travel)
8. [Praxis integration (`@plures/chronos/praxis`)](#praxis-integration-plureschronospraxis)
9. [Rules barrel (`@plures/chronos/rules`)](#rules-barrel-plureschronosrules)
10. [Types](#types)

---

## Main entry `@plures/chronos`

```js
import { createChronos, createNode, withCause, currentCause } from '@plures/chronos';
```

The legacy entry point. For new projects prefer `@plures/chronos/chronicle`.

### `createChronos(db, options?)`

Create a Chronos instance that subscribes to a PluresDB instance and records
all state changes as a causal graph.

**Parameters**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `db` | `object` | — | PluresDB instance (must support `.on()` subscriptions) |
| `options.contextId` | `string \| null` | `null` | Default context applied to all captured nodes |
| `options.batchMs` | `number` | `50` | Debounce interval (ms) for batched writes |
| `options.maxBatch` | `number` | `100` | Maximum nodes flushed per tick |
| `options.writer` | `object \| null` | `null` | Persistent writer from `createPersistentWriter` |

**Returns** `ChronosInstance`

| Member | Type | Description |
|--------|------|-------------|
| `start()` | `() => void` | Begin subscribing (called automatically on creation) |
| `stop()` | `() => void` | Unsubscribe and flush remaining nodes |
| `flush()` | `() => void` | Force-flush the pending write queue |
| `trace(nodeId, opts?)` | `(string, object?) => ChronicleNode[]` | Walk causal graph from a node |
| `range(startMs, endMs)` | `(number, number) => ChronicleNode[]` | All nodes within a time range |
| `subgraph(ctxId)` | `(string) => ChronicleNode[]` | All nodes belonging to a context |
| `history(path)` | `(string) => ChronicleNode[]` | All changes for a path, sorted by time |
| `stats()` | `() => { nodes, edges, pending }` | Summary counters |
| `_nodes` | `ChronicleNode[]` | Internal node array (testing only) |
| `_edges` | `ChronicleEdge[]` | Internal edge array (testing only) |

**Example**

```js
import { createChronos } from '@plures/chronos';

const chronicle = createChronos(db, { contextId: 'session:abc' });

// Later, query the causal chain
const causes = chronicle.trace(nodeId, { direction: 'backward' });
chronicle.stop();
```

---

### `createNode(path, before, after, contextId?)`

Create a raw `ChronicleNode` from a state diff without attaching it to any
PluresDB subscription.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `path` | `string` | PluresDB path that changed |
| `before` | `*` | Previous value (`null` for creates) |
| `after` | `*` | New value (`null` for deletes) |
| `contextId` | `string \| undefined` | Session / request context ID |

**Returns** `ChronicleNode`

---

### `withCause(causeId, fn)`

Run a function inside a causal context so that all nodes created during
execution carry `causeId` as their parent.

See [`@plures/chronos/causal`](#causal-context-plureschronoscausal).

---

### `currentCause()`

Return the causal parent ID for the current execution context, or `null`.

See [`@plures/chronos/causal`](#causal-context-plureschronoscausal).

---

## Chronicle `@plures/chronos/chronicle`

```js
import { createChronicle, createChronicleNode, withCause, currentCause }
  from '@plures/chronos/chronicle';
```

The canonical, up-to-date Chronicle implementation.
Prefer this over the main entry for new projects.

### `createChronicle(db, options?)`

Create a Chronicle instance that wraps a PluresDB instance and records
all state changes as a causal graph with minimal JSON diffs.

**Parameters**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `db` | `object` | — | PluresDB instance (must support `.on()` subscriptions) |
| `options.contextId` | `string \| null` | `null` | Default context applied to all captured nodes |
| `options.debounceMs` | `number` | `0` | When > 0, coalesces rapid changes per path into a single node |
| `options.maxBatch` | `number` | `100` | Maximum nodes flushed per microtask tick |
| `options.writer` | `object \| null` | `null` | Persistent writer (e.g. from `createPersistentWriter`) |

**Returns** `ChronicleInstance`

| Member | Type | Description |
|--------|------|-------------|
| `start()` | `() => void` | Begin subscribing (called automatically on creation) |
| `stop()` | `() => void` | Stop subscription and flush all pending data |
| `flush()` | `() => void` | Force-flush pending writes |
| `trace(nodeId, opts?)` | `(string, TraceOptions?) => ChronicleNode[]` | Walk causal graph |
| `range(startMs, endMs)` | `(number, number) => ChronicleNode[]` | Nodes in a time range |
| `subgraph(ctxId)` | `(string) => ChronicleNode[]` | Nodes in a context |
| `history(path)` | `(string) => ChronicleNode[]` | All changes for a path |
| `stats()` | `() => ChronicleStats` | Summary counters |
| `_nodes` | `ChronicleNode[]` | Internal node array (testing only) |
| `_edges` | `ChronicleEdge[]` | Internal edge array (testing only) |

**`TraceOptions`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `direction` | `'backward' \| 'forward'` | `'backward'` | Walk toward root causes or downstream effects |
| `maxDepth` | `number` | `10` | Maximum hops from the starting node |

**`ChronicleStats`**

```ts
{ nodes: number; edges: number; pending: number }
```

**Throws** `Error` — if `db` does not have an `.on()` subscription method.

**Example**

```js
import { createChronicle } from '@plures/chronos/chronicle';

const chronicle = createChronicle(db, {
  contextId: 'session:user-42',
  debounceMs: 100,
});

// Record some state changes via `db`, then inspect:
const history = chronicle.history('todos.1');
console.log(history[0].diff.minimal); // → { op: 'create', value: { text: 'buy milk' } }

chronicle.stop();
```

---

### `createChronicleNode(path, before, after, contextId?)`

Create a `ChronicleNode` with a minimal structural diff computed by the diff engine.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `path` | `string` | PluresDB path that changed |
| `before` | `*` | Previous value (`null` for creates) |
| `after` | `*` | New value (`null` for deletes) |
| `contextId` | `string \| undefined` | Session / request context ID |

**Returns** `ChronicleNode`

---

## Diff engine `@plures/chronos/diff`

```js
import { computeDiff } from '@plures/chronos/diff';
```

### `computeDiff(before, after)`

Compute the minimal structural diff between two JSON-serializable values.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `before` | `*` | Previous value |
| `after` | `*` | New value |

**Returns** `DiffDescriptor | null` — `null` when the values are identical.

**`DiffDescriptor`** variants:

| Shape | Meaning |
|-------|---------|
| `{ op: 'create', value }` | `null/undefined` → value |
| `{ op: 'delete', from }` | value → `null/undefined` |
| `{ op: 'replace', from, value }` | Primitive or type change |
| `{ op: 'patch', changes: Record<string, DiffDescriptor> }` | Object or array field-level diff |

**Example**

```js
import { computeDiff } from '@plures/chronos/diff';

computeDiff(null, { text: 'hello' });
// → { op: 'create', value: { text: 'hello' } }

computeDiff({ text: 'hello' }, { text: 'world' });
// → { op: 'patch', changes: { text: { op: 'replace', from: 'hello', value: 'world' } } }

computeDiff({ text: 'hello' }, { text: 'hello' });
// → null  (no change)
```

---

## Causal context `@plures/chronos/causal`

```js
import { withCause, currentCause } from '@plures/chronos/causal';
```

Propagates causal parent IDs through async call chains.
Uses `AsyncLocalStorage` in Node.js and a simple stack in browsers.

### `currentCause()`

Return the causal parent ID active for the current execution context.

**Returns** `string | null`

---

### `withCause(causeId, fn)`

Execute `fn` inside a causal scope so that every node created during
execution automatically receives `causeId` as its parent.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `causeId` | `string` | ID of the parent node |
| `fn` | `() => T` | Synchronous or async function to run inside the scope |

**Returns** `T` — the return value (or resolved value) of `fn`.

**Example**

```js
import { withCause, currentCause } from '@plures/chronos/causal';

await withCause('chrono:root-node', async () => {
  console.log(currentCause()); // → 'chrono:root-node'
  await doWork();              // nodes created here will have cause='chrono:root-node'
});
```

---

## Query API `@plures/chronos/query`

```js
import { query, queryByTimeRange, queryByPath, queryByPathPrefix, queryByContext }
  from '@plures/chronos/query';
```

Pure, composable query functions that work on plain arrays of `ChronicleNode`
and `ChronicleEdge` objects — both in-memory and loaded from persistent storage.

### `queryByTimeRange(nodes, startMs, endMs)`

Return all nodes whose `timestamp` falls within `[startMs, endMs]` (inclusive),
sorted ascending by timestamp.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `nodes` | `ChronicleNode[]` | Nodes to filter |
| `startMs` | `number` | Range start (Unix ms, inclusive) |
| `endMs` | `number` | Range end (Unix ms, inclusive) |

**Returns** `ChronicleNode[]`

---

### `queryByPath(nodes, path)`

Return all nodes recorded at an exact `path`, sorted ascending by timestamp.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `nodes` | `ChronicleNode[]` | Nodes to filter |
| `path` | `string` | Exact PluresDB path to match |

**Returns** `ChronicleNode[]`

---

### `queryByPathPrefix(nodes, prefix)`

Return all nodes whose `path` starts with `prefix`, sorted ascending by timestamp.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `nodes` | `ChronicleNode[]` | Nodes to filter |
| `prefix` | `string` | Path prefix (e.g. `'todos.'` to scope to sub-paths) |

**Returns** `ChronicleNode[]`

> **Note:** The separator is not added automatically — `'todos'` will also
> match `'todosExtra'`. Use `'todos.'` to strictly scope to children.

---

### `queryByContext(nodes, edges, contextId)`

Return all nodes belonging to a session / request context, sorted ascending
by timestamp.

Context membership is determined either by a `'context'` edge from
`contextId` to the node **or** by the node's own `context` field.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `nodes` | `ChronicleNode[]` | Nodes to filter |
| `edges` | `ChronicleEdge[]` | All edges (for context-edge lookup) |
| `contextId` | `string` | Context ID to match |

**Returns** `ChronicleNode[]`

---

### `query(nodes, edges?, options?)`

Run one or more filters over nodes in a single pass with logical AND
(all supplied filters are applied as intersection).

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `nodes` | `ChronicleNode[]` | Nodes to filter |
| `edges` | `ChronicleEdge[]` | Required when `contextId` is supplied |
| `options.startMs` | `number` | Lower timestamp bound (inclusive) |
| `options.endMs` | `number` | Upper timestamp bound (inclusive) |
| `options.path` | `string` | Exact path match |
| `options.pathPrefix` | `string` | Path prefix match (used only when `path` is not set) |
| `options.contextId` | `string` | Session / request context filter |
| `options.limit` | `number` | Maximum number of results |
| `options.offset` | `number` | Number of results to skip (pagination) |

**Returns** `ChronicleNode[]` — sorted ascending by timestamp.

**Example**

```js
import { query } from '@plures/chronos/query';

// All changes to the 'todos' subtree in the last hour, newest 20
const now = Date.now();
const results = query(nodes, edges, {
  pathPrefix: 'todos.',
  startMs: now - 60 * 60 * 1000,
  endMs: now,
  limit: 20,
});
```

---

## Trace API `@plures/chronos/trace`

```js
import { traceCausalChain } from '@plures/chronos/trace';
```

### `traceCausalChain(nodes, edges, nodeId, options?)`

Walk the causal graph starting from `nodeId` and return the ordered list of
`ChronicleNode` objects encountered.

**Parameters**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `nodes` | `ChronicleNode[]` | — | All available nodes |
| `edges` | `ChronicleEdge[]` | — | All available edges |
| `nodeId` | `string` | — | ID of the starting node |
| `options.direction` | `'backward' \| 'forward'` | `'backward'` | Traverse toward root causes or downstream effects |
| `options.maxDepth` | `number` | `10` | Maximum hops from the starting node |
| `options.edgeType` | `string` | `'causes'` | Edge type to follow (`'context'` for session subgraphs) |

**Returns** `ChronicleNode[]` — ordered starting from `nodeId`.

**Example**

```js
import { traceCausalChain } from '@plures/chronos/trace';

// What caused this error?
const causes = traceCausalChain(nodes, edges, errorNodeId, { direction: 'backward' });

// What did this action trigger?
const effects = traceCausalChain(nodes, edges, actionNodeId, { direction: 'forward' });
```

---

## Time-travel debugger `@plures/chronos/time-travel`

```js
import { createTimeTravelDebugger } from '@plures/chronos/time-travel';
```

### `createTimeTravelDebugger(nodes, options?)`

Create a time-travel debugger that steps forward and backward through a
filtered timeline of `ChronicleNode` objects.

The debugger maintains a **cursor** starting at `-1` (before the timeline).
Each `stepForward()` / `stepBackward()` call advances or retreats by one node.

**Parameters**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `nodes` | `ChronicleNode[]` | — | Source nodes to replay |
| `options.path` | `string` | — | Limit the timeline to a single path |
| `options.startMs` | `number` | — | Lower timestamp bound (inclusive) |
| `options.endMs` | `number` | — | Upper timestamp bound (inclusive) |

**Returns** `TimeTravelDebugger`

**`TimeTravelDebugger`**

| Member | Type | Description |
|--------|------|-------------|
| `cursor` | `number` (readonly) | Current zero-based cursor index; `-1` before the timeline |
| `length` | `number` (readonly) | Total nodes in the filtered timeline |
| `canStepForward` | `boolean` (readonly) | Whether `stepForward()` would move the cursor |
| `canStepBackward` | `boolean` (readonly) | Whether `stepBackward()` would move the cursor |
| `stepForward()` | `() => boolean` | Advance by one step; returns `false` at the end |
| `stepBackward()` | `() => boolean` | Retreat by one step; returns `false` before the start |
| `seek(index)` | `(number) => void` | Jump to an arbitrary timeline index (valid: `-1` to `length - 1`) |
| `current()` | `() => ChronicleNode \| null` | Node at the cursor, or `null` when before the timeline |
| `snapshot()` | `() => Record<string, *>` | Full state map (`path → currentValue`) at cursor position |
| `replay()` | `() => Generator<ChronicleNode>` | Lazy generator yielding each remaining node |
| `_timeline` | `ChronicleNode[]` | Internal filtered timeline (testing only) |

**Throws** `RangeError` — if `seek(index)` is called with an out-of-range index.

**Example**

```js
import { createTimeTravelDebugger } from '@plures/chronos/time-travel';

const dbg = createTimeTravelDebugger(chronicle._nodes);

while (dbg.stepForward()) {
  const node = dbg.current();
  console.log(node.path, '->', node.diff.after);
}

// Or use the generator:
for (const node of dbg.replay()) {
  console.log(node.path, '->', node.diff.after);
}

// Jump to a specific point and inspect state
dbg.seek(5);
console.log(dbg.snapshot()); // → { 'todos.1': { text: 'buy milk' }, ... }
```

---

## Praxis integration `@plures/chronos/praxis`

```js
import { createChronosEngine } from '@plures/chronos/praxis';
```

### `createChronosEngine(options?)`

Create a Praxis logic engine pre-loaded with all four Chronos rule modules:

- `diff-classification` — severity, change type, impact scoring
- `retention-policy` — snapshot pruning, quota enforcement, archival
- `alerting` — burst detection, critical spike, anomaly detection
- `integrity` — contiguity, gap detection, replay validation

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `options.initialContext` | `ChronosContext` | Override initial context values |

**`ChronosContext`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `lastClassified` | `object \| null` | `null` | Most recently classified diff metadata |
| `maxNodes` | `number \| null` | `null` | Active quota ceiling |
| `burstThreshold` | `number \| null` | `null` | Active burst alert threshold |
| `currentChain` | `Array \| null` | `null` | Current causal chain being inspected |

**Returns** `LogicEngine<ChronosContext>`

**Example**

```js
import { createChronosEngine } from '@plures/chronos/praxis';

const engine = createChronosEngine();

const result = engine.step([{
  tag: 'chronos.diff.recorded',
  payload: {
    nodeId: 'chrono:1',
    path: 'todos.1',
    before: null,
    after: { text: 'hello' },
  },
}]);

console.log(result.state.facts);
// → [{ tag: 'chronos.diff.classified', payload: { changeType: 'create', ... } }, ...]
```

This module also re-exports all rule modules and event-tag constants for
convenience — see the [Rules barrel](#rules-barrel-plureschronosrules) below.

---

## Rules barrel `@plures/chronos/rules`

```js
import {
  // Diff classification
  diffClassificationModule, DIFF_RECORDED,
  classifyChangeTypeRule, assignSeverityRule, scoreImpactRule, validChangeTypeConstraint,

  // Retention policy
  retentionPolicyModule, RETENTION_AUDIT_REQUESTED,
  DEFAULT_TTL_MS, DEFAULT_MAX_NODES,
  agePruningRule, quotaEnforcementRule, archivalGateRule, positiveQuotaConstraint,

  // Alerting
  alertingModule, ALERT_EVALUATION_REQUESTED,
  DEFAULT_BURST_THRESHOLD, DEFAULT_BURST_WINDOW_MS,
  DEFAULT_CRITICAL_RATIO_THRESHOLD, DEFAULT_ANOMALY_Z_THRESHOLD,
  burstDetectionRule, criticalSpikeRule, impactAnomalyRule, positiveBurstThresholdConstraint,

  // Integrity
  integrityModule, INTEGRITY_CHECK_REQUESTED, REPLAY_VALIDATION_REQUESTED,
  contiguityCheckRule, gapDetectionRule, replayValidationRule, contiguousChainConstraint,
} from '@plures/chronos/rules';
```

Barrel re-export of all four rule modules.  Import individual modules instead
of registering the entire barrel when only a subset is needed.

### Diff Classification (`diff-classification`)

| Export | Kind | Description |
|--------|------|-------------|
| `DIFF_RECORDED` | `string` | Event tag: `'chronos.diff.recorded'` |
| `classifyChangeTypeRule` | Rule | Classifies diffs as `create`, `update`, or `delete` |
| `assignSeverityRule` | Rule | Assigns `info`, `warning`, or `critical` severity |
| `scoreImpactRule` | Rule | Computes a 0–100 impact score |
| `validChangeTypeConstraint` | Constraint | Prevents invalid change types |
| `diffClassificationModule` | Module | Bundles all of the above |

### Retention Policy (`retention-policy`)

| Export | Kind | Description |
|--------|------|-------------|
| `DEFAULT_TTL_MS` | `number` | Default max age before pruning: 7 days |
| `DEFAULT_MAX_NODES` | `number` | Default node quota: 10 000 |
| `RETENTION_AUDIT_REQUESTED` | `string` | Event tag: `'chronos.retention.auditRequested'` |
| `agePruningRule` | Rule | Marks nodes older than TTL as prunable |
| `quotaEnforcementRule` | Rule | Marks oldest nodes when count exceeds quota |
| `archivalGateRule` | Rule | Flags critical nodes for archival |
| `positiveQuotaConstraint` | Constraint | Guards against zero or negative quota |
| `retentionPolicyModule` | Module | Bundles all of the above |

### Alerting (`alerting`)

| Export | Kind | Description |
|--------|------|-------------|
| `DEFAULT_BURST_THRESHOLD` | `number` | Default max diffs per burst window: 50 |
| `DEFAULT_BURST_WINDOW_MS` | `number` | Default burst window: 5 000 ms |
| `DEFAULT_CRITICAL_RATIO_THRESHOLD` | `number` | Default critical-ratio ceiling: 0.25 |
| `DEFAULT_ANOMALY_Z_THRESHOLD` | `number` | Default anomaly Z-score: 2.5 |
| `ALERT_EVALUATION_REQUESTED` | `string` | Event tag: `'chronos.alert.evaluationRequested'` |
| `burstDetectionRule` | Rule | Fires when diff rate exceeds the burst threshold |
| `criticalSpikeRule` | Rule | Fires when critical-severity ratio is too high |
| `impactAnomalyRule` | Rule | Fires when impact Z-score exceeds the threshold |
| `positiveBurstThresholdConstraint` | Constraint | Guards against non-positive burst threshold |
| `alertingModule` | Module | Bundles all of the above |

### Integrity (`integrity`)

| Export | Kind | Description |
|--------|------|-------------|
| `INTEGRITY_CHECK_REQUESTED` | `string` | Event tag: `'chronos.integrity.checkRequested'` |
| `REPLAY_VALIDATION_REQUESTED` | `string` | Event tag: `'chronos.integrity.replayValidationRequested'` |
| `contiguityCheckRule` | Rule | Verifies no gaps in a causal chain |
| `gapDetectionRule` | Rule | Detects missing causal edges |
| `replayValidationRule` | Rule | Validates replay checksum matches expected |
| `contiguousChainConstraint` | Constraint | Enforces contiguous causal chain invariant |
| `integrityModule` | Module | Bundles all of the above |

---

## Types

### `ChronicleNode`

```ts
interface ChronicleNode {
  /** Unique node ID (format: `chrono:{timestamp}-{counter}`) */
  id: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** PluresDB path that changed (e.g. `'todos.abc123'`) */
  path: string;
  diff: {
    /** Previous value; `null` for creates */
    before: unknown;
    /** New value; `null` for deletes */
    after: unknown;
    /** Minimal structural diff from `computeDiff()` — present in chronicle nodes only */
    minimal?: DiffDescriptor | null;
  };
  /** ID of the node that caused this change, or `null` */
  cause: string | null;
  /** Session / request context ID, or `null` */
  context: string | null;
}
```

### `ChronicleEdge`

```ts
interface ChronicleEdge {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Edge type */
  type: 'causes' | 'context' | 'reverts' | 'concurrent';
  /** Unix timestamp in milliseconds */
  timestamp: number;
}
```

### `DiffDescriptor`

```ts
type DiffDescriptor =
  | { op: 'create'; value: unknown }
  | { op: 'delete'; from: unknown }
  | { op: 'replace'; from: unknown; value: unknown }
  | { op: 'patch'; changes: Record<string | number, DiffDescriptor> };
```
