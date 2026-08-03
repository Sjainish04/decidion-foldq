import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CoefficientPlot } from "@/components/analytics/CoefficientPlot";
import { Heatmap } from "@/components/analytics/Heatmap";
import { CHART_COLORS } from "@/lib/charts/theme";

// Capture the option object so the chart's configuration can be asserted
// without rendering a canvas, which jsdom cannot do.
let captured: Record<string, never> | null = null;
vi.mock("echarts-for-react", () => ({
  default: ({ option }: { option: Record<string, never> }) => {
    captured = option;
    return <div data-testid="echart" />;
  },
}));

const opt = () => captured as unknown as Record<string, unknown>;

describe("Heatmap", () => {
  const columns = ["a", "b", "c"];
  const matrix = [
    [1, 0.8, -0.4],
    [0.8, 1, 0.1],
    [-0.4, 0.1, 1],
  ];

  it("labels every cell with its value", () => {
    render(<Heatmap columns={columns} matrix={matrix} />);
    const series = (opt().series as { label: { show: boolean } }[])[0];
    // The colour is an aid, never the sole encoding: the number must be present
    // so the chart survives greyscale and colour blindness.
    expect(series.label.show).toBe(true);
  });

  it("uses a diverging scale symmetric about zero", () => {
    render(<Heatmap columns={columns} matrix={matrix} />);
    const visual = opt().visualMap as { min: number; max: number };
    // A sequential scale would make -0.9 and +0.1 look similarly "low", when one
    // is a strong inverse relationship and the other is nothing.
    expect(visual.min).toBe(-1);
    expect(visual.max).toBe(1);
  });

  it("emits one datum per matrix cell", () => {
    render(<Heatmap columns={columns} matrix={matrix} />);
    const series = (opt().series as { data: unknown[] }[])[0];
    expect(series.data).toHaveLength(9);
  });
});

describe("CoefficientPlot", () => {
  const coefficients = [
    { name: "weak", beta: 0.02, std_error: 0.03, significant: false },
    { name: "strong", beta: 0.5, std_error: 0.05, significant: true },
  ];

  it("orders so the largest effect reads first", () => {
    render(<CoefficientPlot coefficients={coefficients} />);
    const y = opt().yAxis as { data: string[] };
    // ECharts fills a category axis bottom-up, so the strongest must be last.
    expect(y.data.at(-1)).toContain("strong");
  });

  it("marks significance in the label, not only by colour", () => {
    render(<CoefficientPlot coefficients={coefficients} />);
    const y = opt().yAxis as { data: string[] };
    expect(y.data.find((l) => l.startsWith("strong"))).toBe("strong *");
    expect(y.data.find((l) => l.startsWith("weak"))).toBe("weak");
  });

  it("uses literal hex, since a CSS variable does not resolve on a canvas", () => {
    render(<CoefficientPlot coefficients={coefficients} />);
    const bars = (opt().series as { data: { itemStyle: { color: string } }[] }[])[0];
    for (const bar of bars.data) {
      expect(bar.itemStyle.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(bar.itemStyle.color).not.toContain("var(");
    }
    expect(bars.data.some((b) => b.itemStyle.color === CHART_COLORS.emphasis)).toBe(true);
  });

  it("draws a zero line and error bars", () => {
    render(<CoefficientPlot coefficients={coefficients} />);
    const series = opt().series as { markLine?: { data: { xAxis: number }[] }; type: string }[];
    expect(series[0].markLine!.data[0].xAxis).toBe(0);
    // The error-bar series exists, so a reader can see which intervals cross zero.
    expect(series.some((s) => s.type === "custom")).toBe(true);
  });
});

describe("chart palette", () => {
  it("contains no CSS variables", () => {
    // ECharts renders to a canvas; a var(--token) passed as a colour silently
    // falls back to the default instead of failing.
    for (const value of Object.values(CHART_COLORS)) {
      expect(value).not.toContain("var(");
      expect(value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
