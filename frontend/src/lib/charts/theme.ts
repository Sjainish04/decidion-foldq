/** Solver-class colours from the design tokens. Charts also vary marker shape so
 *  the encoding is never colour-only. */
export const SOLVER_COLORS: Record<string, string> = {
  random: "#64748b",
  greedy: "#0ea5e9",
  local_search: "#0ea5e9",
  tabu: "#0ea5e9",
  simulated_annealing: "#8b5cf6",
  path_integral_sqa: "#8b5cf6",
  qaoa: "#d946ef",
  cvar_qaoa: "#d946ef",
  exact: "#10b981",
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

export const BASE_CHART_OPTION = {
  backgroundColor: "transparent",
  textStyle: { color: "#94a3b8", fontFamily: "inherit" },
  grid: { left: 56, right: 24, top: 32, bottom: 48 },
  tooltip: { trigger: "axis" as const },
};

/** Literal hex for chart canvases.
 *
 *  ECharts draws to a canvas, where `var(--token)` does not resolve — a CSS
 *  variable passed as a series colour silently renders as the default. These are
 *  the Decidion palette values, mid-toned so they hold against both the bone and
 *  ink backgrounds without needing a per-theme chart option.
 */
export const CHART_COLORS = {
  /** terracotta, darkened to carry meaning as a marked series */
  emphasis: "#c3512c",
  /** brand terracotta, for neutral series fills */
  brand: "#d97757",
  /** brand cyan */
  cool: "#3a7d95",
  /** muted, for de-emphasised points */
  muted: "#8a8578",
  /** green, reserved for "on the frontier" / reference series */
  reference: "#1f7a4d",
  axis: "#94a3b8",
} as const;
