import {
  BookOpen,
  Boxes,
  ChartColumn,
  ChartNetwork,
  Cpu,
  FlaskConical,
  Gauge,
  GitCompareArrows,
  LayoutDashboard,
  Sigma,
  Spline,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

/** One icon per route. Kept apart from `nav.ts` so the navigation itself stays
 *  plain data that tests and the command palette can read without React. */
export const NAV_ICONS: Record<string, LucideIcon> = {
  "/analytics/energy": FlaskConical,
  "/analytics/solver-performance": Gauge,
  "/analytics/resources": Cpu,
  "/foldq/new": Spline,
  "/foldq/compare": GitCompareArrows,
  "/dashboard": LayoutDashboard,
  "/design-theory": Sigma,
  "/analytics/scaling": TrendingUp,
  "/analytics/multivariate": ChartNetwork,
  "/analytics/pseudoknots": ChartColumn,
  "/references": BookOpen,
  "/structures": Boxes,
};
