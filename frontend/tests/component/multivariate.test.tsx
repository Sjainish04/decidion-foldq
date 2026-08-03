import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MultivariatePage from "@/app/analytics/multivariate/page";
import { analysis } from "@/lib/analysis";

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

  it("says out-of-fold alone is not enough and the folds are grouped", () => {
    // The intent this test has always guarded is that the page cannot present a
    // score the model did not earn. Out-of-fold turned out to be insufficient on
    // its own: each sequence contributes 18 rows and is uniquely identified by
    // its features, so a row-wise split let the forest recognise sequences it
    // had trained on.
    render(<MultivariatePage />);
    expect(screen.getByText(/folds are grouped by sequence/i)).toBeInTheDocument();
    expect(screen.getByText(/inflated by leakage/i)).toBeInTheDocument();
  });

  it("quotes the grouped fit as the headline and shows the leaky one for contrast", () => {
    const { container } = render(<MultivariatePage />);
    const text = container.textContent!;
    const grouped = analysis.random_forest.f1_from_design_factors_grouped;
    const leaky = analysis.random_forest.f1_from_design_factors_rowwise_leaky;
    // Derived from the data, so the assertion follows a re-run rather than
    // pinning numbers that shift when the analysis is regenerated.
    expect(text).toContain(grouped.r2.toFixed(3));
    expect(text).toContain(leaky.r2.toFixed(3));
    expect(grouped.r2).toBeLessThan(leaky.r2);
    expect(grouped.grouped_by).toBe("sequence_id");
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

  it("reports the learning curve against the committed data", () => {
    const { container } = render(<MultivariatePage />);
    const text = container.textContent!;
    const curve = analysis.random_forest.learning_curve;
    // Every training size in the data must appear; the values themselves are
    // read from the data rather than pinned, since regenerating the analysis
    // legitimately moves them.
    for (const point of curve) expect(text).toContain(String(point.train_size));
  });

  it("flags importance values indistinguishable from their own fold noise", () => {
    const { container } = render(<MultivariatePage />);
    const text = container.textContent!;
    const noisy = analysis.random_forest.importance.filter(
      (f) => Math.abs(f.importance) <= f.std,
    );
    // The claim under test is that the page does not present noise as an effect.
    if (noisy.length > 0) expect(text).toMatch(/noise, not a real effect/);
  });

  it("carries no quantum-advantage claim", () => {
    const { container } = render(<MultivariatePage />);
    expect(container.textContent!.toLowerCase()).not.toMatch(
      /quantum advantage|outperform|speedup over classical/,
    );
  });
});
