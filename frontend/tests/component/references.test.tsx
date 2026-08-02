import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ReferencesPage from "@/app/references/page";
import { Footer } from "@/components/shell/Footer";
import { library } from "@/lib/references";

vi.mock("next/navigation", () => ({ usePathname: () => "/references" }));

describe("reference library", () => {
  it("states how many DOIs were Crossref-verified", () => {
    render(<ReferencesPage />);
    expect(
      screen.getByText(new RegExp(`${library.crossref_verified} Crossref-verified`)),
    ).toBeInTheDocument();
  });

  it("marks unverified works as having no DOI rather than hiding them", () => {
    render(<ReferencesPage />);
    // Preprints are cited and genuinely have no Crossref DOI. Omitting them
    // would misrepresent the bibliography; labelling them is the honest form.
    expect(screen.getAllByText("no DOI").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Crossref-verified").length).toBeGreaterThan(0);
  });

  it("never shows a DOI for a work that did not verify", () => {
    render(<ReferencesPage />);
    for (const reference of library.references) {
      if (!reference.crossref_verified && reference.doi) {
        throw new Error(`${reference.key} carries a DOI but is not verified`);
      }
    }
  });

  it("links every verified DOI through doi.org", () => {
    for (const reference of library.references) {
      if (reference.crossref_verified) {
        expect(reference.url).toBe(`https://doi.org/${reference.doi}`);
      }
    }
  });

  it("filters by role", async () => {
    render(<ReferencesPage />);
    const group = screen.getByRole("group", { name: /filter by role/i });
    const button = screen.getAllByRole("button", { name: /prior QUBO formulation/i })[0];
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(group).toBeInTheDocument();
  });
});

describe("footer", () => {
  it("states the MIT licence, not 'all rights reserved'", () => {
    // The repository ships an MIT licence; "all rights reserved" would assert
    // the opposite of the terms actually granted.
    const { container } = render(<Footer />);
    expect(screen.getByText(/MIT licensed/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/all rights reserved/i);
  });

  it("names both authors and the challenge", () => {
    render(<Footer />);
    expect(screen.getByText(/Siddhartha Pahari and Jainish Solanki/)).toBeInTheDocument();
    expect(screen.getByText(/WISER Summer Program 2026/)).toBeInTheDocument();
  });

  it("repeats the no-quantum-advantage position", () => {
    render(<Footer />);
    expect(screen.getByText(/No quantum-advantage claim is made/)).toBeInTheDocument();
  });

  it("hardens outbound links", () => {
    render(<Footer />);
    for (const link of screen.getAllByRole("link")) {
      if (link.getAttribute("target") === "_blank") {
        expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
      }
    }
  });
});
