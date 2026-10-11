"use client";

import ReactECharts from "echarts-for-react";
import {
  barFill,
  baseOption,
  categoryAxis,
  legend,
  SERIES_PALETTE,
  valueAxis,
  withAlpha,
} from "@/lib/charts/theme";
import { useChartTheme } from "@/lib/charts/use-chart-theme";

export interface BarSeries {
  name: string;
  data: number[];
  color?: string;
  /** Per-bar colours, for a single series where each category means something
   *  different — e.g. one bar per solver, coloured by solver class. */
  colors?: (string | undefined)[];
}

export function BarChart({
  categories,
  series,
  yLabel,
  yMax,
  height = 300,
  /** Decimal places on the printed bar labels. */
  precision,
}: {
  categories: string[];
  series: BarSeries[];
  yLabel: string;
  yMax?: number;
  height?: number;
  precision?: number;
}) {
  const chrome = useChartTheme();

  const values = series.flatMap((s) => s.data).filter((v) => Number.isFinite(v));
  const peak = values.length ? Math.max(...values) : 0;

  // Printed to the same precision the numbers deserve: rates and shares sit in
  // [0,1] and need decimals, counts do not. Inferred rather than required, so
  // no call site has to be touched to get sensible labels.
  const decimals = precision ?? (peak <= 1.5 ? 2 : 0);

  const option = {
    ...baseOption(chrome),
    legend: legend(chrome, series.length > 1),
    xAxis: categoryAxis(chrome, categories),
    // A pinned maximum is passed straight through: a rate axis is pinned to 1
    // because 1 is the ceiling, not because it is the data's peak, and quietly
    // padding it would misrepresent how close a bar is to that ceiling. The
    // 44px band above the plot is what keeps a full-height bar's printed value
    // from being clipped.
    yAxis: valueAxis(chrome, yLabel, yMax),
    series: series.map((s, index) => {
      const color = s.color ?? SERIES_PALETTE[index % SERIES_PALETTE.length];
      return {
        name: s.name,
        type: "bar",
        // The flat series colour: legend and tooltip swatches read this, and
        // the bars draw the same hue as a gradient (see barFill).
        color,
        data: s.colors
          ? s.data.map((value, i) => {
              const own = s.colors?.[i] ?? color;
              return {
                value,
                itemStyle: { color: barFill(own), borderRadius: [6, 6, 0, 0] },
                emphasis: { itemStyle: { shadowBlur: 18, shadowColor: withAlpha(own, 0.5) } },
              };
            })
          : s.data,
        itemStyle: {
          color: barFill(color),
          // A small radius on the top corners only: enough to soften the bar
          // without turning a quantitative mark into a decorative one.
          borderRadius: [6, 6, 0, 0],
        },
        // A faint full-height track behind each bar shows the room left to the
        // axis maximum, which matters most where the axis is pinned to 1.
        showBackground: true,
        backgroundStyle: { color: chrome.track, borderRadius: [6, 6, 0, 0] },
        // Bars were rendering ~230px wide with three categories, which reads as
        // decorative blocks rather than a measurement. Capped, and the category
        // gap widened so groups separate from each other more than the series
        // within a group do.
        barMaxWidth: 46,
        barGap: "12%",
        barCategoryGap: "34%",
        // The value on the bar, so the chart is readable without hovering — and
        // still readable in a screenshot or a printed page, which a tooltip is not.
        label: {
          show: true,
          position: "top" as const,
          color: chrome.label,
          fontSize: 11,
          fontWeight: 600,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          formatter: (p: { value: number }) =>
            Number.isFinite(p.value) ? p.value.toFixed(decimals) : "",
        },
        emphasis: {
          focus: "series" as const,
          itemStyle: { shadowBlur: 18, shadowColor: withAlpha(color, 0.5) },
        },
      };
    }),
  };

  return <ReactECharts option={option} style={{ height }} notMerge />;
}
