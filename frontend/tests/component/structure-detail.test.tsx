import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StructureDetailPage from "@/app/structures/[pdbId]/page";
import response from "../msw/structures-response.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ pdbId: response.structures[0].pdb_id }),
  useRouter: () => ({ push }),
  usePathname: () => "/structures/x",
}));
vi.mock("@/components/molecular/MolstarViewer", () => ({
  MolstarViewer: ({ pdbId }: { pdbId: string }) => (
    <div data-testid="molstar" data-pdb={pdbId} />
  ),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StructureDetailPage />
    </QueryClientProvider>,
  );
}

describe("structure detail", () => {
  it("mounts the 3D viewer for the requested entry", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("molstar")).toHaveAttribute(
        "data-pdb",
        response.structures[0].pdb_id,
      ),
    );
  });

  it("shows the RNA sequence RCSB reports for the entry", async () => {
    renderPage();
    const sequence = response.structures[0].rna_sequence;
    if (sequence) {
      expect(await screen.findByText(new RegExp(sequence.slice(0, 20)))).toBeInTheDocument();
    }
  });

  it("links out to the RCSB entry page", async () => {
    renderPage();
    const link = await screen.findByRole("link", { name: /view on rcsb/i });
    expect(link).toHaveAttribute(
      "href",
      `https://www.rcsb.org/structure/${response.structures[0].pdb_id}`,
    );
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("sends the entity sequence to the wizard", async () => {
    renderPage();
    const button = await screen.findByRole("button", { name: /fold this sequence/i });
    await userEvent.click(button);
    expect(push).toHaveBeenCalledWith("/foldq/new");
  });
});
