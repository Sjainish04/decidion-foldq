import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StructureExport } from "@/components/rna/StructureExport";
import type { FoldResponse } from "@/lib/api/schemas";

function result(pseudoknotted = false): FoldResponse {
  return {
    run_id: "abc123",
    sequence: "GGGAAAAACCCU",
    solver: "simulated_annealing",
    seed: 42,
    candidate: {
      dot_bracket: "(((......)))",
      energy: -4.25,
      base_pairs: [
        [0, 11],
        [1, 10],
        [2, 9],
      ],
    },
    reference: { dot_bracket: "", energy: null, base_pairs: [] },
    gates: { is_pseudoknotted: pseudoknotted },
    problem: {},
  } as unknown as FoldResponse;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StructureExport", () => {
  it("offers the pseudoknot-capable formats", () => {
    render(<StructureExport result={result()} />);
    expect(screen.getByRole("button", { name: /CT/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /BPSEQ/ })).toBeInTheDocument();
  });

  it("downloads a CT file whose contents are the real format", async () => {
    const user = userEvent.setup();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const created: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      created.push(blob as Blob);
      return "blob:mock";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    render(<StructureExport result={result()} />);
    await user.click(screen.getByRole("button", { name: /CT/ }));

    expect(click).toHaveBeenCalled();
    const text = await created[0].text();
    expect(text.split("\n")[0]).toContain("ENERGY = -4.25");
    expect(text.split("\n")[1].split("\t")).toEqual(["1", "G", "0", "2", "12", "1"]);
  });

  it("warns that dot-bracket may not survive a pseudoknotted structure", () => {
    render(<StructureExport result={result(true)} />);
    expect(screen.getByText(/may not survive/i)).toBeInTheDocument();
  });

  it("links out to XRNA-React, which has no importable package", () => {
    render(<StructureExport result={result()} />);
    const link = screen.getByRole("link", { name: "XRNA-React" });
    expect(link).toHaveAttribute("href", "https://ldwlab.github.io/XRNA-React/");
    // An external link opened in a new tab must not hand the opener over.
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });
});
