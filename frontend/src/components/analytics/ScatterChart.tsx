"use client";

import ReactECharts from "echarts-for-react";
import { BASE_CHART_OPTION } from "@/lib/charts/theme";

export interface ScatterSeries {
  name: string;
  points: [number, number][];
  color?: string;
  symbol?: string;
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
      type: "scatter",
      data: s.points,
      symbol: s.symbol ?? "circle",
      symbolSize: 9,
      itemStyle: s.color ? { color: s.color } : undefined,
    })),
  };
  return <ReactECharts option={option} style={{ height }} notMerge />;
}
