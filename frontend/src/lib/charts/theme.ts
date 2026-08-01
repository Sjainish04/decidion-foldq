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
