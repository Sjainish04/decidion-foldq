"use client";

import ReactECharts from "echarts-for-react";
import {
  baseOption,
  categoryAxis,
  legend,
  SERIES_PALETTE,
  valueAxis,
} from "@/lib/charts/theme";
import { useChartTheme } from "@/lib/charts/use-chart-theme";

export function LineChart({
  categories,
  series,
  xLabel,
  yLabel,
  height = 300,
}: {
  categories: (string | number)[];
  series: { name: string; data: number[]; color?: string }[];
  xLabel: string;
  yLabel: string;
  height?: number;
}) {
  const chrome = useChartTheme();

  const option = {
    ...baseOption(chrome),
    legend: legend(chrome, series.length > 1),
    xAxis: {
      ...categoryAxis(chrome, categories.map(String)),
      name: xLabel,
      nameLocation: "middle" as const,
      nameGap: 32,
    },
    yAxis: valueAxis(chrome, yLabel),
    series: series.map((s, index) => {
      const color = s.color ?? SERIES_PALETTE[index % SERIES_PALETTE.length];
      return {
        name: s.name,
        type: "line",
        data: s.data,
        symbolSize: 7,
        // Slightly heavier than the default hairline so a line holds against
        // the dashed gridlines behind it.
        lineStyle: { color, width: 2 },
        itemStyle: { color },
        emphasis: { focus: "series" as const },
      };
    }),
  };
  return <ReactECharts option={option} style={{ height }} notMerge />;
}
