import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StructuresPage from "@/app/structures/page";
import response from "../msw/structures-response.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/structures",
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StructuresPage />
    </QueryClientProvider>,
  );
}

describe("target selection", () => {
  it("offers a target class before any structure", async () => {
    renderPage();
    const targets = screen.getByRole("group", { name: /target/i });
    expect(within(targets).getByRole("button", { name: /tRNA/i })).toBeInTheDocument();
    expect(within(targets).getByRole("button", { name: /riboswitch/i })).toBeInTheDocument();
  });

  it("filters the structure list when a target is chosen", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /riboswitch/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /riboswitch/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });

  it("lets a target be cleared back to all RNA structures", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /tRNA/i }));
    await userEvent.click(screen.getByRole("button", { name: /tRNA/i }));
    expect(screen.getByRole("button", { name: /tRNA/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("structures page", () => {
  it("lists structures best resolution first", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("article").length).toBeGreaterThan(0));
    const shown = screen
      .getAllByText(/Å$/)
      .map((node) => Number.parseFloat(node.textContent!));
    expect(shown).toEqual([...shown].sort((a, b) => a - b));
  });

  it("states that only experimental structures are listed", async () => {
    renderPage();
    expect(
      await screen.findByText(/experimentally determined|no predicted models/i),
    ).toBeInTheDocument();
  });

  it("filters by resolution", async () => {
    renderPage();
    const slider = await screen.findByLabelText(/maximum resolution/i);
    await userEvent.clear(slider);
    await userEvent.type(slider, "1.5");
    await waitFor(() => expect(screen.getByDisplayValue("1.5")).toBeInTheDocument());
  });

  it("sends the sequence to the wizard when folding a structure", async () => {
    renderPage();
    const buttons = await screen.findAllByRole("button", { name: /fold this sequence/i });
    await userEvent.click(buttons[0]);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/foldq/new"));
  });

  it("reports an RCSB outage without breaking the page", async () => {
    const { server } = await import("../msw/handlers");
    const { http, HttpResponse } = await import("msw");
    server.use(
      http.get("*/api/v1/structures/search", () =>
        HttpResponse.json({ detail: "RCSB PDB is unavailable" }, { status: 503 }),
      ),
    );
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(/RCSB PDB is unavailable/i);
  });
});
