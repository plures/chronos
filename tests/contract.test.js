import { describe, it, expect } from "vitest";
import {
  createContract,
  matchContract,
  ContractRegistry,
  parseRetention,
} from "../src/contract.js";
import { LogLevel } from "../src/levels.js";

describe("parseRetention", () => {
  it("parses days", () => {
    expect(parseRetention("7d")).toBe(7 * 86_400_000);
  });

  it("parses hours", () => {
    expect(parseRetention("24h")).toBe(24 * 3_600_000);
  });

  it("parses minutes", () => {
    expect(parseRetention("30m")).toBe(30 * 60_000);
  });

  it("parses combined", () => {
    expect(parseRetention("1d12h")).toBe(86_400_000 + 12 * 3_600_000);
  });

  it("throws on invalid string", () => {
    expect(() => parseRetention("forever")).toThrow("Invalid retention");
  });
});

describe("createContract", () => {
  it("creates with defaults", () => {
    const c = createContract({ id: "test", namespace: "test:" });
    expect(c.id).toBe("test");
    expect(c.namespace).toBe("test:");
    expect(c.level).toBe(LogLevel.INFO);
    expect(c.levelOnError).toBe(LogLevel.VERBOSE);
    expect(c.retention).toBe("7d");
    expect(c.sink).toBe("file");
    expect(c.bufferEligible).toBe(true);
  });

  it("parses string levels", () => {
    const c = createContract({
      id: "test",
      namespace: "test:",
      level: "warn",
      levelOnError: "debug",
    });
    expect(c.level).toBe(LogLevel.WARN);
    expect(c.levelOnError).toBe(LogLevel.DEBUG);
  });

  it("accepts numeric levels", () => {
    const c = createContract({
      id: "test",
      namespace: "test:",
      level: 4,
    });
    expect(c.level).toBe(LogLevel.ERROR);
  });
});

describe("matchContract", () => {
  const contracts = [
    createContract({ id: "default", namespace: "*", level: "warn" }),
    createContract({ id: "agent", namespace: "agent:", level: "info" }),
    createContract({ id: "agent.tool", namespace: "agent:tool:", level: "debug" }),
  ];

  it("matches most specific prefix", () => {
    const match = matchContract("agent:tool:search", contracts);
    expect(match.id).toBe("agent.tool");
  });

  it("matches parent prefix when no specific match", () => {
    const match = matchContract("agent:lifecycle:start", contracts);
    expect(match.id).toBe("agent");
  });

  it("falls back to wildcard", () => {
    const match = matchContract("config:theme", contracts);
    expect(match.id).toBe("default");
  });

  it("returns null with empty contracts", () => {
    const match = matchContract("anything", []);
    expect(match).toBeNull();
  });
});

describe("ContractRegistry", () => {
  it("registers and matches", () => {
    const reg = new ContractRegistry();
    reg.register(createContract({ id: "a", namespace: "a:" }));
    expect(reg.match("a:key").id).toBe("a");
  });

  it("replaces contracts with same ID", () => {
    const reg = new ContractRegistry();
    reg.register(createContract({ id: "a", namespace: "a:", level: "info" }));
    reg.register(createContract({ id: "a", namespace: "a:", level: "error" }));
    expect(reg.list().length).toBe(1);
    expect(reg.get("a").level).toBe(LogLevel.ERROR);
  });

  it("removes by ID", () => {
    const reg = new ContractRegistry();
    reg.register(createContract({ id: "a", namespace: "a:" }));
    expect(reg.remove("a")).toBe(true);
    expect(reg.list().length).toBe(0);
    expect(reg.remove("a")).toBe(false);
  });
});
