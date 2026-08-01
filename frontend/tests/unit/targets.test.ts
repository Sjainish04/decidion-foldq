import { describe, expect, it } from "vitest";
import { RNA_TARGETS } from "@/lib/structures/targets";

describe("RNA targets", () => {
  it("has a unique id and a non-empty query per target", () => {
    const ids = RNA_TARGETS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const target of RNA_TARGETS) {
      expect(target.query.length).toBeGreaterThan(0);
      expect(target.label.length).toBeGreaterThan(0);
      expect(target.description.length).toBeGreaterThan(0);
    }
  });

  it("covers the classes the project already folds", () => {
    // tRNA is not decorative here: the curated benchmark fixture is a tRNA, and
    // its structure is PDB 1EHZ.
    expect(RNA_TARGETS.map((t) => t.id)).toContain("trna");
  });
});
