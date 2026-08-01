import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/dashboard/page";

vi.mock("echarts-for-react", () => ({ default: () => <div data-testid="echart" /> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

describe("dashboard", () => {
  it("states the position on quantum advantage plainly", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/no quantum-advantage claim/i)).toBeInTheDocument();
  });

  it("names both authors and the challenge", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/WISER Summer Program 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/Siddhartha Pahari/)).toBeInTheDocument();
    expect(screen.getByText(/Jainish Solanki/)).toBeInTheDocument();
  });

  it("links to each analytics area", () => {
    render(<DashboardPage />);
    for (const href of [
      "/analytics/solver-performance",
      "/analytics/energy",
      "/analytics/scaling",
      "/analytics/resources",
      "/analytics/pseudoknots",
    ]) {
      expect(document.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
  });

  it("cites a committed source under every headline figure", () => {
    render(<DashboardPage />);
    expect(screen.getAllByText(/results\/full\//).length).toBeGreaterThanOrEqual(4);
  });
});
