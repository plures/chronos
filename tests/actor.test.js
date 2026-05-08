import { describe, it, expect } from "vitest";
import {
  createActor,
  ActorKind,
  isProvisional,
  isHuman,
  createProvisionalTracker,
} from "../src/actor.js";

describe("Actor", () => {
  it("creates with required fields", () => {
    const actor = createActor(ActorKind.HUMAN, "user:kbristol");
    expect(actor.kind).toBe("human");
    expect(actor.id).toBe("user:kbristol");
    expect(actor.session).toBeNull();
    expect(actor.metadata).toBeNull();
  });

  it("creates with optional fields", () => {
    const actor = createActor(ActorKind.AI, "ai:cerebellum", {
      session: "turn:123",
      metadata: { model: "claude-opus" },
    });
    expect(actor.session).toBe("turn:123");
    expect(actor.metadata.model).toBe("claude-opus");
  });

  it("isProvisional for AI", () => {
    expect(isProvisional(createActor(ActorKind.AI, "ai:x"))).toBe(true);
    expect(isProvisional(createActor(ActorKind.HUMAN, "user:x"))).toBe(false);
    expect(isProvisional(createActor(ActorKind.SYSTEM, "sys:x"))).toBe(false);
  });

  it("isHuman", () => {
    expect(isHuman(createActor(ActorKind.HUMAN, "user:x"))).toBe(true);
    expect(isHuman(createActor(ActorKind.AI, "ai:x"))).toBe(false);
  });
});

describe("ProvisionalTracker", () => {
  const human = createActor(ActorKind.HUMAN, "user:kbristol");
  const ai = createActor(ActorKind.AI, "ai:cerebellum", { session: "turn:1" });

  it("starts empty", () => {
    const tracker = createProvisionalTracker();
    expect(tracker.stats().pendingCount).toBe(0);
    expect(tracker.listPending()).toEqual([]);
  });

  it("commit sets baseline", () => {
    const tracker = createProvisionalTracker();
    tracker.commit("editor:file.ts", "const x = 1;", human);
    expect(tracker.getDisplayValue("editor:file.ts")).toBe("const x = 1;");
    expect(tracker.hasPending("editor:file.ts")).toBe(false);
  });

  it("propose creates pending entry", () => {
    const tracker = createProvisionalTracker();
    tracker.commit("editor:file.ts", "const x = 1;", human);
    tracker.propose("editor:file.ts", "const x = 2;", ai);

    expect(tracker.hasPending("editor:file.ts")).toBe(true);
    const pending = tracker.getPending("editor:file.ts");
    expect(pending.committed).toBe("const x = 1;");
    expect(pending.provisional).toBe("const x = 2;");
    expect(pending.actor.id).toBe("ai:cerebellum");
  });

  it("getDisplayValue returns provisional when pending", () => {
    const tracker = createProvisionalTracker();
    tracker.commit("k", "old", human);
    tracker.propose("k", "new", ai);
    expect(tracker.getDisplayValue("k")).toBe("new");
  });

  it("accept promotes provisional to committed", () => {
    const tracker = createProvisionalTracker();
    tracker.commit("k", "v1", human);
    tracker.propose("k", "v2", ai);

    expect(tracker.accept("k")).toBe(true);
    expect(tracker.hasPending("k")).toBe(false);
    expect(tracker.getDisplayValue("k")).toBe("v2");
  });

  it("reject reverts to committed", () => {
    const tracker = createProvisionalTracker();
    tracker.commit("k", "v1", human);
    tracker.propose("k", "v2", ai);

    const reverted = tracker.reject("k");
    expect(reverted).toBe("v1");
    expect(tracker.hasPending("k")).toBe(false);
    expect(tracker.getDisplayValue("k")).toBe("v1");
  });

  it("acceptGroup accepts all in group", () => {
    const tracker = createProvisionalTracker();
    tracker.commit("a", "a1", human);
    tracker.commit("b", "b1", human);
    tracker.commit("c", "c1", human);

    tracker.propose("a", "a2", ai, "batch:1");
    tracker.propose("b", "b2", ai, "batch:1");
    tracker.propose("c", "c2", ai, "batch:2"); // different group

    const accepted = tracker.acceptGroup("batch:1");
    expect(accepted).toEqual(["a", "b"]);
    expect(tracker.hasPending("a")).toBe(false);
    expect(tracker.hasPending("b")).toBe(false);
    expect(tracker.hasPending("c")).toBe(true); // different group, untouched
  });

  it("rejectGroup reverts all in group", () => {
    const tracker = createProvisionalTracker();
    tracker.commit("a", "a1", human);
    tracker.commit("b", "b1", human);
    tracker.propose("a", "a2", ai, "batch:1");
    tracker.propose("b", "b2", ai, "batch:1");

    const rejected = tracker.rejectGroup("batch:1");
    expect(rejected).toEqual([
      { key: "a", revertTo: "a1" },
      { key: "b", revertTo: "b1" },
    ]);
    expect(tracker.stats().pendingCount).toBe(0);
  });

  it("listGroup filters by groupId", () => {
    const tracker = createProvisionalTracker();
    tracker.commit("a", "a1", human);
    tracker.commit("b", "b1", human);
    tracker.propose("a", "a2", ai, "g1");
    tracker.propose("b", "b2", ai, "g2");

    expect(tracker.listGroup("g1").length).toBe(1);
    expect(tracker.listGroup("g1")[0].key).toBe("a");
  });

  it("human commit clears pending", () => {
    const tracker = createProvisionalTracker();
    tracker.commit("k", "v1", human);
    tracker.propose("k", "v2", ai);
    expect(tracker.hasPending("k")).toBe(true);

    // Human overrides directly
    tracker.commit("k", "v3", human);
    expect(tracker.hasPending("k")).toBe(false);
    expect(tracker.getDisplayValue("k")).toBe("v3");
  });
});
