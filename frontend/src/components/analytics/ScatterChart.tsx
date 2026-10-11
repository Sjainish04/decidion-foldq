"use client";

import ReactECharts from "echarts-for-react";
import { baseOption, legend, SERIES_PALETTE, valueAxis, withAlpha } from "@/lib/charts/theme";
import { useChartTheme } from "@/lib/charts/use-chart-theme";

export interface ScatterSeries {
  name: string;
  points: [number, number][];
  color?: string;
  symbol?: string;
  symbolSize?: number;
  /** Join the points with a line, in the order given.
   *
   *  Used for a Pareto frontier, where the connection is the meaning: it shows
   *  the exchange curve rather than leaving a reader to infer which scattered
   *  markers are the undominated ones. */
  connected?: boolean;
}

export function ScatterChart({
  series,
  xLabel,
  yLabel,
  height = 320,
}: {
  series: ScatterSeries[];
  xLabel: string;
  yLabel: string;
  height?: number;
}) {
  const chrome = useChartTheme();

  const option = {
    ...baseOption(chrome),
    tooltip: { ...baseOption(chrome).tooltip, trigger: "item" as const },
    // Anchored above the plot. ECharts' default centres the legend on the
    // canvas, which put its entries directly on top of the x-axis tick labels:
    // solver names were overprinting the runtime ticks.
    legend: legend(chrome, true),
    xAxis: {
      ...valueAxis(chrome, xLabel),
      nameLocation: "middle" as const,
      nameGap: 30,
      // A scatter needs both sets of rules to locate a point in two dimensions;
      // a bar chart only needs the horizontal ones.
      splitLine: { lineStyle: { color: chrome.splitLine, type: "dashed" as const } },
    },
    yAxis: valueAxis(chrome, yLabel),
    series: series.map((s, index) => {
      const color = s.color ?? SERIES_PALETTE[index % SERIES_PALETTE.length];
      return {
        name: s.name,
        // A connected series is drawn as a line with visible points, which is how
        // a frontier reads; an unconnected one stays a plain scatter.
        type: s.connected ? "line" : "scatter",
        data: s.points,
        color,
        symbol: s.symbol ?? "circle",
        symbolSize: s.symbolSize ?? 16,
        showSymbol: true,
        lineStyle: s.connected
          ? { width: 2.5, type: "dashed", color, shadowBlur: 8, shadowColor: withAlpha(color, 0.35) }
          : undefined,
        // Translucent fill with a solid ring, so overlapping points stay
        // countable, and a soft halo in the point's own colour.
        itemStyle: {
          color: s.connected ? color : withAlpha(color, 0.82),
          borderColor: chrome.background,
          borderWidth: 1.5,
          shadowBlur: 10,
          shadowColor: withAlpha(color, 0.4),
        },
        emphasis: { focus: "series" as const, scale: 1.6 },
      };
    }),
  };
  return <ReactECharts option={option} style={{ height }} notMerge />;
}
