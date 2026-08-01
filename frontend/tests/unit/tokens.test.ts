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
});
