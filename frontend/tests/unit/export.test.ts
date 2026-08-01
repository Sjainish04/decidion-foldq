import { describe, expect, it } from "vitest";
import { runToCsvRow, CSV_HEADER } from "@/lib/foldq/export";
import fixture from "../msw/fold-response.json";
import { foldResponseSchema } from "@/lib/api/schemas";

const result = foldResponseSchema.parse(fixture);

describe("runToCsvRow", () => {
  it("emits one field per header column", () => {
    expect(runToCsvRow(result).split(",")).toHaveLength(CSV_HEADER.split(",").length);
  });

  it("carries the attribution quoted, since it contains a colon and spaces", () => {
    expect(runToCsvRow(result)).toContain(`"${result.gates.attribution}"`);
  });

  it("writes an empty field for an unavailable gate rather than false", () => {
    const indeterminate = {
      ...result,
      gates: { ...result.gates, is_qubo_ground_state: null, solver_found_ground_state: null },
    };
    const fields = runToCsvRow(indeterminate).split(",");
    const headers = CSV_HEADER.split(",");
    expect(fields[headers.indexOf("is_qubo_ground_state")]).toBe("");
    expect(fields[headers.indexOf("solver_found_ground_state")]).toBe("");
  });
});
