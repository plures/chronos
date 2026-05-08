/**
 * Chronos Log Levels — the severity scale for automatic logging.
 *
 * @module @plures/chronos/levels
 */

/**
 * Numeric log levels — higher is more severe / less verbose.
 */
export declare const LogLevel: {
  /** Everything including intermediate states. Rolling buffer only. */
  readonly VERBOSE: 0;
  /** All state changes. Short-retention file sink. */
  readonly DEBUG: 1;
  /** Significant state transitions. Default file sink. */
  readonly INFO: 2;
  /** Degraded states, approaching limits. */
  readonly WARN: 3;
  /** Failures, constraint violations. Triggers buffer flush. */
  readonly ERROR: 4;
  /** System is unusable. Always logged. */
  readonly FATAL: 5;
  /** Logging disabled. */
  readonly OFF: 6;
};

/** String names for each numeric level. */
export declare const LogLevelName: Record<number, string>;

/**
 * Parse a level string or number into a numeric LogLevel.
 * @throws If the input doesn't match any known level.
 */
export declare function parseLevel(input: string | number): number;

/**
 * Check whether a message at `messageLevel` passes the `activeLevel` gate.
 */
export declare function shouldLog(
  messageLevel: number,
  activeLevel: number,
): boolean;
