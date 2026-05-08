/**
 * Logging Contract — declares the logging behavior for a key namespace.
 *
 * Contracts are the single source of truth for what gets logged, at what level,
 * where it goes, and how long it's kept. They live as PluresDB data, not code.
 *
 * At build time, contracts compile into PluresDB procedures. At runtime,
 * procedures fire on writes and use the contract to gate logging.
 *
 * @module @plures/chronos/contract
 */

import { LogLevel, parseLevel } from "./levels.js";

/**
 * @typedef {object} LoggingContract
 * @property {string}  id            - Unique contract ID (e.g. "agent.tool-invocation")
 * @property {string}  namespace     - PluresDB key prefix this contract covers (e.g. "agent:" or "*")
 * @property {number}  level         - Minimum level to log (numeric LogLevel)
 * @property {number}  levelOnError  - Level to use when an error occurs in this namespace
 * @property {string}  retention     - TTL string (e.g. "7d", "24h", "30d")
 * @property {string}  sink          - Where to write: "file", "plures-object", "db", "none"
 * @property {boolean} [bufferEligible] - Whether this namespace participates in the rolling buffer (default: true)
 * @property {object}  [metadata]    - Additional contract metadata
 */

/**
 * Parse a retention string into milliseconds.
 *
 * @param {string} retention - e.g. "7d", "24h", "30m", "1h30m"
 * @returns {number} Milliseconds
 *
 * @example
 * ```js
 * import { parseRetention } from '@plures/chronos/contract';
 *
 * parseRetention('7d');   // 604800000
 * parseRetention('24h');  // 86400000
 * parseRetention('30m');  // 1800000
 * ```
 */
export function parseRetention(retention) {
  let ms = 0;
  const pattern = /(\d+)\s*(d|h|m|s)/gi;
  let match;
  while ((match = pattern.exec(retention)) !== null) {
    const value = parseInt(match[1], 10);
    switch (match[2].toLowerCase()) {
      case "d": ms += value * 86_400_000; break;
      case "h": ms += value * 3_600_000; break;
      case "m": ms += value * 60_000; break;
      case "s": ms += value * 1_000; break;
    }
  }
  if (ms === 0) throw new Error(`Invalid retention string: ${retention}`);
  return ms;
}

/**
 * Create a logging contract.
 *
 * @param {object} def - Contract definition
 * @param {string} def.id            - Unique contract ID
 * @param {string} def.namespace     - PluresDB key prefix (e.g. "agent:", "sprint/", "*")
 * @param {string|number} [def.level="info"]         - Default log level
 * @param {string|number} [def.levelOnError="verbose"] - Level on error escalation
 * @param {string} [def.retention="7d"]    - Retention period
 * @param {string} [def.sink="file"]       - Sink type
 * @param {boolean} [def.bufferEligible=true] - Participate in rolling buffer
 * @param {object} [def.metadata]          - Extra metadata
 * @returns {LoggingContract}
 *
 * @example
 * ```js
 * import { createContract } from '@plures/chronos/contract';
 *
 * const contract = createContract({
 *   id: 'agent.tool-invocation',
 *   namespace: 'agent:tool:',
 *   level: 'info',
 *   levelOnError: 'verbose',
 *   retention: '7d',
 *   sink: 'file',
 * });
 * ```
 */
export function createContract(def) {
  return {
    id: def.id,
    namespace: def.namespace,
    level: parseLevel(def.level ?? "info"),
    levelOnError: parseLevel(def.levelOnError ?? "verbose"),
    retention: def.retention ?? "7d",
    sink: def.sink ?? "file",
    bufferEligible: def.bufferEligible !== false,
    metadata: def.metadata ?? null,
  };
}

/**
 * Match a PluresDB key against a set of contracts.
 * Returns the most specific matching contract (longest namespace prefix match).
 * Falls back to the wildcard contract ("*") if no specific match.
 *
 * @param {string} key        - The PluresDB key being written
 * @param {LoggingContract[]} contracts - All registered contracts
 * @returns {LoggingContract|null} The matching contract, or null if no contracts match
 *
 * @example
 * ```js
 * import { matchContract, createContract } from '@plures/chronos/contract';
 *
 * const contracts = [
 *   createContract({ id: 'default', namespace: '*', level: 'warn' }),
 *   createContract({ id: 'agent.tools', namespace: 'agent:tool:', level: 'info' }),
 * ];
 *
 * matchContract('agent:tool:search', contracts);  // → agent.tools contract
 * matchContract('config:theme', contracts);        // → default contract (wildcard)
 * matchContract('unknown:key', []);                // → null
 * ```
 */
export function matchContract(key, contracts) {
  let best = null;
  let bestLen = -1;

  for (const c of contracts) {
    if (c.namespace === "*") {
      if (bestLen < 0) {
        best = c;
        bestLen = 0;
      }
    } else if (key.startsWith(c.namespace) && c.namespace.length > bestLen) {
      best = c;
      bestLen = c.namespace.length;
    }
  }

  return best;
}

/**
 * Registry of logging contracts. Wraps a list and provides lookup + CRUD.
 *
 * In practice, this is backed by PluresDB at runtime — contracts are data,
 * stored as PluresDB records. This JS class is the in-process cache and
 * the compile-time API for defining contracts.
 *
 * @example
 * ```js
 * import { ContractRegistry, createContract } from '@plures/chronos/contract';
 *
 * const registry = new ContractRegistry();
 * registry.register(createContract({
 *   id: 'agent.tool-invocation',
 *   namespace: 'agent:tool:',
 *   level: 'info',
 * }));
 *
 * const contract = registry.match('agent:tool:search');
 * console.log(contract.id); // 'agent.tool-invocation'
 * ```
 */
export class ContractRegistry {
  /** @type {LoggingContract[]} */
  #contracts = [];

  /**
   * Register a contract. Replaces any existing contract with the same ID.
   * @param {LoggingContract} contract
   */
  register(contract) {
    this.#contracts = this.#contracts.filter((c) => c.id !== contract.id);
    this.#contracts.push(contract);
  }

  /**
   * Remove a contract by ID.
   * @param {string} id
   * @returns {boolean} true if a contract was removed
   */
  remove(id) {
    const before = this.#contracts.length;
    this.#contracts = this.#contracts.filter((c) => c.id !== id);
    return this.#contracts.length < before;
  }

  /**
   * Find the best-matching contract for a PluresDB key.
   * @param {string} key
   * @returns {LoggingContract|null}
   */
  match(key) {
    return matchContract(key, this.#contracts);
  }

  /**
   * List all registered contracts.
   * @returns {LoggingContract[]}
   */
  list() {
    return [...this.#contracts];
  }

  /**
   * Get a contract by ID.
   * @param {string} id
   * @returns {LoggingContract|undefined}
   */
  get(id) {
    return this.#contracts.find((c) => c.id === id);
  }
}
