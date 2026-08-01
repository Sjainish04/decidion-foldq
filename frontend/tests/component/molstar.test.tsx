import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const dispose = vi.fn();
const loadPdb = vi.fn().mockResolvedValue(undefined);
const createViewer = vi.fn().mockResolvedValue({ dispose, loadPdb });

vi.mock("molstar/lib/apps/viewer/app", () => ({
  Viewer: { create: (...args: unknown[]) => createViewer(...args) },
}));

import { MolstarViewer } from "@/components/molecular/MolstarViewer";

describe("MolstarViewer", () => {
  it("creates exactly one viewer instance", async () => {
    render(<MolstarViewer pdbId="1EHZ" />);
    await waitFor(() => expect(createViewer).toHaveBeenCalledTimes(1));
  });

  it("loads the requested entry", async () => {
    createViewer.mockClear();
    loadPdb.mockClear();
    render(<MolstarViewer pdbId="1EHZ" />);
    await waitFor(() => expect(loadPdb).toHaveBeenCalledWith("1EHZ"));
  });

  it("disposes the viewer on unmount", async () => {
    dispose.mockClear();
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
});
