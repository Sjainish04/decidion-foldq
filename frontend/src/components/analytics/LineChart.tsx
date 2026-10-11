"use client";

import ReactECharts from "echarts-for-react";
import {
  areaFill,
  baseOption,
  categoryAxis,
  legend,
  SERIES_PALETTE,
  valueAxis,
  withAlpha,
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

  const base = baseOption(chrome);
  const option = {
    ...base,
    tooltip: {
      ...base.tooltip,
      axisPointer: { type: "line" as const, lineStyle: { color: chrome.axisLine, type: "dashed" as const } },
    },
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
        color,
        symbol: "circle",
        symbolSize: 9,
        // Straight segments, never smoothed: a spline would invent values
        // between measured points.
        smooth: false,
        // Heavier than the default hairline so a line holds against the dashed
        // gridlines behind it, with a soft glow in its own colour.
        lineStyle: { color, width: 3, shadowBlur: 12, shadowColor: withAlpha(color, 0.35), shadowOffsetY: 4 },
        // Each point ringed in the card colour so it stands off the line.
        itemStyle: { color, borderColor: chrome.background, borderWidth: 2 },
        areaStyle: series.length === 1 ? { color: areaFill(color) } : undefined,
        label: {
          show: series.length === 1,
          position: "top" as const,
          distance: 8,
          color: chrome.label,
          fontSize: 10,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          formatter: (p: { value: number }) =>
            Number.isFinite(p.value) ? (Math.abs(p.value) < 1.5 ? p.value.toFixed(2) : p.value.toFixed(0)) : "",
        },
        emphasis: { focus: "series" as const, scale: 1.5 },
      };
    }),
  };
  return <ReactECharts option={option} style={{ height }} notMerge />;
}
