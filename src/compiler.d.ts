/**
 * Contract Compiler — transforms contract definitions into PluresDB procedures.
 *
 * @module @plures/chronos/compiler
 */

/** A compiled procedure record ready for PluresDB. */
export interface CompiledProcedure {
  /** Procedure ID (derived from contract ID) */
  id: string;
  /** PluresDB trigger type */
  trigger: "on_write";
  /** Key prefix filter */
  namespace: string;
  /** Level gate configuration */
  gate: {
    level: number;
    levelOnError: number;
  };
  /** Sink configuration */
  sink: {
    type: string;
    retentionMs: number;
  };
  /** Participates in rolling buffer */
  bufferEligible: boolean;
  /** Passthrough metadata */
  metadata: Record<string, unknown> | null;
}

/** A seed record ready for db.put(). */
export interface SeedRecord {
  key: string;
  actor: string;
  value: CompiledProcedure & { _type: "chronos_procedure"; _compiledAt: number };
}

/** Compile a single contract into a PluresDB procedure record. */
export declare function compileContract(contract: {
  id: string;
  namespace: string;
  level: string | number;
  levelOnError?: string | number;
  retention?: string | number;
  sink?: string;
  bufferEligible?: boolean;
  metadata?: Record<string, unknown> | null;
}): CompiledProcedure;

/** Compile all contracts into procedure records. */
export declare function compileAll(contracts: object[]): CompiledProcedure[];

/** Generate PluresDB seed records from compiled procedures. */
export declare function generateSeed(procedures: CompiledProcedure[]): SeedRecord[];

/** Parse contract DSL source into definitions. */
export declare function parseDSL(dsl: string): Array<{
  id: string;
  namespace?: string;
  level?: string;
  levelOnError?: string;
  retention?: string;
  sink?: string;
  bufferEligible?: boolean;
}>;

/** Full pipeline: DSL string → PluresDB seed records. */
export declare function compileDSL(dsl: string): SeedRecord[];
