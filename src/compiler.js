/**
 * Contract Compiler — transforms contract definitions into PluresDB procedures.
 *
 * At build time, this reads contract definitions (DSL or JS) and emits
 * PluresDB-native procedure records. At runtime, PluresDB evaluates these
 * procedures on every write — the contract compiler is NOT needed at runtime.
 *
 * This is the bridge between "developer writes contracts" and "PluresDB
 * handles logging automatically."
 *
 * @module @plures/chronos/compiler
 */

import { parseLevel, LogLevel } from "./levels.js";
import { parseRetention } from "./contract.js";

/**
 * @typedef {object} CompiledProcedure
 * @property {string} id          - Procedure ID (derived from contract ID)
 * @property {string} trigger     - PluresDB trigger type: "on_write"
 * @property {string} namespace   - Key prefix filter for when this procedure fires
 * @property {object} gate        - Level gate configuration
 * @property {number} gate.level  - Contract's log level (numeric)
 * @property {number} gate.levelOnError - Escalation level
 * @property {object} sink        - Where to write
 * @property {string} sink.type   - "file", "plures-object", "db", "none"
 * @property {number} sink.retentionMs - TTL in milliseconds
 * @property {boolean} bufferEligible  - Participates in rolling buffer
 * @property {object} [metadata]  - Passthrough metadata from contract
 */

/**
 * Compile a single contract definition into a PluresDB procedure record.
 *
 * @param {object} contract - A LoggingContract (from createContract or raw definition)
 * @returns {CompiledProcedure}
 *
 * @example
 * ```js
 * import { compileContract } from '@plures/chronos/compiler';
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
 *
 * const procedure = compileContract(contract);
 * // → { id: 'chronos:procedure:agent.tool-invocation', trigger: 'on_write', ... }
 * ```
 */
export function compileContract(contract) {
  const level =
    typeof contract.level === "string"
      ? parseLevel(contract.level)
      : contract.level;
  const levelOnError =
    typeof contract.levelOnError === "string"
      ? parseLevel(contract.levelOnError)
      : contract.levelOnError ?? LogLevel.VERBOSE;
  const retentionMs =
    typeof contract.retention === "string"
      ? parseRetention(contract.retention)
      : contract.retention ?? 7 * 86_400_000;

  return {
    id: `chronos:procedure:${contract.id}`,
    trigger: "on_write",
    namespace: contract.namespace,
    gate: {
      level,
      levelOnError,
    },
    sink: {
      type: contract.sink ?? "file",
      retentionMs,
    },
    bufferEligible: contract.bufferEligible !== false,
    metadata: contract.metadata ?? null,
  };
}

/**
 * Compile all contracts into PluresDB procedure records.
 *
 * @param {object[]} contracts - Array of LoggingContract objects
 * @returns {CompiledProcedure[]}
 *
 * @example
 * ```js
 * import { compileAll } from '@plures/chronos/compiler';
 *
 * const procedures = compileAll(contracts);
 * // Write these to PluresDB at build time:
 * for (const proc of procedures) {
 *   db.put(`_procedures:${proc.id}`, 'compiler', proc);
 * }
 * ```
 */
export function compileAll(contracts) {
  return contracts.map(compileContract);
}

/**
 * Generate the PluresDB seed script from compiled procedures.
 * Returns an array of { key, value } pairs ready for db.put().
 *
 * @param {CompiledProcedure[]} procedures
 * @returns {Array<{key: string, actor: string, value: object}>}
 *
 * @example
 * ```js
 * import { compileAll, generateSeed } from '@plures/chronos/compiler';
 *
 * const procedures = compileAll(contracts);
 * const seed = generateSeed(procedures);
 *
 * // At build time, write seed to PluresDB:
 * for (const { key, actor, value } of seed) {
 *   db.put(key, actor, value);
 * }
 * ```
 */
export function generateSeed(procedures) {
  return procedures.map((proc) => ({
    key: `_procedures:${proc.id}`,
    actor: "chronos:compiler",
    value: {
      ...proc,
      _type: "chronos_procedure",
      _compiledAt: Date.now(),
    },
  }));
}

/**
 * Parse a contract DSL string into contract definitions.
 *
 * DSL format (one contract per block):
 * ```
 * contract "agent.tool-invocation" {
 *   namespace: "agent:tool:"
 *   level: info
 *   level_on_error: verbose
 *   retention: 7d
 *   sink: file
 * }
 * ```
 *
 * @param {string} dsl - Contract DSL source
 * @returns {object[]} Parsed contract definitions (ready for createContract)
 *
 * @example
 * ```js
 * import { parseDSL } from '@plures/chronos/compiler';
 *
 * const contracts = parseDSL(`
 *   contract "agent.tool" {
 *     namespace: "agent:tool:"
 *     level: info
 *     retention: 7d
 *     sink: file
 *   }
 * `);
 * // → [{ id: 'agent.tool', namespace: 'agent:tool:', level: 'info', ... }]
 * ```
 */
export function parseDSL(dsl) {
  const contracts = [];
  const contractPattern =
    /contract\s+"([^"]+)"\s*\{([^}]+)\}/g;
  let match;

  while ((match = contractPattern.exec(dsl)) !== null) {
    const id = match[1];
    const body = match[2];
    const def = { id };

    // Parse key: value pairs
    const propPattern = /(\w+):\s*(?:"([^"]*)"|([\w.-]+))/g;
    let propMatch;
    while ((propMatch = propPattern.exec(body)) !== null) {
      const key = propMatch[1];
      const value = propMatch[2] ?? propMatch[3];

      switch (key) {
        case "namespace":
          def.namespace = value;
          break;
        case "level":
          def.level = value;
          break;
        case "level_on_error":
        case "levelOnError":
          def.levelOnError = value;
          break;
        case "retention":
          def.retention = value;
          break;
        case "sink":
          def.sink = value;
          break;
        case "buffer_eligible":
        case "bufferEligible":
          def.bufferEligible = value === "true";
          break;
      }
    }

    contracts.push(def);
  }

  return contracts;
}

/**
 * Full compilation pipeline: DSL string → PluresDB seed records.
 *
 * @param {string} dsl - Contract DSL source
 * @returns {Array<{key: string, actor: string, value: object}>}
 *
 * @example
 * ```js
 * import { compileDSL } from '@plures/chronos/compiler';
 *
 * const seed = compileDSL(`
 *   contract "default" {
 *     namespace: "*"
 *     level: warn
 *     retention: 30d
 *     sink: file
 *   }
 *   contract "agent.tool" {
 *     namespace: "agent:tool:"
 *     level: info
 *     retention: 7d
 *     sink: file
 *   }
 * `);
 *
 * // Write to PluresDB
 * for (const { key, actor, value } of seed) {
 *   db.put(key, actor, value);
 * }
 * ```
 */
export function compileDSL(dsl) {
  const defs = parseDSL(dsl);
  // Create contracts from definitions
  const contracts = defs.map((def) => ({
    id: def.id,
    namespace: def.namespace ?? "*",
    level: def.level ? parseLevel(def.level) : LogLevel.INFO,
    levelOnError: def.levelOnError
      ? parseLevel(def.levelOnError)
      : LogLevel.VERBOSE,
    retention: def.retention ?? "7d",
    sink: def.sink ?? "file",
    bufferEligible: def.bufferEligible !== false,
    metadata: null,
  }));
  const procedures = compileAll(contracts);
  return generateSeed(procedures);
}
