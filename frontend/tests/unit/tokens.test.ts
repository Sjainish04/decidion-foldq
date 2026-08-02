import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/globals.css", "utf8");

describe("design tokens", () => {
  it("defines every nucleotide colour", () => {
    for (const token of ["--rna-a", "--rna-u", "--rna-c", "--rna-g"]) {
      expect(css).toContain(token);
    }
  });

  it("defines a colour per solver class", () => {
    for (const token of ["--classical", "--quantum-inspired", "--quantum", "--reference"]) {
      expect(css).toContain(token);
    }
  });

  it("defines both themes", () => {
    expect(css).toContain(":root");
    expect(css).toContain(".dark");
  });

  it("respects reduced motion", () => {
    expect(css).toContain("prefers-reduced-motion");
  });

  it("defines a text accent per theme, distinct from the chart colour", () => {
    // --quantum-inspired is a chart colour: against every surface in either theme
    // it sits between 3.87:1 and 4.35:1 — enough for a non-text graphic (WCAG
    // 1.4.11 wants 3:1) but short of the 4.5:1 WCAG 1.4.3 AA demands of text.
    // axe caught two such uses in review. No single value works as text in both
    // themes, since it must darken against white and lighten against near black,
    // so the accent is defined twice and must never collapse back to one.
    expect(css).toContain("--accent-text");
    expect(css).toContain("--accent-strong");
    const light = css.match(/:root\s*\{[\s\S]*?\}/)![0];
    const dark = css.match(/\.dark\s*\{[\s\S]*?\}/)![0];
    const value = (block: string) => block.match(/--accent-text:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(value(light)).toBeDefined();
    expect(value(dark)).toBeDefined();
    expect(value(light)).not.toBe(value(dark));
  });
});
