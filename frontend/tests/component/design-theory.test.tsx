import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DesignTheoryPage from "@/app/design-theory/page";

describe("design theory page", () => {
  it("renders the page heading", () => {
    render(<DesignTheoryPage />);
    expect(screen.getByRole("heading", { level: 1, name: /design theory/i })).toBeInTheDocument();
  });

  it("explains why overlap and crossing conflicts are pairwise and QUBO-representable", () => {
    render(<DesignTheoryPage />);
    // getAllBy, not getBy: "conflict graph(s)" is named in the formulation section
    // and echoed again in the trade-offs section — repeated on purpose, not an
    // ambiguous query.
    expect(screen.getAllByText(/conflict graph/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/pairwise|per pair|per.*pair of variables/i).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText(/lambda_overlap/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/lambda_crossing/).length).toBeGreaterThan(0);
  });

  it("explains the charge-and-refund construction for hairpin closure", () => {
    render(<DesignTheoryPage />);
    // getAllBy: "k-body predicate" is introduced and then referenced again when
    // tying it back to the (s, t) pair term — the repetition is deliberate.
    expect(screen.getAllByText(/k-body predicate/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/charges/i)).toBeInTheDocument();
    expect(screen.getByText(/refunds/i)).toBeInTheDocument();
    expect(screen.getAllByText(/hairpin_closure/).length).toBeGreaterThan(0);
    // getAllBy: "degree-2" is named as the constraint and again as the property
    // the model keeps after the refund — deliberate repetition.
    expect(screen.getAllByText(/degree-2/i).length).toBeGreaterThan(0);
  });

  it("links to the scaling and multivariate pages for the measured trade-offs", () => {
    render(<DesignTheoryPage />);
    const scalingLinks = screen.getAllByRole("link", { name: /scaling/i });
    expect(scalingLinks.some((l) => l.getAttribute("href") === "/analytics/scaling")).toBe(true);
    const multivariateLinks = screen.getAllByRole("link", { name: /multivariate/i });
    expect(
      multivariateLinks.some((l) => l.getAttribute("href") === "/analytics/multivariate"),
    ).toBe(true);
  });

  it("names both trade-off axes: variables vs representability, runtime vs accuracy", () => {
    render(<DesignTheoryPage />);
    expect(screen.getByText(/variables vs\. representability/i)).toBeInTheDocument();
    expect(screen.getByText(/runtime vs\. accuracy/i)).toBeInTheDocument();
  });

  it("states the penalty bound is verified only up to the exact-solver ceiling", () => {
    render(<DesignTheoryPage />);
    // getAllBy: the ~22-variable ceiling is stated once for what is verified
    // inside it and again for what is unproven above it — both halves matter.
    expect(screen.getAllByText(/roughly 22 variables/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/indeterminate/i)).toBeInTheDocument();
    expect(screen.getByText(/not a proof/i)).toBeInTheDocument();
    expect(screen.getByText(/unproven/i)).toBeInTheDocument();
  });

  it("carries no quantum-advantage claim", () => {
    const { container } = render(<DesignTheoryPage />);
    expect(container.textContent!.toLowerCase()).not.toMatch(
      /quantum advantage|outperform|speedup over classical/,
    );
  });

  it("does not claim capabilities this project does not implement", () => {
    // Game theory / Stackelberg / MPC / closed-loop optimization are not part of
    // this project. Asserting their absence guards against a false capability
    // claim creeping into the theory page.
    const { container } = render(<DesignTheoryPage />);
    expect(container.textContent!.toLowerCase()).not.toMatch(
      /game theory|stackelberg|model predictive control|closed-loop optimi[sz]ation/,
    );
  });
});
