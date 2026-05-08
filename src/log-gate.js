/**
 * Log Gate — the procedure that decides what gets logged.
 *
 * This is the central orchestrator. It receives every PluresDB write,
 * matches the key to a contract, checks the level gate, and either:
 * - Drops the event (below active level, no error)
 * - Pushes to the rolling buffer (always, for error escalation)
 * - Writes to the sink (above active level)
 * - Flushes the buffer on error (error escalation path)
 *
 * In the final architecture, this logic is compiled from contracts into
 * PluresDB procedures. This JS module is the reference implementation
 * and the runtime for the JS/Svelte side of the stack.
 *
 * @module @plures/chronos/log-gate
 */

import { LogLevel, shouldLog } from "./levels.js";
import { ContractRegistry, createContract } from "./contract.js";
import { createRollingBuffer } from "./buffer.js";
import { createChronicleNode } from "./chronicle.js";

/**
 * @typedef {object} SinkWriter
 * @property {function(import('./chronicle.js').ChronicleNode[]): void} write - Write nodes to the sink
 * @property {function(): void} [close] - Close the sink
 */

/**
 * @typedef {object} LogGateConfig
 * @property {number}  [activeLevel=2]      - Active log level (default: INFO)
 * @property {number}  [bufferWindowMs=5000] - Rolling buffer window
 * @property {number}  [bufferMaxEntries=1000] - Rolling buffer max entries
 * @property {SinkWriter} [sink]            - Where to write logged entries
 */

/**
 * Create a log gate that processes PluresDB writes through contracts.
 *
 * @param {ContractRegistry} registry - Contract registry
 * @param {LogGateConfig} [config]
 * @returns {object} LogGate with onWrite, onError, setLevel, stats
 *
 * @example
 * ```js
 * import { createLogGate } from '@plures/chronos/log-gate';
 * import { ContractRegistry, createContract } from '@plures/chronos/contract';
 * import { LogLevel } from '@plures/chronos/levels';
 *
 * const registry = new ContractRegistry();
 * registry.register(createContract({
 *   id: 'default',
 *   namespace: '*',
 *   level: 'info',
 *   levelOnError: 'verbose',
 *   retention: '7d',
 *   sink: 'file',
 * }));
 *
 * const gate = createLogGate(registry, {
 *   activeLevel: LogLevel.INFO,
 *   sink: { write: (nodes) => console.log(`Logged ${nodes.length} entries`) },
 * });
 *
 * // Wire to PluresDB
 * db.on((data, key) => {
 *   gate.onWrite(key, previousValues.get(key), data);
 * });
 *
 * // On error anywhere
 * gate.onError('constraint-violation', { detail: '...' });
 * ```
 */
export function createLogGate(registry, config = {}) {
  const {
    activeLevel: initialLevel = LogLevel.INFO,
    bufferWindowMs = 5000,
    bufferMaxEntries = 1000,
    sink = null,
  } = config;

  let activeLevel = initialLevel;
  const buffer = createRollingBuffer({
    windowMs: bufferWindowMs,
    maxEntries: bufferMaxEntries,
  });

  let totalWrites = 0;
  let totalLogged = 0;
  let totalDropped = 0;
  let totalErrorFlushes = 0;

  /**
   * Process a PluresDB write through the contract + level gate.
   *
   * @param {string} key     - PluresDB key
   * @param {*}      before  - Previous value
   * @param {*}      after   - New value
   * @param {string} [context] - Session context
   */
  function onWrite(key, before, after, context) {
    totalWrites++;

    // Always push to rolling buffer (regardless of level)
    buffer.push({ key, before, after, context });

    // Find matching contract
    const contract = registry.match(key);
    if (!contract) {
      totalDropped++;
      return;
    }

    // Level gate: contract level must be >= active level
    if (!shouldLog(contract.level, activeLevel)) {
      totalDropped++;
      return;
    }

    // Passed the gate — create node and write to sink
    const node = createChronicleNode(key, before, after, context);
    if (sink) {
      sink.write([node]);
    }
    totalLogged++;
  }

  /**
   * Error escalation — flush the rolling buffer to the sink.
   *
   * When an error occurs, the entire buffer window is flushed, giving
   * full verbose context around the error regardless of the active level.
   *
   * @param {string} errorId    - Error identifier
   * @param {object} [errorData] - Error details (attached as a final node)
   */
  function onError(errorId, errorData) {
    totalErrorFlushes++;

    // Flush buffer — all entries from the window become nodes
    const bufferedNodes = buffer.flush(errorId);

    // Create the error node itself
    const errorNode = createChronicleNode(
      `_error:${errorId}`,
      null,
      errorData ?? { error: errorId, timestamp: Date.now() },
      null,
    );

    // Write buffer + error to sink
    if (sink && (bufferedNodes.length > 0 || errorNode)) {
      sink.write([...bufferedNodes, errorNode]);
    }
  }

  /**
   * Change the active log level at runtime.
   *
   * @param {number} level - New active level
   */
  function setLevel(level) {
    activeLevel = level;
  }

  /**
   * Get the current active log level.
   *
   * @returns {number}
   */
  function getLevel() {
    return activeLevel;
  }

  /**
   * Gate statistics.
   *
   * @returns {{ totalWrites: number, totalLogged: number, totalDropped: number, totalErrorFlushes: number, activeLevel: number, bufferStats: object }}
   */
  function stats() {
    return {
      totalWrites,
      totalLogged,
      totalDropped,
      totalErrorFlushes,
      activeLevel,
      bufferStats: buffer.stats(),
    };
  }

  return {
    onWrite,
    onError,
    setLevel,
    getLevel,
    stats,
  };
}
