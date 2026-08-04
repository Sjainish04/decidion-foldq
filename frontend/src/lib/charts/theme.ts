/** Chart palette and shared ECharts options.
 *
 *  ECharts draws to a canvas, where `var(--token)` does not resolve — a CSS
 *  variable passed as a series colour silently renders as the library default.
 *  Every colour here is therefore a literal, kept in step with the design tokens
 *  in globals.css by hand.
 *
 *  That silent fallback is exactly how the charts drifted: `BarChart` set
 *  `itemStyle` only when a call site passed a colour, and most pass none, so the
 *  bars rendered in ECharts' factory indigo and lime — colours that appear in
 *  neither of this project's palettes.
 */

/** Solver colours, grouped by class on purpose.
 *
 *  Solvers of the same class share a colour: the interesting comparison is
 *  "classical heuristic vs annealing vs quantum vs exact reference", not nine
 *  individually-named runs. `SOLVER_SYMBOLS` then separates the individual
 *  solvers by marker shape, so the encoding is never colour-alone — which also
 *  keeps it legible in greyscale and to colour-blind readers.
 */
export const SOLVER_COLORS: Record<string, string> = {
  // reference / baseline
  random: "#8a8578", // stone
  exact: "#1f8a5c", // green
  // classical heuristics
  greedy: "#3a7d95", // teal, matches --classical
  local_search: "#3a7d95",
  tabu: "#3a7d95",
  // annealing family
  simulated_annealing: "#c3512c", // terracotta, matches --accent-strong
  path_integral_sqa: "#c3512c",
  // circuit-model quantum
  qaoa: "#9b5aa8", // purple, matches --quantum
  cvar_qaoa: "#9b5aa8",
};

export const SOLVER_SYMBOLS: Record<string, string> = {
  random: "circle",
  greedy: "triangle",
  local_search: "diamond",
  tabu: "rect",
  simulated_annealing: "pin",
  path_integral_sqa: "arrow",
  qaoa: "roundRect",
  cvar_qaoa: "triangle",
  exact: "circle",
};

/** Ordered palette for series that are not solvers.
 *
 *  Earth tones drawn from the Decidion palette rather than a generic categorical
 *  ramp, and ordered so the first two — the common case — are maximally distinct
 *  from each other.
 */
export const SERIES_PALETTE = [
  "#c3512c", // terracotta
  "#3a7d95", // teal
  "#1f8a5c", // green
  "#9b5aa8", // purple
  "#b8791c", // amber
  "#8a8578", // stone
] as const;

export const CHART_COLORS = {
  /** terracotta, darkened to carry meaning as a marked series */
  emphasis: "#c3512c",
  /** brand terracotta, for neutral series fills */
  brand: "#d97757",
  /** brand cyan */
  cool: "#3a7d95",
  /** muted, for de-emphasised points */
  muted: "#8a8578",
  /** Green, reserved for "on the frontier" / reference series.
   *
   *  Deliberately lighter than `--reference` (#1b7146) in globals.css. That
   *  token is tuned for small TEXT on a light background, where it needs 4.5:1;
   *  a chart fill is a non-text object needing 3:1, but it has to clear that on
   *  BOTH backgrounds, and #1b7146 manages only 3.02:1 on ink — technically a
   *  pass, visibly muddy. This sits at 4.05 on bone and 4.19 on ink.
   *
   *  Series colours stay theme-invariant on purpose: a figure captured from the
   *  site for the submission document should show the same series in the same
   *  colour whichever theme the reader had active. */
  reference: "#1f8a5c",
  axis: "#94a3b8",
} as const;

/** Per-theme chrome: the parts that must change with the light/dark toggle.
 *
 *  Series colours are chosen to hold on both backgrounds and do not vary, but
 *  axis text does: one compromise grey cannot be readable on both bone (#faf7f2)
 *  and ink (#0a1628), and the previous single value sat at about 2.4:1 on bone.
 */
export interface ChartChrome {
  label: string;
  axisLine: string;
  splitLine: string;
  tooltipBackground: string;
  tooltipBorder: string;
  tooltipText: string;
}

export const LIGHT_CHROME: ChartChrome = {
  label: "#5c5648",
  axisLine: "#d8d0c2",
  splitLine: "#e8e1d5",
  tooltipBackground: "#ffffff",
  tooltipBorder: "#d8d0c2",
  tooltipText: "#0a1628",
};

export const DARK_CHROME: ChartChrome = {
  label: "#a8b2c1",
  axisLine: "#22364f",
  splitLine: "#1a2c44",
  tooltipBackground: "#0f2540",
  tooltipBorder: "#22364f",
  tooltipText: "#e8edf4",
};

/** Shared option skeleton. Callers spread this and override what they need. */
export function baseOption(chrome: ChartChrome) {
  return {
    backgroundColor: "transparent",
    textStyle: { color: chrome.label, fontFamily: "inherit" },
    // Generous bottom and top: the legend sits above the plot and axis names
    // below it, and the previous values let both collide with the tick labels.
    grid: { left: 64, right: 28, top: 44, bottom: 56, containLabel: true },
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: chrome.tooltipBackground,
      borderColor: chrome.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: chrome.tooltipText, fontSize: 12 },
      extraCssText: "box-shadow: 0 4px 16px rgb(10 22 40 / 0.12);",
    },
  };
}

/** Value-axis styling: horizontal rules only, no vertical clutter. */
export function valueAxis(chrome: ChartChrome, name?: string, max?: number) {
  return {
    type: "value" as const,
    name,
    nameTextStyle: { color: chrome.label, fontSize: 11 },
    max,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: chrome.label, fontSize: 11 },
    // Dashed and faint: gridlines are a reading aid, not part of the data.
    splitLine: { lineStyle: { color: chrome.splitLine, type: "dashed" as const } },
  };
}

/** Category-axis styling, with the baseline kept and the rules dropped. */
export function categoryAxis(chrome: ChartChrome, categories: string[]) {
  return {
    type: "category" as const,
    data: categories,
    axisLine: { lineStyle: { color: chrome.axisLine } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: {
      color: chrome.label,
      fontSize: 11,
      // Straight, not rotated. Rotation was making long solver names collide
      // with their neighbours and left a ragged baseline; dropping overlapping
      // labels and keeping the rest horizontal reads better, and the full text
      // is still in the tooltip and the table disclosure.
      hideOverlap: true,
      interval: 0 as const,
    },
  };
}

/** Legend placed above the plot rather than inside it.
 *
 *  ECharts' default puts the legend at the top-centre of the *canvas*, which
 *  with a bottom-anchored layout overlapped the x-axis tick labels — legend
 *  entries were sitting on top of the category names.
 */
export function legend(chrome: ChartChrome, show: boolean) {
  return {
    show,
    top: 0,
    left: "center" as const,
    itemWidth: 12,
    itemHeight: 12,
    itemGap: 18,
    textStyle: { color: chrome.label, fontSize: 11 },
  };
}
