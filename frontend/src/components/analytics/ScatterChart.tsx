"use client";

import ReactECharts from "echarts-for-react";
import { BASE_CHART_OPTION } from "@/lib/charts/theme";

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
  const option = {
    ...BASE_CHART_OPTION,
    tooltip: { trigger: "item" },
    legend: { textStyle: { color: "#94a3b8" } },
    xAxis: { type: "value", name: xLabel, nameLocation: "middle", nameGap: 28 },
    yAxis: { type: "value", name: yLabel },
    series: series.map((s) => ({
      name: s.name,
      // A connected series is drawn as a line with visible points, which is how
      // a frontier reads; an unconnected one stays a plain scatter.
      type: s.connected ? "line" : "scatter",
      data: s.points,
      symbol: s.symbol ?? "circle",
      symbolSize: s.symbolSize ?? 9,
      showSymbol: true,
      lineStyle: s.connected ? { width: 2, type: "dashed" } : undefined,
      itemStyle: s.color ? { color: s.color } : undefined,
    })),
  };
  return <ReactECharts option={option} style={{ height }} notMerge />;
}
