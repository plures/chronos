# Chronos

**Graph-native application state chronicle — zero-effort observability through PluresDB state diffs.**

> "The best log is one no developer had to write."

[![CI](https://github.com/plures/chronos/actions/workflows/ci-feedback-loop.yml/badge.svg)](https://github.com/plures/chronos/actions/workflows/ci-feedback-loop.yml)
[![npm version](https://img.shields.io/npm/v/@plures/chronos.svg)](https://www.npmjs.com/package/@plures/chronos)
[![License: AGPL-3.0-or-later](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg)](./LICENSE)

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [The Problem](#the-problem)
- [The Insight](#the-insight)
- [How It Works](#how-it-works)
- [The Graph Model](#the-graph-model)
- [Querying](#querying)
- [Integration with Unum](#integration-with-unum)
- [Architecture](#architecture)
- [Design Principles](#design-principles)
- [Development](#development)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Security](#security)
- [Part of the Plures Ecosystem](#part-of-the-plures-ecosystem)
- [License](#license)

## Installation

```bash
npm install @plures/chronos
```

> Requires Node.js ≥ 18 or a modern browser. ESM only.

## Quick Start

```javascript
import { createChronicle } from '@plures/chronos/chronicle';

// One line. Every state change is now chronicled.
const chronicle = createChronicle(db);

// Inspect history
const history = chronicle.history('todos.1');
// → [{ id, timestamp, path, diff: { before: null, after: { text: 'buy milk' } }, ... }]

chronicle.stop();
```

📖 **[Full API Reference →](./docs/api.md)**

## The Problem

Traditional application logging is broken:

- **Manual** — developers decide what to log, inevitably missing what matters
- **Flat** — lines in a file with no relationships or causality
- **Lossy** — you only see what someone thought to capture
- **Noisy** — 90% garbage until something breaks, then the 10% you need is missing

## The Insight

If your application state is already reactive (via [plures/unum](https://github.com/plures/unum)), then **logging is just the chain of diffs recorded in time**. Every state change is a graph node. Every causal relationship is an edge. No developer effort required.

## How It Works

```
Application (using unum)
    │
    │  state diffs (automatic via unum subscriptions)
    ▼
┌─────────────────────────────┐
│  Chronos                    │
│  • Captures unum state diffs│
│  • Builds causal chain      │
│  • Timestamps each node     │
│  • Zero configuration       │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  PluresDB                   │
│  • Graph storage            │
│  • Time-series indexing     │
│  • Vector search            │
│  • Hyperswarm P2P sync      │
└─────────────────────────────┘
```

## The Graph Model

Instead of flat log lines:
```
[INFO] 2026-03-18T15:30:00 User clicked submit
[INFO] 2026-03-18T15:30:01 Form validated
[INFO] 2026-03-18T15:30:01 API call POST /submit
[ERROR] 2026-03-18T15:30:02 Request failed: 500
```

Chronos captures a **state graph**:

```
UserAction(click_submit)
  ├─causes→ StateChange(form.validated = true)
  │           ├─causes→ APICall(POST /submit)
  │           │           └─causes→ StateChange(request.error = "500")
  │           └─causes→ UIUpdate(spinner.visible = true)
  └─context→ Session(user_id: 7, page: /checkout)
```

## Querying

Replace `grep "ERROR" | tail -100` with graph queries:

```javascript
import { createChronicle } from '@plures/chronos/chronicle';
import { traceCausalChain } from '@plures/chronos/trace';
import { query } from '@plures/chronos/query';
import { createTimeTravelDebugger } from '@plures/chronos/time-travel';

const chronicle = createChronicle(db, { contextId: 'session:abc123' });

// What caused this error state?
const causes = traceCausalChain(
  chronicle._nodes, chronicle._edges, errorNodeId, { direction: 'backward' }
);

// What did this user action affect?
const effects = traceCausalChain(
  chronicle._nodes, chronicle._edges, actionNodeId, { direction: 'forward' }
);

// Everything that changed in this session
const sessionNodes = query(chronicle._nodes, chronicle._edges, {
  contextId: 'session:abc123',
});

// All changes to 'todos' in the last hour
const recentTodos = query(chronicle._nodes, [], {
  pathPrefix: 'todos.',
  startMs: Date.now() - 60 * 60 * 1000,
});

// Step through history interactively
const debugger_ = createTimeTravelDebugger(chronicle._nodes);
while (debugger_.stepForward()) {
  console.log(debugger_.current().path, debugger_.snapshot());
}
```

See [`docs/api.md`](./docs/api.md) for the complete API reference.

## Integration with Unum

Chronos hooks into unum's reactive subscriptions automatically:

```javascript
import { createChronos } from '@plures/chronos';
import { pluresData } from '@plures/unum';

// One line. That's it. Every state change is now chronicled.
const chronicle = createChronos(db);

// Your app code doesn't change at all
const todos = pluresData('todos');
todos.add({ text: 'Ship chronos', completed: false });
// ^ This state change is automatically captured with full causal context
```

## Architecture

### Chronicle Node

Each state change becomes a `ChronicleNode`:

```typescript
interface ChronicleNode {
  id: string;              // Unique node ID (format: "chrono:{timestamp}-{counter}")
  timestamp: number;       // Unix ms
  path: string;            // PluresDB path that changed (e.g. "todos.abc123")
  diff: {
    before: unknown;       // Previous value (null for creates)
    after: unknown;        // New value (null for deletes)
    minimal?: DiffDescriptor | null; // Minimal structural diff (chronicle nodes only)
  };
  cause: string | null;    // ID of the node that caused this change
  context: string | null;  // Session/request/transaction context ID
}
```

### Chronicle Edge Types

| Edge | Meaning |
|------|---------|
| `causes` | This state change directly caused another |
| `context` | Belongs to this session/request/transaction |
| `reverts` | Undoes a previous state change |
| `concurrent` | Happened simultaneously (same tick) |

### Causal Chain Tracking

Chronos uses async context (AsyncLocalStorage in Node.js) to automatically track causality:

1. User action triggers a state change → root node
2. That change triggers a subscriber → child node with `causes` edge to root
3. Subscriber makes an API call → grandchild node
4. API response triggers more state changes → great-grandchildren

All connected automatically. No manual instrumentation.

## Design Principles

1. **Zero effort** — If you use unum, you get chronos for free
2. **Complete** — Every state change captured, not just what devs remember to log
3. **Structural** — Graph, not text. Relationships, not lines.
4. **Queryable** — Semantic search, graph traversal, time-range queries
5. **Distributed** — PluresDB Hyperswarm sync means multi-node observability with just a topic key
6. **Minimal overhead** — Append-only writes, async batching, configurable retention

## Development

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Setup

```bash
git clone https://github.com/plures/chronos.git
cd chronos
npm install
```

### Running Tests

```bash
# Run the full test suite (watch mode)
npm test

# Single run (CI mode)
npm run test:run
```

All tests are colocated under `tests/` and use [Vitest](https://vitest.dev/).

## Roadmap

- [x] Core: PluresDB subscription → causal graph chronicle
- [x] Causal chain inference via AsyncLocalStorage
- [x] Time-range queries (`@plures/chronos/query`)
- [x] Graph traversal API — trace forward/backward (`@plures/chronos/trace`)
- [x] Subgraph extraction by context/session
- [x] Snapshot diff — minimal JSON diff engine (`@plures/chronos/diff`)
- [x] Retention policies — TTL, quota, archival (`@plures/chronos/rules`)
- [x] Time-travel debugger — step forward/backward through history
- [x] Praxis rule engine integration
- [ ] Semantic search over state changes
- [ ] Dashboard UI (design-dojo component)
- [ ] PluresDB Hyperswarm sync for distributed observability

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.

In short:

1. Fork the repo and create a feature branch (`git checkout -b feat/my-feature`)
2. Make your changes and add tests
3. Run `npm run test:run` and ensure all tests pass
4. Open a PR against `main` with a conventional-commit title (e.g. `feat: add X`)

## Security

Please do not report security vulnerabilities through public GitHub issues.
See our [security policy](.github/SECURITY.md) for the responsible disclosure process.

## Part of the Plures Ecosystem

| Package | Role |
|---------|------|
| [PluresDB](https://github.com/plures/pluresdb) | Graph database with vector search + Hyperswarm |
| [Unum](https://github.com/plures/unum) | Reactive state bindings (Svelte 5 ↔ PluresDB) |
| **Chronos** | State chronicle (zero-effort observability) |
| [Pares Agens](https://github.com/plures/pares-agens) | AI agent framework |
| [Design Dojo](https://github.com/plures/design-dojo) | UI component library |
| [Plures Vault](https://github.com/plures/plures-vault) | Encrypted secret storage |

## License

AGPL-3.0-or-later
