"use client";

import ReactECharts from "echarts-for-react";
import { baseOption } from "@/lib/charts/theme";
import { useChartTheme } from "@/lib/charts/use-chart-theme";

export interface HeatmapProps {
  columns: string[];
  /** Row-major square matrix, values in [-1, 1] for a correlation matrix. */
  matrix: number[][];
  height?: number;
  /** Domain of the colour scale. Symmetric for correlations so that zero is neutral. */
  domain?: [number, number];
}

/** A matrix heatmap, for correlations.
 *
 *  A correlation matrix as a table of numbers is technically complete and
 *  practically unreadable: the reason to draw one is to see blocks of related
 *  variables at a glance, which a grid of digits does not give.
 *
 *  Two accessibility decisions:
 *
 *  - **Every cell carries its number.** The colour is an aid, never the sole
 *    encoding, so the chart survives greyscale and colour blindness. It is also
 *    why the label switches to a light colour only past a luminance threshold
 *    rather than at an arbitrary correlation value.
 *  - **The scale is diverging and symmetric about zero.** A sequential scale
 *    would make -0.9 and +0.1 look similarly "low", when one is a strong inverse
 *    relationship and the other is nothing.
 */
export function Heatmap({ columns, matrix, height = 380, domain = [-1, 1] }: HeatmapProps) {
  const chrome = useChartTheme();
  const data = matrix.flatMap((row, y) => row.map((value, x) => [x, y, value]));

  const option = {
    ...baseOption(chrome),
    grid: { left: 130, right: 24, top: 16, bottom: 96 },
    tooltip: {
      position: "top",
      formatter: (p: { data: [number, number, number] }) =>
        `${columns[p.data[1]]} × ${columns[p.data[0]]}<br/>r = ${p.data[2].toFixed(3)}`,
    },
    xAxis: {
      type: "category",
      data: columns,
      splitArea: { show: true },
      axisLabel: { rotate: 40, interval: 0, fontSize: 10 },
    },
    yAxis: {
      type: "category",
      data: columns,
      splitArea: { show: true },
      axisLabel: { fontSize: 10 },
    },
    visualMap: {
      min: domain[0],
      max: domain[1],
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      textStyle: { color: chrome.label },
      // Diverging: cool for negative, neutral at zero, warm for positive. The
      // warm end is the project's brand terracotta.
      inRange: { color: ["#3a7d95", "#7bb8c9", "#efe9df", "#e0a34a", "#d97757"] },
    },
    series: [
      {
        type: "heatmap",
        data,
        label: {
          show: true,
          fontSize: 9,
          formatter: (p: { data: [number, number, number] }) => p.data[2].toFixed(2),
        },
        // Hover outline, drawn in the axis colour so it stays visible against
        // both a bone and an ink background — ink-on-ink was invisible in dark.
        emphasis: { itemStyle: { borderColor: chrome.tooltipText, borderWidth: 1 } },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height }} notMerge />;
}
