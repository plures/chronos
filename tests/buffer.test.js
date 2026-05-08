import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRollingBuffer } from "../src/buffer.js";

describe("RollingBuffer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts empty", () => {
    const buf = createRollingBuffer();
    expect(buf.stats().count).toBe(0);
  });

  it("push increments count", () => {
    const buf = createRollingBuffer();
    buf.push({ key: "k1", before: null, after: 1 });
    buf.push({ key: "k2", before: null, after: 2 });
    expect(buf.stats().count).toBe(2);
  });

  it("ring wraps at maxEntries", () => {
    const buf = createRollingBuffer({ maxEntries: 3 });
    buf.push({ key: "k1", before: null, after: 1 });
    buf.push({ key: "k2", before: null, after: 2 });
    buf.push({ key: "k3", before: null, after: 3 });
    buf.push({ key: "k4", before: null, after: 4 }); // overwrites k1
    expect(buf.stats().count).toBe(3); // capped at 3
    const entries = buf.drain();
    const keys = entries.map((e) => e.key);
    expect(keys).toContain("k4");
    expect(keys).not.toContain("k1");
  });

  it("drain returns entries in chronological order", () => {
    const buf = createRollingBuffer();
    vi.setSystemTime(1000);
    buf.push({ key: "k1", before: null, after: 1 });
    vi.setSystemTime(2000);
    buf.push({ key: "k2", before: null, after: 2 });
    vi.setSystemTime(3000);
    buf.push({ key: "k3", before: null, after: 3 });

    const entries = buf.drain();
    expect(entries[0].key).toBe("k1");
    expect(entries[1].key).toBe("k2");
    expect(entries[2].key).toBe("k3");
  });

  it("flush returns ChronicleNodes within window", () => {
    const buf = createRollingBuffer({ windowMs: 5000 });

    vi.setSystemTime(1000);
    buf.push({ key: "old", before: null, after: "old" });

    vi.setSystemTime(10000); // 9 seconds later — "old" is outside 5s window
    buf.push({ key: "recent", before: null, after: "recent" });

    const nodes = buf.flush();
    // Only "recent" should be in the flush (within 5s window)
    expect(nodes.length).toBe(1);
    expect(nodes[0].path).toBe("recent");
  });

  it("flush clears the buffer", () => {
    const buf = createRollingBuffer();
    buf.push({ key: "k1", before: null, after: 1 });
    buf.flush();
    expect(buf.stats().count).toBe(0);
  });

  it("clear empties the buffer", () => {
    const buf = createRollingBuffer();
    buf.push({ key: "k1", before: null, after: 1 });
    buf.push({ key: "k2", before: null, after: 2 });
    buf.clear();
    expect(buf.stats().count).toBe(0);
    expect(buf.drain()).toEqual([]);
  });

  it("preserves cause and context", () => {
    const buf = createRollingBuffer();
    buf.push({
      key: "k1",
      before: null,
      after: 1,
      cause: "cause:1",
      context: "session:abc",
    });
    const entries = buf.drain();
    expect(entries[0].cause).toBe("cause:1");
    expect(entries[0].context).toBe("session:abc");
  });
});
