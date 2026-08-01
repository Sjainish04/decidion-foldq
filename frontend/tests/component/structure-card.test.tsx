import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StructureCard } from "@/components/molecular/StructureCard";
import { structureSchema } from "@/lib/structures/schemas";
import response from "../msw/structures-response.json";

const structure = structureSchema.parse(response.structures[0]);

describe("StructureCard", () => {
  it("shows the experimental method, never implying a prediction", () => {
    render(<StructureCard structure={structure} />);
    expect(screen.getByText(new RegExp(structure.method, "i"))).toBeInTheDocument();
  });

  it("shows the resolution with units", () => {
    render(<StructureCard structure={structure} />);
    if (structure.resolution !== null) {
      expect(screen.getByText(/Å/)).toBeInTheDocument();
    }
  });

  it("states when the record was retrieved", () => {
    render(<StructureCard structure={structure} />);
    expect(screen.getByText(new RegExp(structure.retrieved))).toBeInTheDocument();
  });

  it("reports no resolution rather than a blank for an NMR entry", () => {
    render(
      <StructureCard structure={{ ...structure, resolution: null, method: "SOLUTION NMR" }} />,
    );
    expect(screen.getByText(/no resolution reported/i)).toBeInTheDocument();
  });

  it("offers to fold the entity sequence when one is present", async () => {
    const onFold = vi.fn();
    render(<StructureCard structure={structure} onFold={onFold} />);
    await userEvent.click(screen.getByRole("button", { name: /fold this sequence/i }));
    expect(onFold).toHaveBeenCalledWith(structure.rna_sequence);
  });

  it("does not offer folding when the entry carries no RNA sequence", () => {
    render(
      <StructureCard
        structure={{ ...structure, rna_sequence: null, rna_length: null }}
        onFold={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /fold this sequence/i })).toBeNull();
  });
});
