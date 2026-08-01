import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChartCard } from "@/components/analytics/ChartCard";
import { DataTable } from "@/components/analytics/DataTable";

vi.mock("echarts-for-react", () => ({
  default: ({ option }: { option: unknown }) => (
    <div data-testid="echart" data-option={JSON.stringify(option)} />
  ),
}));

describe("DataTable", () => {
  const columns = [
    { key: "solver", label: "Solver" },
    { key: "meanF1", label: "Mean F1", format: (v: number) => v.toFixed(3) },
  ];
  const rows = [{ solver: "tabu", meanF1: 0.873 }];

  it("renders a caption for screen readers", () => {
    render(<DataTable columns={columns} rows={rows} caption="Solver results" />);
    expect(screen.getByRole("table", { name: "Solver results" })).toBeInTheDocument();
  });

  it("applies the column formatter", () => {
    render(<DataTable columns={columns} rows={rows} caption="c" />);
    expect(screen.getByText("0.873")).toBeInTheDocument();
  });

  it("renders an em dash for null rather than blank", () => {
    render(
      <DataTable columns={columns} rows={[{ solver: "x", meanF1: null }]} caption="c" />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("ChartCard", () => {
  it("names its data source", () => {
    render(
      <ChartCard title="Solvers" description="d" source="results/full/e3_solvers.csv">
        <div>chart</div>
      </ChartCard>,
    );
    expect(screen.getByText(/e3_solvers\.csv/)).toBeInTheDocument();
  });

  it("exposes a table alternative behind a disclosure", async () => {
    render(
      <ChartCard
        title="Solvers"
        description="d"
        source="s"
        table={{
          columns: [{ key: "a", label: "A" }],
          rows: [{ a: 1 }],
          caption: "Solver results",
        }}
      >
        <div>chart</div>
      </ChartCard>,
    );
    const toggle = screen.getByRole("group", { name: /view as table/i });
    expect(toggle).toBeInTheDocument();
    await userEvent.click(screen.getByText(/view as table/i));
    expect(screen.getByRole("table", { name: "Solver results" })).toBeInTheDocument();
  });

  it("renders a heading at the requested level", () => {
    render(
      <ChartCard title="Solvers" description="d" source="s" headingLevel={3}>
        <div>chart</div>
      </ChartCard>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Solvers" })).toBeInTheDocument();
  });
});
