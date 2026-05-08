/**
 * Logging Contract — declares the logging behavior for a key namespace.
 *
 * @module @plures/chronos/contract
 */

/** A logging contract that controls what/where/how long events are logged. */
export interface LoggingContract {
  /** Unique contract ID (e.g. "agent.tool-invocation") */
  id: string;
  /** PluresDB key prefix this contract covers (e.g. "agent:" or "*") */
  namespace: string;
  /** Minimum level to log (numeric LogLevel) */
  level: number;
  /** Level to use when an error occurs in this namespace */
  levelOnError: number;
  /** TTL string (e.g. "7d", "24h", "30d") */
  retention: string;
  /** Where to write: "file", "plures-object", "db", "none" */
  sink: string;
  /** Whether this namespace participates in the rolling buffer (default: true) */
  bufferEligible: boolean;
  /** Additional contract metadata */
  metadata: Record<string, unknown> | null;
}

/** Input for `createContract`. */
export interface ContractDefinition {
  id: string;
  namespace: string;
  level?: string | number;
  levelOnError?: string | number;
  retention?: string;
  sink?: string;
  bufferEligible?: boolean;
  metadata?: Record<string, unknown>;
}

/** Parse a retention string (e.g. "7d", "24h") into milliseconds. */
export declare function parseRetention(retention: string): number;

/** Create a logging contract from a definition. */
export declare function createContract(def: ContractDefinition): LoggingContract;

/**
 * Match a PluresDB key against contracts.
 * Returns the most specific (longest prefix) match, or wildcard, or null.
 */
export declare function matchContract(
  key: string,
  contracts: LoggingContract[],
): LoggingContract | null;

/** Registry of logging contracts with lookup, CRUD, and namespace matching. */
export declare class ContractRegistry {
  /** Register a contract. Replaces any existing contract with the same ID. */
  register(contract: LoggingContract): void;
  /** Remove a contract by ID. */
  remove(id: string): boolean;
  /** Find the best-matching contract for a PluresDB key. */
  match(key: string): LoggingContract | null;
  /** List all registered contracts. */
  list(): LoggingContract[];
  /** Get a contract by ID. */
  get(id: string): LoggingContract | undefined;
}
