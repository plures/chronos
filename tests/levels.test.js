import { describe, it, expect } from "vitest";
import { LogLevel, LogLevelName, parseLevel, shouldLog } from "../src/levels.js";

describe("LogLevel", () => {
  it("has correct numeric ordering", () => {
    expect(LogLevel.VERBOSE).toBe(0);
    expect(LogLevel.DEBUG).toBe(1);
    expect(LogLevel.INFO).toBe(2);
    expect(LogLevel.WARN).toBe(3);
    expect(LogLevel.ERROR).toBe(4);
    expect(LogLevel.FATAL).toBe(5);
    expect(LogLevel.OFF).toBe(6);
  });

  it("VERBOSE < DEBUG < INFO < WARN < ERROR < FATAL < OFF", () => {
    const levels = [
      LogLevel.VERBOSE, LogLevel.DEBUG, LogLevel.INFO,
      LogLevel.WARN, LogLevel.ERROR, LogLevel.FATAL, LogLevel.OFF,
    ];
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThan(levels[i - 1]);
    }
  });
});

describe("LogLevelName", () => {
  it("maps all levels to strings", () => {
    expect(LogLevelName[LogLevel.VERBOSE]).toBe("verbose");
    expect(LogLevelName[LogLevel.INFO]).toBe("info");
    expect(LogLevelName[LogLevel.ERROR]).toBe("error");
  });
});

describe("parseLevel", () => {
  it("parses string names (case-insensitive)", () => {
    expect(parseLevel("info")).toBe(LogLevel.INFO);
    expect(parseLevel("WARN")).toBe(LogLevel.WARN);
    expect(parseLevel("Error")).toBe(LogLevel.ERROR);
    expect(parseLevel("verbose")).toBe(LogLevel.VERBOSE);
  });

  it("accepts numeric values", () => {
    expect(parseLevel(0)).toBe(LogLevel.VERBOSE);
    expect(parseLevel(4)).toBe(LogLevel.ERROR);
  });

  it("throws on unknown string", () => {
    expect(() => parseLevel("trace")).toThrow("Unknown log level");
  });

  it("throws on out-of-range number", () => {
    expect(() => parseLevel(99)).toThrow("Unknown log level number");
  });
});

describe("shouldLog", () => {
  it("logs when message level >= active level", () => {
    expect(shouldLog(LogLevel.ERROR, LogLevel.WARN)).toBe(true);
    expect(shouldLog(LogLevel.WARN, LogLevel.WARN)).toBe(true);
    expect(shouldLog(LogLevel.FATAL, LogLevel.INFO)).toBe(true);
  });

  it("drops when message level < active level", () => {
    expect(shouldLog(LogLevel.INFO, LogLevel.WARN)).toBe(false);
    expect(shouldLog(LogLevel.DEBUG, LogLevel.ERROR)).toBe(false);
    expect(shouldLog(LogLevel.VERBOSE, LogLevel.INFO)).toBe(false);
  });

  it("logs nothing when active level is OFF", () => {
    expect(shouldLog(LogLevel.FATAL, LogLevel.OFF)).toBe(false);
  });

  it("logs everything when active level is VERBOSE", () => {
    expect(shouldLog(LogLevel.VERBOSE, LogLevel.VERBOSE)).toBe(true);
    expect(shouldLog(LogLevel.DEBUG, LogLevel.VERBOSE)).toBe(true);
  });
});
