/**
 * Chronos Log Levels — the severity scale for automatic logging.
 *
 * Contracts declare a `level` and procedures use these constants
 * to gate what gets written to sinks.
 *
 * @module @plures/chronos/levels
 */

/**
 * Numeric log levels — higher numbers are more severe / less verbose.
 *
 * @readonly
 * @enum {number}
 */
export const LogLevel = /** @type {const} */ ({
  /** Everything including intermediate states. Rolling buffer only. */
  VERBOSE: 0,
  /** All state changes. Short-retention file sink. */
  DEBUG: 1,
  /** Significant state transitions. Default file sink. */
  INFO: 2,
  /** Degraded states, approaching limits. */
  WARN: 3,
  /** Failures, constraint violations. Triggers buffer flush. */
  ERROR: 4,
  /** System is unusable. Always logged. */
  FATAL: 5,
  /** Logging disabled. */
  OFF: 6,
});

/**
 * String names for each level.
 * @type {Record<number, string>}
 */
export const LogLevelName = {
  [LogLevel.VERBOSE]: "verbose",
  [LogLevel.DEBUG]: "debug",
  [LogLevel.INFO]: "info",
  [LogLevel.WARN]: "warn",
  [LogLevel.ERROR]: "error",
  [LogLevel.FATAL]: "fatal",
  [LogLevel.OFF]: "off",
};

/**
 * Parse a level string or number into a numeric LogLevel.
 *
 * @param {string|number} input - e.g. "info", "WARN", 2
 * @returns {number} The numeric LogLevel value
 * @throws {Error} If the input doesn't match any known level
 *
 * @example
 * ```js
 * import { parseLevel, LogLevel } from '@plures/chronos/levels';
 *
 * parseLevel('info')    === LogLevel.INFO   // true
 * parseLevel('WARN')    === LogLevel.WARN   // true
 * parseLevel(3)         === LogLevel.WARN   // true
 * ```
 */
export function parseLevel(input) {
  if (typeof input === "number") {
    if (input >= LogLevel.VERBOSE && input <= LogLevel.OFF) return input;
    throw new Error(`Unknown log level number: ${input}`);
  }
  const key = String(input).toUpperCase();
  if (key in LogLevel) return LogLevel[key];
  throw new Error(`Unknown log level: ${input}`);
}

/**
 * Check whether a message at `messageLevel` should be logged
 * given the current `activeLevel`.
 *
 * @param {number} messageLevel - The level of the event
 * @param {number} activeLevel  - The configured threshold
 * @returns {boolean} true if the message should be logged
 *
 * @example
 * ```js
 * import { shouldLog, LogLevel } from '@plures/chronos/levels';
 *
 * shouldLog(LogLevel.INFO, LogLevel.WARN);    // false — info < warn
 * shouldLog(LogLevel.ERROR, LogLevel.WARN);   // true  — error >= warn
 * shouldLog(LogLevel.WARN, LogLevel.WARN);    // true  — equal
 * ```
 */
export function shouldLog(messageLevel, activeLevel) {
  return messageLevel >= activeLevel;
}
