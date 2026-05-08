import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogGate } from "../src/log-gate.js";
import { ContractRegistry, createContract } from "../src/contract.js";
import { LogLevel } from "../src/levels.js";

describe("LogGate", () => {
  /** @type {import('../src/chronicle.js').ChronicleNode[]} */
  let sinkOutput;
  let registry;
  let sink;

  beforeEach(() => {
    sinkOutput = [];
    sink = {
      write(nodes) {
        sinkOutput.push(...nodes);
      },
    };
    registry = new ContractRegistry();
    registry.register(
      createContract({ id: "default", namespace: "*", level: "info" })
    );
    registry.register(
      createContract({
        id: "agent.tool",
        namespace: "agent:tool:",
        level: "debug",
      })
    );
    registry.register(
      createContract({
        id: "agent.heartbeat",
        namespace: "agent:heartbeat:",
        level: "warn",
      })
    );
  });

  it("logs writes that meet the active level", () => {
    const gate = createLogGate(registry, { activeLevel: LogLevel.INFO, sink });

    // "default" contract has level=info, active=info → logged
    gate.onWrite("config:theme", null, "dark");
    expect(sinkOutput.length).toBe(1);
    expect(sinkOutput[0].path).toBe("config:theme");
  });

  it("drops writes below active level", () => {
    const gate = createLogGate(registry, { activeLevel: LogLevel.WARN, sink });

    // "default" contract has level=info, but active=warn → info < warn → dropped
    gate.onWrite("config:theme", null, "dark");
    expect(sinkOutput.length).toBe(0);
  });

  it("uses most specific contract", () => {
    const gate = createLogGate(registry, { activeLevel: LogLevel.DEBUG, sink });

    // "agent.tool" contract has level=debug, active=debug → logged
    gate.onWrite("agent:tool:search", null, { query: "foo" });
    expect(sinkOutput.length).toBe(1);

    // "agent.heartbeat" contract has level=warn, active=debug → warn >= debug → logged
    gate.onWrite("agent:heartbeat:ping", null, { ts: 1 });
    expect(sinkOutput.length).toBe(2);
  });

  it("heartbeat dropped at INFO level", () => {
    const gate = createLogGate(registry, { activeLevel: LogLevel.INFO, sink });

    // agent.tool level=debug, but debug < info → dropped
    gate.onWrite("agent:tool:search", null, { query: "foo" });
    expect(sinkOutput.length).toBe(0);

    // agent.heartbeat level=warn, warn >= info → logged
    gate.onWrite("agent:heartbeat:ping", null, { ts: 1 });
    expect(sinkOutput.length).toBe(1);
  });

  it("onError flushes buffer to sink", () => {
    const gate = createLogGate(registry, {
      activeLevel: LogLevel.ERROR, // high threshold — almost nothing logged normally
      sink,
      bufferWindowMs: 5000,
    });

    // These writes are below active level — NOT logged by onWrite
    gate.onWrite("config:a", null, 1);
    gate.onWrite("config:b", null, 2);
    gate.onWrite("config:c", null, 3);
    expect(sinkOutput.length).toBe(0);

    // Error triggers buffer flush — all 3 writes appear + the error node
    gate.onError("test-error", { detail: "something broke" });
    expect(sinkOutput.length).toBe(4); // 3 buffered + 1 error
    expect(sinkOutput[3].path).toBe("_error:test-error");
  });

  it("setLevel changes active level at runtime", () => {
    const gate = createLogGate(registry, { activeLevel: LogLevel.ERROR, sink });

    gate.onWrite("config:theme", null, "dark");
    expect(sinkOutput.length).toBe(0); // info < error → dropped

    gate.setLevel(LogLevel.INFO);
    gate.onWrite("config:theme", "dark", "light");
    expect(sinkOutput.length).toBe(1); // info >= info → logged
  });

  it("stats tracks writes/logged/dropped", () => {
    const gate = createLogGate(registry, { activeLevel: LogLevel.INFO, sink });

    gate.onWrite("config:a", null, 1); // info >= info → logged
    gate.onWrite("agent:tool:x", null, 2); // debug < info → dropped
    gate.onWrite("config:b", null, 3); // info >= info → logged

    const s = gate.stats();
    expect(s.totalWrites).toBe(3);
    expect(s.totalLogged).toBe(2);
    expect(s.totalDropped).toBe(1);
    expect(s.totalErrorFlushes).toBe(0);
  });

  it("stats counts error flushes", () => {
    const gate = createLogGate(registry, { activeLevel: LogLevel.INFO, sink });
    gate.onError("e1");
    gate.onError("e2");
    expect(gate.stats().totalErrorFlushes).toBe(2);
  });
});
