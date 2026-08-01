"use client";

import ReactECharts from "echarts-for-react";
import { BASE_CHART_OPTION } from "@/lib/charts/theme";

export interface BarSeries {
  name: string;
  data: number[];
  color?: string;
}

export function BarChart({
  categories,
  series,
  yLabel,
  yMax,
  height = 280,
}: {
  categories: string[];
  series: BarSeries[];
  yLabel: string;
  yMax?: number;
  height?: number;
}) {
  const option = {
    ...BASE_CHART_OPTION,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { show: series.length > 1, textStyle: { color: "#94a3b8" } },
    xAxis: { type: "category", data: categories, axisLabel: { interval: 0, rotate: 20 } },
    yAxis: { type: "value", name: yLabel, max: yMax },
    series: series.map((s) => ({
      name: s.name,
      type: "bar",
      data: s.data,
      itemStyle: s.color ? { color: s.color } : undefined,
    })),
  };
  return <ReactECharts option={option} style={{ height }} notMerge />;
}
