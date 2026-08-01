import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewAnalysisPage from "@/app/foldq/new/page";
import { useWorkspace } from "@/stores/workspace";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/foldq/new",
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NewAnalysisPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  push.mockClear();
  useWorkspace.getState().reset();
});

describe("analysis wizard", () => {
  it("rejects a sequence containing an invalid nucleotide", async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/sequence/i), "GGXAU");
    expect(await screen.findByText(/invalid nucleotide/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fold/i })).toBeDisabled();
  });

  it("normalizes T to U and uppercases input", async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/sequence/i), "gggaaatccct");
    expect(screen.getByLabelText(/sequence/i)).toHaveValue("GGGAAAUCCCU");
  });

  it("shows the sequence length and GC content as you type", async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/sequence/i), "GGGAAAUCCCU");
    expect(screen.getByText(/11 nt/)).toBeInTheDocument();
    expect(screen.getByText(/54\.5% GC/)).toBeInTheDocument();
  });

  it("lists solvers from the API", async () => {
    renderPage();
    const picker = await screen.findByLabelText(/solver/i);
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /simulated_annealing/ })).toBeInTheDocument(),
    );
    expect(picker).toBeInTheDocument();
  });

  it("warns that pseudoknot mode changes what the F1 is measured against", async () => {
    renderPage();
    await userEvent.click(screen.getByLabelText(/allow pseudoknots/i));
    expect(
      screen.getByText(/precision against a nested reference is capped/i),
    ).toBeInTheDocument();
  });

  it("navigates to the run page on submit", async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/sequence/i), "GGGAAAUCCCU");
    await userEvent.click(screen.getByRole("button", { name: /fold/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/foldq\/runs\//)));
  });

  it("surfaces a backend error instead of failing silently", async () => {
    const { server } = await import("../msw/handlers");
    const { http, HttpResponse } = await import("msw");
    server.use(
      http.post("*/api/v1/fold", () =>
        HttpResponse.json({ detail: "sequence too long" }, { status: 422 }),
      ),
    );
    renderPage();
    await userEvent.type(screen.getByLabelText(/sequence/i), "GGGAAAUCCCU");
    await userEvent.click(screen.getByRole("button", { name: /fold/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/sequence too long/i);
  });
});
