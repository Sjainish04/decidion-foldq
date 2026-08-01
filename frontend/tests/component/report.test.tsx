import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReportPage from "@/app/reports/[reportId]/page";
import fixture from "../msw/fold-response.json";

vi.mock("next/navigation", () => ({
  useParams: () => ({ reportId: fixture.run_id }),
  usePathname: () => "/reports/x",
}));

beforeEach(() => {
  sessionStorage.setItem(`foldq:run:${fixture.run_id}`, JSON.stringify(fixture));
});

describe("report page", () => {
  it("renders the decision card in a sandboxed frame", () => {
    render(<ReportPage />);
    const frame = screen.getByTitle(/decision card/i);
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame).toHaveAttribute("srcdoc", expect.stringContaining("<"));
  });

  it("offers HTML and CSV export", () => {
    render(<ReportPage />);
    expect(screen.getByRole("button", { name: /download html/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download csv/i })).toBeInTheDocument();
  });

  it("tells the reader the card is self-contained", () => {
    render(<ReportPage />);
    expect(screen.getByText(/self-contained|no external requests/i)).toBeInTheDocument();
  });

  it("explains what to do when the run is not cached", () => {
    sessionStorage.clear();
    render(<ReportPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(/fold the sequence again/i);
  });
});
