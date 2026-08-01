import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ScalingPage from "@/app/analytics/scaling/page";
import ResourcesPage from "@/app/analytics/resources/page";
import PseudoknotsPage from "@/app/analytics/pseudoknots/page";

vi.mock("echarts-for-react", () => ({ default: () => <div data-testid="echart" /> }));

describe("scaling page", () => {
  it("shows both encodings at matched representability", () => {
    render(<ScalingPage />);
    expect(screen.getAllByText(/pair/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/maximal/i).length).toBeGreaterThan(0);
  });

  it("attributes the representability ceiling to lone base pairs", () => {
    render(<ScalingPage />);
    expect(screen.getByText(/lone base pair/i)).toBeInTheDocument();
  });
});

describe("resources page", () => {
  it("reports circuit depth and two-qubit gate counts", () => {
    render(<ResourcesPage />);
    expect(screen.getAllByText(/two-qubit/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/circuit depth/i).length).toBeGreaterThan(0);
  });

  it("states the negative result without hedging", () => {
    render(<ResourcesPage />);
    expect(
      screen.getByText(/does not (beat|outperform) classical heuristics/i),
    ).toBeInTheDocument();
  });

  it("labels the noise arm as local calibration data, not hardware", () => {
    render(<ResourcesPage />);
    expect(screen.getByText(/no live hardware|local simulator/i)).toBeInTheDocument();
    expect(screen.getAllByText(/fake_hanoi/).length).toBeGreaterThan(0);
  });

  it("shows the shot budget as an axis, not only circuit depth", () => {
    render(<ResourcesPage />);
    expect(screen.getAllByText(/shots/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/sampling budget/i)).toBeInTheDocument();
  });

  it("states the configuration CVaR was compared at", () => {
    render(<ResourcesPage />);
    // Naming the setting is the guard against the pooled comparison that made
    // CVaR look worse for a reason that was the shot budget.
    expect(screen.getByText(/reps=3.*256 shots|256 shots.*reps=3/i)).toBeInTheDocument();
    expect(screen.getByText(/indistinguishable/i)).toBeInTheDocument();
  });
});

describe("pseudoknots page", () => {
  it("shows ViennaRNA, strict mode and pseudoknot mode side by side", () => {
    render(<PseudoknotsPage />);
    expect(screen.getAllByText(/ViennaRNA/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/strict/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/pseudoknot mode/i).length).toBeGreaterThan(0);
  });

  it("renders the constructed-fixture caveat from the data itself", () => {
    render(<PseudoknotsPage />);
    expect(screen.getAllByText(/CONSTRUCTED/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/no citation claimed/).length).toBeGreaterThan(0);
  });

  it("explains why ViennaRNA cannot represent a crossing", () => {
    render(<PseudoknotsPage />);
    expect(screen.getByText(/cannot express a crossing/i)).toBeInTheDocument();
  });

  it("reports the tRNA limitation alongside the wins", () => {
    render(<PseudoknotsPage />);
    expect(screen.getAllByText(/trna/i).length).toBeGreaterThan(0);
  });
});
