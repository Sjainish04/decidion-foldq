import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MultivariatePage from "@/app/analytics/multivariate/page";

vi.mock("echarts-for-react", () => ({ default: () => <div data-testid="echart" /> }));

// Expected numbers below are computed directly from the committed
// results/full/e7_analysis.json (mirrored at src/lib/analysis/data.json), not
// re-derived independently -- e.g. gate_b partial dependence for energy_model
// is charge_refund=0.8947368421052632 (n=114) vs stacking_only=0.5087719298245614
// (n=57), which the page's fixed3() formatting renders as "0.895" / "0.509".
// container.textContent is used (rather than RTL's getByText) for anything
// spanning a <strong> boundary, since Testing Library's default text matcher
// only joins an element's own direct text-node children and skips nested
// elements -- container.textContent is the plain DOM property and has no such
// gap, and the existing analytics-pages tests already rely on it for the same
// reason.

describe("multivariate analysis page", () => {
  it("renders the page heading", () => {
    render(<MultivariatePage />);
    expect(screen.getByRole("heading", { level: 1, name: /analysis .? data/i })).toBeInTheDocument();
  });

  it("cites the E7 analysis JSON as the source of every figure", () => {
    render(<MultivariatePage />);
    expect(screen.getAllByText(/e7_analysis\.json/).length).toBeGreaterThan(10);
  });

  it("states partial dependence is exact because E1 is a full factorial sweep", () => {
    const { container } = render(<MultivariatePage />);
    const text = container.textContent!;
    expect(text).toMatch(/full factorial sweep/i);
    expect(text).toMatch(/No surrogate model is fitted/);
  });

  it("reports the energy-model and nesting-policy partial dependence gap on gate_b", () => {
    const { container } = render(<MultivariatePage />);
    const text = container.textContent!;
    // energy_model: charge_refund 0.895 vs stacking_only 0.509
    expect(text).toMatch(/0\.895 at charge_refund vs 0\.509 at stacking_only/);
    // nesting_policy: immediate_only 0.895 vs all_nestable 0.702
    expect(text).toMatch(/0\.895 at immediate_only vs 0\.702 at all_nestable/);
    // ranked by spread, energy_model dominates and overlap_penalty barely moves it
    expect(text).toMatch(/energy_model\s+dominates/);
    expect(text).toMatch(/overlap_penalty\s+barely moves it/);
  });

  it("states the parity plot is out-of-fold, not an in-sample fit", () => {
    render(<MultivariatePage />);
    expect(screen.getByText(/this parity plot is out-of-fold/i)).toBeInTheDocument();
    expect(screen.getByText(/near-perfect by construction/i)).toBeInTheDocument();
    expect(screen.getByText(/says nothing about generalisation/i)).toBeInTheDocument();
  });

  it("gives the out-of-fold random-forest fit numbers for the parity plot", () => {
    const { container } = render(<MultivariatePage />);
    const text = container.textContent!;
    expect(text).toMatch(/5-fold cross-validation on 450 E3 runs/);
    expect(text).toMatch(/R² = 0\.835, MAE = 0\.065, RMSE = 0\.168/);
  });

  it("reports the weak F1 regression honestly: R²=0.298 and only qubo_density significant", () => {
    const { container } = render(<MultivariatePage />);
    const text = container.textContent!;
    expect(text).toMatch(/R² = 0\.298 of base_pair_f1/);
    expect(text).toMatch(/Only\s*qubo_density\s*reaches conventional significance/);
  });

  it("reports the gate_b regression's own (different) significant predictors", () => {
    const { container } = render(<MultivariatePage />);
    const text = container.textContent!;
    expect(text).toMatch(/R² = 0\.221 of gate_b/);
    expect(text).toMatch(/only\s*num_variables and qubo_density\s*for gate_b/);
  });

  it("states VIF is uniformly acceptable, with the actual computed range", () => {
    const { container } = render(<MultivariatePage />);
    const text = container.textContent!;
    expect(text).toMatch(/VIF between 1\.27 and 1\.81/);
    expect(text).toMatch(/well under the conventional concern threshold of 10/i);
  });

  it("says PCA needs most of the components, so the instance space is not low-dimensional", () => {
    const { container } = render(<MultivariatePage />);
    const text = container.textContent!;
    expect(text).toMatch(/not low-dimensional/i);
    expect(text).toMatch(/takes 4 of the 5\s*components to reach 90% cumulative variance/);
  });

  it("flags the training size where out-of-fold learning-curve R² goes negative", () => {
    const { container } = render(<MultivariatePage />);
    const text = container.textContent!;
    // 144 rows is where test_score dips to -0.07485776135828992 in the committed
    // data -- not the smallest training size (72 rows), which is positive.
    expect(text).toMatch(/training size of 144 rows the out-of-fold test R² is -0\.075/);
  });

  it("flags permutation-importance features that are noise relative to their fold std", () => {
    const { container } = render(<MultivariatePage />);
    const text = container.textContent!;
    expect(text).toMatch(/solver_path_integral_sqa and solver_local_search/);
    expect(text).toMatch(/noise, not a real effect/);
  });

  it("carries no quantum-advantage claim", () => {
    const { container } = render(<MultivariatePage />);
    expect(container.textContent!.toLowerCase()).not.toMatch(
      /quantum advantage|outperform|speedup over classical/,
    );
  });
});
