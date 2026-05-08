import { describe, it, expect } from "vitest";
import {
  compileContract,
  compileAll,
  generateSeed,
  parseDSL,
  compileDSL,
} from "../src/compiler.js";
import { createContract } from "../src/contract.js";
import { LogLevel } from "../src/levels.js";

describe("compileContract", () => {
  it("compiles a contract into a procedure record", () => {
    const contract = createContract({
      id: "agent.tool",
      namespace: "agent:tool:",
      level: "info",
      levelOnError: "verbose",
      retention: "7d",
      sink: "file",
    });

    const proc = compileContract(contract);
    expect(proc.id).toBe("chronos:procedure:agent.tool");
    expect(proc.trigger).toBe("on_write");
    expect(proc.namespace).toBe("agent:tool:");
    expect(proc.gate.level).toBe(LogLevel.INFO);
    expect(proc.gate.levelOnError).toBe(LogLevel.VERBOSE);
    expect(proc.sink.type).toBe("file");
    expect(proc.sink.retentionMs).toBe(7 * 86_400_000);
    expect(proc.bufferEligible).toBe(true);
  });

  it("handles string levels in raw definition", () => {
    const proc = compileContract({
      id: "test",
      namespace: "test:",
      level: "warn",
      levelOnError: "debug",
      retention: "24h",
      sink: "plures-object",
    });
    expect(proc.gate.level).toBe(LogLevel.WARN);
    expect(proc.gate.levelOnError).toBe(LogLevel.DEBUG);
    expect(proc.sink.retentionMs).toBe(24 * 3_600_000);
  });
});

describe("compileAll", () => {
  it("compiles multiple contracts", () => {
    const contracts = [
      createContract({ id: "a", namespace: "a:" }),
      createContract({ id: "b", namespace: "b:" }),
    ];
    const procs = compileAll(contracts);
    expect(procs.length).toBe(2);
    expect(procs[0].id).toBe("chronos:procedure:a");
    expect(procs[1].id).toBe("chronos:procedure:b");
  });
});

describe("generateSeed", () => {
  it("produces db.put-ready records", () => {
    const contract = createContract({ id: "test", namespace: "test:" });
    const procs = [compileContract(contract)];
    const seed = generateSeed(procs);

    expect(seed.length).toBe(1);
    expect(seed[0].key).toBe("_procedures:chronos:procedure:test");
    expect(seed[0].actor).toBe("chronos:compiler");
    expect(seed[0].value._type).toBe("chronos_procedure");
    expect(seed[0].value._compiledAt).toBeGreaterThan(0);
  });
});

describe("parseDSL", () => {
  it("parses a single contract block", () => {
    const defs = parseDSL(`
      contract "agent.tool" {
        namespace: "agent:tool:"
        level: info
        retention: 7d
        sink: file
      }
    `);
    expect(defs.length).toBe(1);
    expect(defs[0].id).toBe("agent.tool");
    expect(defs[0].namespace).toBe("agent:tool:");
    expect(defs[0].level).toBe("info");
    expect(defs[0].retention).toBe("7d");
    expect(defs[0].sink).toBe("file");
  });

  it("parses multiple contract blocks", () => {
    const defs = parseDSL(`
      contract "default" {
        namespace: "*"
        level: warn
        retention: 30d
        sink: file
      }
      contract "agent.model" {
        namespace: "agent:model:"
        level: info
        level_on_error: verbose
        retention: 7d
        sink: file
      }
    `);
    expect(defs.length).toBe(2);
    expect(defs[0].id).toBe("default");
    expect(defs[0].namespace).toBe("*");
    expect(defs[1].id).toBe("agent.model");
    expect(defs[1].levelOnError).toBe("verbose");
  });

  it("handles buffer_eligible", () => {
    const defs = parseDSL(`
      contract "no-buffer" {
        namespace: "ephemeral:"
        level: debug
        buffer_eligible: false
      }
    `);
    expect(defs[0].bufferEligible).toBe(false);
  });
});

describe("compileDSL", () => {
  it("full pipeline: DSL → seed records", () => {
    const seed = compileDSL(`
      contract "agent.tool" {
        namespace: "agent:tool:"
        level: info
        retention: 7d
        sink: file
      }
    `);
    expect(seed.length).toBe(1);
    expect(seed[0].key).toBe("_procedures:chronos:procedure:agent.tool");
    expect(seed[0].value.gate.level).toBe(LogLevel.INFO);
    expect(seed[0].value.sink.retentionMs).toBe(7 * 86_400_000);
  });
});
