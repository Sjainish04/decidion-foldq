import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { StructureComparison } from "@/components/foldq/StructureComparison";
import type { FoldResponse } from "@/lib/api/schemas";

function result(): FoldResponse {
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
      is_pseudoknotted: false,
      was_repaired: false,
      repair_count: 0,
    },
    reference: {
      dot_bracket: "(((......)))",
      energy: -4.6,
      base_pairs: [
        [0, 11],
        [1, 10],
        [2, 9],
      ],
    },
    gates: { is_pseudoknotted: false },
    problem: {},
  } as unknown as FoldResponse;
}

/** Coordinates of every drawn nucleotide, per panel. */
function positions(container: HTMLElement): string[][] {
  return Array.from(container.querySelectorAll("svg")).map((svg) =>
    Array.from(svg.querySelectorAll("circle")).map(
      (circle) => `${circle.getAttribute("cx")},${circle.getAttribute("cy")}`,
    ),
  );
}

describe("StructureComparison", () => {
  it("defaults to the force-directed layout", () => {
    render(<StructureComparison result={result()} />);
    expect(screen.getByLabelText("Layout")).toHaveValue("force");
  });

  it("switches both panels together, never one at a time", async () => {
    const user = userEvent.setup();
    const { container } = render(<StructureComparison result={result()} />);

    const [candidateBefore, referenceBefore] = positions(container);
    await user.selectOptions(screen.getByLabelText("Layout"), "circular");
    const [candidateAfter, referenceAfter] = positions(container);

    // Both moved. If only one had, the two panels would be drawn by different
    // algorithms and could not be compared by eye — the entire point of the view.
    expect(candidateAfter).not.toEqual(candidateBefore);
    expect(referenceAfter).not.toEqual(referenceBefore);

    // These two structures are identical, so under one shared layout their
    // drawings must coincide exactly.
    expect(candidateAfter).toEqual(referenceAfter);
  });

  it("explains what the selected layout shows", async () => {
    const user = userEvent.setup();
    render(<StructureComparison result={result()} />);
    expect(screen.getByText(/helices form ladders/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Layout"), "circular");
    expect(screen.getByText(/crossing chords are pseudoknots/i)).toBeInTheDocument();
  });
});
