import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SolverPerformancePage from "@/app/analytics/solver-performance/page";
import EnergyPage from "@/app/analytics/energy/page";

vi.mock("echarts-for-react", () => ({ default: () => <div data-testid="echart" /> }));

describe("solver performance page", () => {
  it("lists every solver measured in E3", () => {
    render(<SolverPerformancePage />);
    for (const solver of [
      "random",
      "greedy",
      "local_search",
      "tabu",
      "simulated_annealing",
      "path_integral_sqa",
    ]) {
      expect(screen.getAllByText(solver).length).toBeGreaterThan(0);
    }
  });

  it("states how many runs were indeterminate for Gate C", () => {
    render(<SolverPerformancePage />);
    // 270 of 450 rows sit above the exact-solver ceiling. Presenting a
    // ground-state rate without that denominator would overstate certainty.
    expect(screen.getByText(/indeterminate/i)).toBeInTheDocument();
  });

  it("carries no quantum-advantage claim", () => {
    const { container } = render(<SolverPerformancePage />);
    expect(container.textContent!.toLowerCase()).not.toMatch(
      /quantum advantage|outperform|speedup over classical/,
    );
  });

  it("cites the committed CSV", () => {
    render(<SolverPerformancePage />);
    expect(screen.getAllByText(/e3_solvers\.csv/).length).toBeGreaterThan(0);
  });
});

describe("energy page", () => {
  it("shows the four-gate ladder legend", () => {
    render(<EnergyPage />);
    const legend = screen.getByRole("list", { name: /diagnostic ladder/i });
    expect(within(legend).getByText(/representable/i)).toBeInTheDocument();
    expect(within(legend).getByText(/faithful/i)).toBeInTheDocument();
    expect(within(legend).getByText(/solved/i)).toBeInTheDocument();
    expect(within(legend).getByText(/physical/i)).toBeInTheDocument();
  });

  it("breaks results down by attribution category", () => {
    render(<EnergyPage />);
    expect(screen.getAllByText(/no failure/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/energy model/i).length).toBeGreaterThan(0);
  });

  it("explains that attribution names the earliest failing gate", () => {
    render(<EnergyPage />);
    expect(screen.getByText(/earliest failing gate/i)).toBeInTheDocument();
  });
});
