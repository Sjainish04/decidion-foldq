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

  it("uses the Decidion palette", () => {
    // Brand values from decidion-ai.vercel.app, so a reviewer can check them
    // against the source rather than take the resemblance on trust.
    for (const [name, hex] of [
      ["ink", "#0a1628"],
      ["clinical", "#0f2540"],
      ["bone", "#faf7f2"],
      ["sand", "#efe9df"],
      ["line", "#d6d2c8"],
      ["muted", "#5c6678"],
      ["terracotta", "#d97757"],
      ["cyan", "#7bb8c9"],
    ]) {
      expect(css, `${name} (${hex}) missing`).toContain(hex);
    }
  });

  it("sets Times New Roman for body text and keeps numbers monospaced", () => {
    expect(css).toMatch(/--font-body:\s*"Times New Roman"/);
    // Serif proportional digits make a column of measurements ragged, and almost
    // every number on this site sits in a table meant to be read down.
    expect(css).toMatch(/--font-mono:/);
    expect(css).toMatch(/\.tabular-nums[\s\S]*?font-family:\s*var\(--font-mono\)/);
  });

  it("does not use raw terracotta for text", () => {
    // #d97757 reaches only 2.6-3.1:1 on these warm backgrounds. It stays a chart
    // colour; --accent-text is the darkened variant that passes 4.5:1.
    const light = css.match(/:root\s*\{[\s\S]*?\}/)![0];
    expect(light).toMatch(/--accent-text:\s*#af4928/);
    expect(light).not.toMatch(/--accent-text:\s*#d97757/);
  });
});
