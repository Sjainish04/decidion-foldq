import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StructureView } from "@/components/rna/StructureView";
import { GateLadder } from "@/components/foldq/GateLadder";

const gates = {
  representable: true,
  representable_fraction: 1,
  is_qubo_ground_state: true,
  solver_found_ground_state: null,
  energy_gap: 0.4,
  base_pair_f1: 0.83,
  is_pseudoknotted: false,
  attribution: "indeterminate: instance too large for exact ground truth",
  notes: ["exact reference unavailable above 22 variables"],
};

describe("StructureView", () => {
  it("labels the structure for assistive technology", () => {
    render(
      <StructureView
        sequence="GGGAAAUCCCU"
        pairs={[
          [0, 9],
          [1, 8],
          [2, 7],
        ]}
        label="Predicted structure"
      />,
    );
    expect(screen.getByRole("img", { name: /predicted structure/i })).toBeInTheDocument();
  });

  it("describes the structure textually alongside the drawing", () => {
    render(<StructureView sequence="GGGAAAUCCCU" pairs={[[0, 9]]} label="s" />);
    expect(screen.getByText(/11 nucleotides/i)).toBeInTheDocument();
    expect(screen.getByText(/1 base pair\b/i)).toBeInTheDocument();
  });

  it("renders the forna-style force layout when selected", () => {
    render(
      <StructureView
        sequence="GGGAAAUCCCU"
        pairs={[
          [0, 9],
          [1, 8],
          [2, 7],
        ]}
        label="Forced structure"
        layout="force"
      />,
    );
    expect(screen.getByRole("img", { name: /forced structure/i })).toBeInTheDocument();
    expect(screen.getByText(/11 nucleotides/i)).toBeInTheDocument();
  });

  it("still renders crossing pairs under the force layout", () => {
    render(
      <StructureView
        sequence="GGGGAAAACCCCAAAA"
        pairs={[
          [0, 9],
          [4, 13],
        ]}
        label="Pseudoknotted structure"
        layout="force"
      />,
    );
    expect(screen.getByText(/2 base pairs/i)).toBeInTheDocument();
  });
});

describe("GateLadder", () => {
  it("renders all four gates with their state as text, not only colour", () => {
    render(<GateLadder gates={gates} />);
    for (const name of ["Representable", "Faithful", "Solved", "Physical"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.getAllByText(/indeterminate/i).length).toBeGreaterThan(0);
  });

  it("shows the backend's attribution verbatim", () => {
    render(<GateLadder gates={gates} />);
    expect(screen.getByText(gates.attribution)).toBeInTheDocument();
  });

  it("surfaces gate notes", () => {
    render(<GateLadder gates={gates} />);
    expect(screen.getByText(/above 22 variables/)).toBeInTheDocument();
  });
});
