export interface NavItem {
  href: string;
  label: string;
  /** "demo" marks a route rendering fixture data, not measured results. */
  badge?: "demo";
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Command Center" }],
  },
  {
    label: "FoldQ Studio",
    items: [
      { href: "/foldq/new", label: "New Analysis" },
      { href: "/foldq/compare", label: "Compare Runs" },
    ],
  },
  {
    label: "Analytics Lab",
    items: [
      { href: "/analytics/solver-performance", label: "Solver Performance" },
      { href: "/analytics/energy", label: "Energy & Accuracy" },
      { href: "/analytics/scaling", label: "Scaling & Encoding" },
      { href: "/analytics/resources", label: "Quantum Resources" },
      { href: "/analytics/pseudoknots", label: "Pseudoknots" },
    ],
  },
];
