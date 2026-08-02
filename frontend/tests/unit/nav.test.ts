import { describe, expect, it } from "vitest";
import { NAV_SECTIONS } from "@/lib/nav";

const all = NAV_SECTIONS.flatMap((s) => s.items);

describe("navigation", () => {
  it("organizes the site into the four reviewer-requested top-level sections", () => {
    expect(NAV_SECTIONS.map((s) => s.label)).toEqual([
      "Models",
      "ML Workflow",
      "Design Theory",
      "Analysis & Data",
    ]);
  });

  it("covers every route group in the design", () => {
    const hrefs = all.map((i) => i.href);
    for (const href of [
      "/dashboard",
      "/foldq/new",
      "/analytics/solver-performance",
      "/analytics/energy",
      "/analytics/scaling",
      "/analytics/resources",
      "/design-theory",
      "/analytics/multivariate",
    ]) {
      expect(hrefs).toContain(href);
    }
  });

  it("has no duplicate hrefs", () => {
    const hrefs = all.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("links only to routes this plan builds", () => {
    // A nav entry pointing at an unbuilt route ships a 404 in the primary
    // navigation. Phase 5-6 routes get added here when their pages land.
    const built = [
      "/dashboard",
      "/foldq/new",
      "/foldq/compare",
      "/analytics/solver-performance",
      "/analytics/energy",
      "/analytics/scaling",
      "/analytics/resources",
      "/analytics/pseudoknots",
      "/analytics/multivariate",
      "/structures",
      "/references",
      "/design-theory",
    ];
    expect(all.map((i) => i.href).sort()).toEqual([...built].sort());
  });
});
