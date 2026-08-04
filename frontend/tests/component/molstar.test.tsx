import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dispose = vi.fn();
const loadPdb = vi.fn().mockResolvedValue(undefined);

// Fake StructureComponentRefs, keyed the way Mol* actually keys them: the sorted,
// joined tags on the component's state-tree cell (see
// mol-plugin-state/manager/structure/hierarchy-state.js#componentKey), which built-in
// presets set to `structure-component-static-<type>`
// (mol-plugin-state/builder/structure.js#tryCreateComponentStatic).
const polymerComponent = { key: "structure-component-static-polymer" };
const ionComponent = { key: "structure-component-static-ion" };
const structures = [{ components: [polymerComponent, ionComponent] }];

const applyPreset = vi.fn().mockResolvedValue(undefined);
const removeRepresentations = vi.fn().mockResolvedValue(undefined);
const addRepresentation = vi.fn().mockResolvedValue(undefined);

const plugin = {
  managers: {
    structure: {
      hierarchy: { current: { structures } },
      component: { applyPreset, removeRepresentations, addRepresentation },
    },
  },
};

const createViewer = vi.fn().mockResolvedValue({ dispose, loadPdb, plugin });

vi.mock("molstar/lib/apps/viewer/app", () => ({
  Viewer: { create: (...args: unknown[]) => createViewer(...args) },
}));

import { MolstarViewer } from "@/components/molecular/MolstarViewer";

describe("MolstarViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadPdb.mockResolvedValue(undefined);
    createViewer.mockResolvedValue({ dispose, loadPdb, plugin });
    applyPreset.mockResolvedValue(undefined);
    removeRepresentations.mockResolvedValue(undefined);
    addRepresentation.mockResolvedValue(undefined);
  });

  it("creates exactly one viewer instance", async () => {
    render(<MolstarViewer pdbId="1EHZ" />);
    await waitFor(() => expect(createViewer).toHaveBeenCalledTimes(1));
  });

  it("loads the requested entry", async () => {
    render(<MolstarViewer pdbId="1EHZ" />);
    await waitFor(() => expect(loadPdb).toHaveBeenCalledWith("1EHZ"));
  });

  it("disposes the viewer on unmount", async () => {
    const { unmount } = render(<MolstarViewer pdbId="1EHZ" />);
    await waitFor(() => expect(createViewer).toHaveBeenCalled());
    unmount();
    await waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
  });

  it("renders a labelled container before the viewer initialises", () => {
    const { getByRole } = render(<MolstarViewer pdbId="1EHZ" />);
    // The shell must be present immediately — Mol* takes seconds to initialise and
    // a blank area reads as a broken page.
    expect(getByRole("region", { name: /3D structure/i })).toBeInTheDocument();
  });

  it("reports a load failure instead of leaving an empty canvas", async () => {
    loadPdb.mockRejectedValueOnce(new Error("network"));
    const { findByRole } = render(<MolstarViewer pdbId="BAD1" />);
    expect(await findByRole("alert")).toHaveTextContent(/could not load/i);
  });

  it("applies the polymer-and-ligand preset and forces ions to spacefill after load", async () => {
    render(<MolstarViewer pdbId="1EHZ" />);

    await waitFor(() => expect(applyPreset).toHaveBeenCalledTimes(1));
    // "polymer-and-ligand" is the preset that keeps polymer/ligand/ion as separate,
    // independently stylable components, rather than the single collapsed "all"
    // component Mol*'s size-based "auto" default would pick for a small RNA.
    expect(applyPreset).toHaveBeenCalledWith(structures, "polymer-and-ligand");

    await waitFor(() =>
      expect(addRepresentation).toHaveBeenCalledWith([ionComponent], "spacefill"),
    );
    expect(removeRepresentations).toHaveBeenCalledWith([ionComponent]);
  });

  it("switches only the polymer component's representation when the control is used, leaving ions alone", async () => {
    const { getByLabelText } = render(<MolstarViewer pdbId="1EHZ" />);

    // Disabled until Mol* has finished loading and the preset/ion setup has run —
    // otherwise there is no polymer component yet to restyle.
    const select = getByLabelText(/polymer representation/i) as HTMLSelectElement;
    expect(select).toBeDisabled();

    await waitFor(() =>
      expect(addRepresentation).toHaveBeenCalledWith([ionComponent], "spacefill"),
    );
    await waitFor(() => expect(select).not.toBeDisabled());

    removeRepresentations.mockClear();
    addRepresentation.mockClear();

    await userEvent.selectOptions(select, "molecular-surface");

    await waitFor(() =>
      expect(addRepresentation).toHaveBeenCalledWith([polymerComponent], "molecular-surface"),
    );
    expect(removeRepresentations).toHaveBeenCalledWith([polymerComponent]);
    // Ligands and ions must not be touched by a polymer-only representation change.
    expect(removeRepresentations).not.toHaveBeenCalledWith(
      expect.arrayContaining([ionComponent]),
    );
    expect(addRepresentation).not.toHaveBeenCalledWith(
      expect.arrayContaining([ionComponent]),
      expect.anything(),
    );
  });
});
