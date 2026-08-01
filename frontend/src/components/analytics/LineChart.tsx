"use client";

import ReactECharts from "echarts-for-react";
import { BASE_CHART_OPTION } from "@/lib/charts/theme";

export function LineChart({
  categories,
  series,
  xLabel,
  yLabel,
  height = 280,
}: {
  categories: (string | number)[];
  series: { name: string; data: number[]; color?: string }[];
  xLabel: string;
  yLabel: string;
  height?: number;
}) {
  const option = {
    ...BASE_CHART_OPTION,
    legend: { textStyle: { color: "#94a3b8" } },
    xAxis: {
      type: "category",
      data: categories,
      name: xLabel,
      nameLocation: "middle",
      nameGap: 28,
    },
    yAxis: { type: "value", name: yLabel },
    series: series.map((s) => ({
      name: s.name,
      type: "line",
      data: s.data,
      symbolSize: 8,
      lineStyle: s.color ? { color: s.color } : undefined,
      itemStyle: s.color ? { color: s.color } : undefined,
    })),
  };
  return <ReactECharts option={option} style={{ height }} notMerge />;
}
