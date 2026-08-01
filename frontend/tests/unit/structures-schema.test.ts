import { describe, expect, it } from "vitest";
import { structureSchema } from "@/lib/structures/schemas";
import response from "../msw/structures-response.json";

describe("structure schema", () => {
  it("parses every structure in a real captured response", () => {
    for (const structure of response.structures) {
      expect(() => structureSchema.parse(structure)).not.toThrow();
    }
  });

  it("accepts a null resolution for an NMR entry", () => {
    const nmr = { ...response.structures[0], resolution: null, method: "SOLUTION NMR" };
    expect(() => structureSchema.parse(nmr)).not.toThrow();
  });

  it("accepts a structure with no bound ligands", () => {
    expect(() =>
      structureSchema.parse({ ...response.structures[0], ligands: [] }),
    ).not.toThrow();
  });

  it("rejects a structure missing its retrieval date", () => {
    const undated: Record<string, unknown> = { ...response.structures[0] };
    delete undated.retrieved;
    expect(() => structureSchema.parse(undated)).toThrow(/retrieved/);
  });
});
