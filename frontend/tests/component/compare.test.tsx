import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ComparePage from "@/app/foldq/compare/page";
import fixture from "../msw/fold-response.json";

vi.mock("next/navigation", () => ({ usePathname: () => "/foldq/compare" }));

beforeEach(() => {
  sessionStorage.clear();
});

describe("compare page", () => {
  it("explains what to do when fewer than two runs are cached", () => {
    render(<ComparePage />);
    expect(screen.getByRole("status")).toHaveTextContent(/at least two runs/i);
  });

  it("lists cached runs for selection", () => {
    sessionStorage.setItem(`foldq:run:${fixture.run_id}`, JSON.stringify(fixture));
    sessionStorage.setItem(
      "foldq:run:other",
      JSON.stringify({ ...fixture, run_id: "other", solver: "tabu" }),
    );
    render(<ComparePage />);
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(screen.getAllByRole("option", { name: /tabu/ }).length).toBeGreaterThan(0);
  });

  it("shows helix and pair counts for both runs", () => {
    sessionStorage.setItem(`foldq:run:${fixture.run_id}`, JSON.stringify(fixture));
    sessionStorage.setItem(
      "foldq:run:other",
      JSON.stringify({ ...fixture, run_id: "other", solver: "tabu" }),
    );
    render(<ComparePage />);
    expect(screen.getAllByText(/helices/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/shared pairs/i).length).toBeGreaterThan(0);
  });
});
