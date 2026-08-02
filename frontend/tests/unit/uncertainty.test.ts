import { describe, expect, it } from "vitest";
import { formatInterval, overlaps, wilsonCi } from "@/lib/charts/uncertainty";

describe("wilsonCi", () => {
  it("does not claim certainty from a perfect run", () => {
    const interval = wilsonCi(30, 30);
    expect(interval.estimate).toBe(1);
    expect(interval.low).toBeLessThan(1);
  });

  it("matches the Python implementation on the Gate B headline", () => {
    // foldq.analysis.uncertainty.wilson_ci(17, 19) -> [0.686, 0.971]
    const interval = wilsonCi(17, 19);
    expect(interval.estimate).toBeCloseTo(0.8947, 4);
    expect(interval.low).toBeCloseTo(0.686, 2);
    expect(interval.high).toBeCloseTo(0.971, 2);
  });

  it("matches Python on the QAOA reps rates", () => {
    expect(formatInterval(wilsonCi(8, 27))).toBe("[15.9%, 48.5%]");
    expect(formatInterval(wilsonCi(12, 27))).toBe("[27.6%, 62.7%]");
  });

  it("stays inside zero and one", () => {
    for (const [s, t] of [[0, 5], [5, 5], [1, 1], [0, 1]]) {
      const i = wilsonCi(s, t);
      expect(i.low).toBeGreaterThanOrEqual(0);
      expect(i.high).toBeLessThanOrEqual(1);
    }
  });
});

describe("overlaps", () => {
  it("reports the reps intervals as overlapping", () => {
    // The finding the site must not contradict: at n=27 the reps trend is not
    // separable, so an ordered table does not establish that depth helps.
    expect(overlaps(wilsonCi(8, 27), wilsonCi(12, 27))).toBe(true);
  });

  it("reports the shot-budget intervals as separated", () => {
    expect(overlaps(wilsonCi(4, 27), wilsonCi(15, 27))).toBe(false);
  });
});
