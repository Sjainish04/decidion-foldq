import { describe, expect, it } from "vitest";
import { headlineStats } from "@/lib/charts/headline";
import { qaoaByReps, solverSummary } from "@/lib/charts/transforms";

describe("headlineStats", () => {
  const stats = headlineStats();

  it("cites a committed file for every figure", () => {
    for (const stat of stats) expect(stat.source).toMatch(/^results\/full\/e\d_/);
  });

  it("derives the QAOA range from the data rather than a literal", () => {
    const qaoa = stats.find((s) => s.label.match(/QAOA/i))!;
    const rates = qaoaByReps().map((r) => Math.round(r.groundStateRate * 100));
    expect(qaoa.value).toBe(`${Math.min(...rates)}–${Math.max(...rates)}%`);
  });

  it("derives the classical ground-state count from the data", () => {
    const classical = stats.find((s) => s.label.match(/classical/i))!;
    const perfect = solverSummary().filter((r) => r.groundStateRate === 1).length;
    expect(classical.value).toContain(String(perfect));
  });

  it("includes the pseudoknot result and the tRNA limitation", () => {
    const labels = stats.map((s) => s.label.toLowerCase()).join(" ");
    expect(labels).toMatch(/pseudoknot/);
    expect(labels).toMatch(/trna|hardest|lowest/);
  });
});
