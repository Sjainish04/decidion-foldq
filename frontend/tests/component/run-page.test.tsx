import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RunPage from "@/app/foldq/runs/[runId]/page";
import fixture from "../msw/fold-response.json";

vi.mock("next/navigation", () => ({
  useParams: () => ({ runId: fixture.run_id }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/foldq/runs/x",
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RunPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sessionStorage.setItem(`foldq:run:${fixture.run_id}`, JSON.stringify(fixture));
});

describe("run page", () => {
  it("shows the candidate and reference structures side by side", async () => {
    renderPage();
    expect(await screen.findByRole("img", { name: /FoldQ candidate/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /ViennaRNA reference/i })).toBeInTheDocument();
  });

  it("renders the gate ladder with the backend's attribution", async () => {
    renderPage();
    expect(await screen.findByText(fixture.gates.attribution)).toBeInTheDocument();
  });

  it("reports QUBO size and density", async () => {
    renderPage();
    expect(await screen.findByText(String(fixture.problem.num_variables))).toBeInTheDocument();
    expect(screen.getByText(/variables/i)).toBeInTheDocument();
  });

  it("shows the stage breakdown labelled as approximate", async () => {
    renderPage();
    expect(await screen.findByText(/approximate/i)).toBeInTheDocument();
    for (const stage of ["reference", "qubo", "solve", "gates"]) {
      expect(screen.getAllByText(new RegExp(stage, "i")).length).toBeGreaterThan(0);
    }
  });

  it("makes the run reproducible from the page itself", async () => {
    renderPage();
    expect(await screen.findByText(new RegExp(fixture.solver))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`seed ${fixture.seed}`, "i"))).toBeInTheDocument();
  });

  it("re-folds when the run is not in session storage", async () => {
    sessionStorage.clear();
    renderPage();
    // The MSW handler answers the refetch with the same fixture.
    expect(await screen.findByText(fixture.gates.attribution)).toBeInTheDocument();
  });
});
