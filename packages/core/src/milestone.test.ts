import { describe, it, expect } from "vitest";
import { MilestoneEngine, type EngineEvent } from "./milestone.js";

const T0 = 1_000_000;

function milestones(events: EngineEvent[]): EngineEvent[] {
  return events.filter((e) => e.kind === "milestone");
}

describe("MilestoneEngine", () => {
  it("fires exactly one event per crossed band with debounce disabled", () => {
    const e = new MilestoneEngine(T0, { debounceMs: 0 });
    const fired: number[] = [];
    let t = T0;
    for (const pct of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
      t += 1000;
      for (const ev of e.progress(pct, t)) {
        if (ev.kind === "milestone") fired.push(ev.milestone);
      }
    }
    // Bands 10..90 (100 is represented by completion, not a milestone).
    expect(fired).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });

  it("coalesces a 5% -> 95% jump into a single milestone notification", () => {
    const e = new MilestoneEngine(T0, { debounceMs: 0 });
    e.progress(5, T0 + 100);
    const out = e.progress(95, T0 + 200);
    const ms = milestones(out);
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ kind: "milestone", milestone: 90 });
    expect((ms[0] as Extract<EngineEvent, { kind: "milestone" }>).skipped).toEqual([
      10, 20, 30, 40, 50, 60, 70, 80,
    ]);
  });

  it("never re-fires past milestones on regression (monotonic default)", () => {
    const e = new MilestoneEngine(T0, { debounceMs: 0 });
    milestones(e.progress(50, T0 + 100));
    const regress = milestones(e.progress(20, T0 + 200)); // rollback
    expect(regress).toHaveLength(0);
    const again = milestones(e.progress(40, T0 + 300)); // climb back, still <= 50
    expect(again).toHaveLength(0);
    const past = milestones(e.progress(60, T0 + 400));
    expect(past.map((m) => (m as { milestone: number }).milestone)).toEqual([60]);
  });

  it("re-fires earlier milestones with allowRegress", () => {
    const e = new MilestoneEngine(T0, { debounceMs: 0, allowRegress: true });
    milestones(e.progress(50, T0 + 100));
    milestones(e.progress(10, T0 + 200)); // regress resets the band to 10
    // Climbing 10 -> 30 in one tick coalesces bands 20 and 30 into one event.
    const out = milestones(e.progress(30, T0 + 300));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ milestone: 30, skipped: [20] });
  });

  it("debounces rapid milestones and coalesces them", () => {
    const e = new MilestoneEngine(T0, { debounceMs: 3000 });
    const a = milestones(e.progress(10, T0 + 100)); // fires (first emit)
    expect(a).toHaveLength(1);
    const b = milestones(e.progress(20, T0 + 200)); // within debounce -> held
    expect(b).toHaveLength(0);
    const c = milestones(e.progress(30, T0 + 300)); // still held
    expect(c).toHaveLength(0);
    const d = milestones(e.tick(T0 + 3200)); // window elapsed -> coalesced flush
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ milestone: 30, skipped: [20] });
  });

  it("respects maxPerMinute", () => {
    const e = new MilestoneEngine(T0, { step: 1, debounceMs: 0, maxPerMinute: 3 });
    let emitted = 0;
    let t = T0;
    for (let pct = 1; pct <= 10; pct++) {
      t += 10;
      emitted += milestones(e.progress(pct, t)).length;
    }
    expect(emitted).toBe(3);
  });

  it("emits a single stalled event and resumes silently", () => {
    const e = new MilestoneEngine(T0, { debounceMs: 0, stallAfterMs: 5000 });
    e.progress(10, T0 + 100);
    const s1 = e.tick(T0 + 6000).filter((x) => x.kind === "stalled");
    expect(s1).toHaveLength(1);
    const s2 = e.tick(T0 + 7000).filter((x) => x.kind === "stalled");
    expect(s2).toHaveLength(0); // no repeat
    e.progress(20, T0 + 8000); // resume
    const s3 = e.tick(T0 + 14000).filter((x) => x.kind === "stalled");
    expect(s3).toHaveLength(1); // new stall episode
  });

  it("includes an ETA once two data points exist", () => {
    const e = new MilestoneEngine(T0, { debounceMs: 0 });
    const a = milestones(e.progress(10, T0 + 1000));
    expect((a[0] as { etaMs: number | null }).etaMs).toBeNull();
    const b = milestones(e.progress(20, T0 + 2000));
    // 10% in 1000ms -> 80% remaining at that rate ~ 8000ms.
    expect((b[0] as { etaMs: number | null }).etaMs).toBeGreaterThan(0);
  });

  it("fires each terminal state exactly once", () => {
    const e = new MilestoneEngine(T0);
    const c1 = e.complete(T0 + 100);
    expect(c1.filter((x) => x.kind === "complete")).toHaveLength(1);
    expect(e.complete(T0 + 200)).toHaveLength(0);
    expect(e.fail("x", 1, T0 + 300)).toHaveLength(0);
    expect(e.cancel(T0 + 400)).toHaveLength(0);
  });

  it("flushes pending milestones before completing", () => {
    const e = new MilestoneEngine(T0, { debounceMs: 10_000 });
    milestones(e.progress(10, T0 + 100)); // first fires
    e.progress(90, T0 + 200); // held by debounce
    const out = e.complete(T0 + 300);
    expect(out.filter((x) => x.kind === "milestone")).toHaveLength(1);
    expect(out.filter((x) => x.kind === "complete")).toHaveLength(1);
  });

  it("supports a custom step", () => {
    const e = new MilestoneEngine(T0, { step: 25, debounceMs: 0 });
    const fired: number[] = [];
    for (const pct of [25, 50, 75, 100]) {
      for (const ev of e.progress(pct, T0 + pct)) {
        if (ev.kind === "milestone") fired.push(ev.milestone);
      }
    }
    expect(fired).toEqual([25, 50, 75]);
  });
});
