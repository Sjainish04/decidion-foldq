"use client";

import ReactECharts from "echarts-for-react";
import { baseOption, CHART_COLORS, valueAxis } from "@/lib/charts/theme";
import { useChartTheme } from "@/lib/charts/use-chart-theme";

export interface CoefficientRow {
  name: string;
  beta: number;
  std_error: number;
  significant: boolean;
}

/** Standardised regression coefficients as a horizontal effect plot.
 *
 *  The conventional way to show "which predictor moves the outcome most", and it
 *  works precisely because the coefficients are standardised — a raw coefficient
 *  on sequence length (tens of nt) and one on QUBO density (0–1) share no scale
 *  and cannot be put on one axis honestly.
 *
 *  Three choices that keep it from overstating:
 *
 *  - **Error bars, not bare bars.** A coefficient without its uncertainty invites
 *    reading a rank order that the data may not support; here you can see the
 *    intervals overlap.
 *  - **Significance is marked in the label, not only by colour** — a trailing
 *    asterisk — so the distinction survives greyscale and colour blindness.
 *  - **A zero line is always drawn**, because the question for every predictor is
 *    whether its interval clears zero.
 */
export function CoefficientPlot({
  coefficients,
  height = 300,
}: {
  coefficients: CoefficientRow[];
  height?: number;
}) {
  // Weakest first: ECharts draws a horizontal category axis bottom-up, so this
  // puts the strongest effect at the top where it is read first.
  const chrome = useChartTheme();
  const rows = [...coefficients].sort((a, b) => Math.abs(a.beta) - Math.abs(b.beta));
  const labels = rows.map((c) => (c.significant ? `${c.name} *` : c.name));

  const option = {
    ...baseOption(chrome),
    grid: { left: 160, right: 40, top: 16, bottom: 44 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: { dataIndex: number }[]) => {
        const c = rows[params[0].dataIndex];
        return (
          `${c.name}<br/>standardised β = ${c.beta.toFixed(4)}` +
          `<br/>± ${c.std_error.toFixed(4)} (1 s.e.)` +
          `<br/>${c.significant ? "significant at p < 0.05" : "not significant"}`
        );
      },
    },
    xAxis: {
      ...valueAxis(chrome, "standardised β"),
      nameLocation: "middle" as const,
      nameGap: 28,
    },
    yAxis: {
      type: "category",
      data: labels,
      axisLine: { lineStyle: { color: chrome.axisLine } },
      axisTick: { show: false },
      axisLabel: { fontSize: 10, color: chrome.label },
    },
    series: [
      {
        type: "bar",
        data: rows.map((c) => ({
          value: c.beta,
          itemStyle: {
            // Literal hex, not a CSS variable: ECharts draws to a canvas where
            // var(--token) does not resolve and would fall back to the default.
            // Colour reinforces the asterisk; it never carries the meaning alone.
            color: c.significant ? CHART_COLORS.emphasis : CHART_COLORS.muted,
            opacity: c.significant ? 1 : 0.55,
          },
        })),
        markLine: {
          silent: true,
          symbol: "none",
          data: [{ xAxis: 0 }],
          lineStyle: { color: CHART_COLORS.axis, type: "solid" },
          label: { show: false },
        },
      },
      {
        // One standard error either side, so a reader can see which intervals
        // cross zero rather than inferring it from the asterisk alone.
        type: "custom",
        renderItem: (
          params: unknown,
          api: {
            value: (i: number) => number;
            coord: (p: [number, number]) => [number, number];
            size: (p: [number, number]) => [number, number];
          },
        ) => {
          const index = api.value(0);
          const beta = api.value(1);
          const error = api.value(2);
          const [xLow, y] = api.coord([beta - error, index]);
          const [xHigh] = api.coord([beta + error, index]);
          const half = api.size([0, 1])[1] * 0.18;
          const style = { stroke: CHART_COLORS.axis, lineWidth: 1 };
          return {
            type: "group",
            children: [
              { type: "line", shape: { x1: xLow, y1: y, x2: xHigh, y2: y }, style },
              { type: "line", shape: { x1: xLow, y1: y - half, x2: xLow, y2: y + half }, style },
              { type: "line", shape: { x1: xHigh, y1: y - half, x2: xHigh, y2: y + half }, style },
            ],
          };
        },
        encode: { x: [1, 2], y: 0 },
        data: rows.map((c, i) => [i, c.beta, c.std_error]),
        z: 10,
      },
    ],
  };

  return <ReactECharts option={option} style={{ height }} notMerge />;
}
