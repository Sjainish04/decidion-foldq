import { render, screen, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BarChart } from "@/components/analytics/BarChart";
import { ScatterChart } from "@/components/analytics/ScatterChart";
import { DARK_CHROME, LIGHT_CHROME, SERIES_PALETTE } from "@/lib/charts/theme";

vi.mock("echarts-for-react", () => ({
  default: ({ option }: { option: unknown }) => (
    <div data-testid="echart" data-option={JSON.stringify(option)} />
  ),
}));

function option(): Record<string, never> & {
  series: { itemStyle?: { color?: string }; barMaxWidth?: number; label?: { show: boolean } }[];
  yAxis: { axisLabel: { color: string }; max?: number };
  xAxis: { axisLabel?: { color: string } };
  legend: { show: boolean; top: number };
  textStyle: { color: string };
} {
  return JSON.parse(screen.getByTestId("echart").getAttribute("data-option")!);
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

describe("chart palette", () => {
  it("never falls through to the library's default colours", () => {
    // The original defect: itemStyle was set only when a call site passed a
    // colour, so most bars rendered in ECharts' factory indigo (#5470c6-ish) —
    // a colour in neither of this project's palettes.
    render(<BarChart categories={["a", "b"]} series={[{ name: "s", data: [1, 2] }]} yLabel="n" />);
    expect(option().series[0].itemStyle?.color).toBe(SERIES_PALETTE[0]);
  });

  it("gives each series a distinct colour without being told", () => {
    render(
      <BarChart
        categories={["a"]}
        series={[
          { name: "one", data: [1] },
          { name: "two", data: [2] },
        ]}
        yLabel="n"
      />,
    );
    const colors = option().series.map((s) => s.itemStyle?.color);
    expect(new Set(colors).size).toBe(2);
  });

  it("honours per-bar colours, so one series can encode solver class", () => {
    render(
      <BarChart
        categories={["tabu", "random"]}
        series={[{ name: "rate", data: [1, 0.1], colors: ["#3a7d95", "#8a8578"] }]}
        yLabel="rate"
      />,
    );
    const data = JSON.parse(screen.getByTestId("echart").getAttribute("data-option")!).series[0]
      .data;
    expect(data[0].itemStyle.color).toBe("#3a7d95");
    expect(data[1].itemStyle.color).toBe("#8a8578");
  });
});

describe("chart theme", () => {
  it("uses the light chrome by default", () => {
    render(<BarChart categories={["a"]} series={[{ name: "s", data: [1] }]} yLabel="n" />);
    expect(option().yAxis.axisLabel.color).toBe(LIGHT_CHROME.label);
  });

  it("follows the dark toggle at runtime", async () => {
    // Canvas cannot read CSS variables, so unlike the rest of the UI these do
    // not follow the theme for free — the observer is the whole mechanism.
    render(<BarChart categories={["a"]} series={[{ name: "s", data: [1] }]} yLabel="n" />);
    expect(option().textStyle.color).toBe(LIGHT_CHROME.label);

    // Async act: MutationObserver delivers on a microtask, so a synchronous
    // assertion after the class change reads the pre-notification render.
    await act(async () => {
      document.documentElement.classList.add("dark");
    });

    expect(option().textStyle.color).toBe(DARK_CHROME.label);
    expect(option().yAxis.axisLabel.color).toBe(DARK_CHROME.label);
  });
});

describe("bar geometry", () => {
  it("caps bar width so three categories do not become slabs", () => {
    render(
      <BarChart categories={["a", "b", "c"]} series={[{ name: "s", data: [1, 2, 3] }]} yLabel="n" />,
    );
    expect(option().series[0].barMaxWidth).toBeLessThanOrEqual(48);
  });

  it("prints the value on each bar, so the chart survives a screenshot", () => {
    render(<BarChart categories={["a"]} series={[{ name: "s", data: [0.6] }]} yLabel="rate" />);
    expect(option().series[0].label?.show).toBe(true);
  });

  it("passes a pinned maximum through untouched", () => {
    // A rate axis is pinned to 1 because 1 is the ceiling. Padding it for
    // aesthetics would understate how close a bar is to that ceiling.
    render(
      <BarChart categories={["a"]} series={[{ name: "s", data: [1] }]} yLabel="rate" yMax={1} />,
    );
    expect(option().yAxis.max).toBe(1);
  });
});

describe("legend placement", () => {
  it("sits above the plot, not on top of the axis labels", () => {
    // It previously defaulted to the canvas centre, which overprinted the
    // x-axis category names in both the scatter and the grouped bar charts.
    render(
      <ScatterChart
        series={[{ name: "a", points: [[0, 1]] }]}
        xLabel="x"
        yLabel="y"
      />,
    );
    expect(option().legend.top).toBe(0);
  });
});
