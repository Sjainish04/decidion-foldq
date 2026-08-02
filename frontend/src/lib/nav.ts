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
    label: "Models",
    items: [
      { href: "/analytics/energy", label: "Energy & Accuracy" },
      { href: "/analytics/solver-performance", label: "Solver Performance" },
      { href: "/analytics/resources", label: "Quantum Resources" },
    ],
  },
  {
    label: "ML Workflow",
    items: [
      { href: "/foldq/new", label: "New Analysis" },
      { href: "/foldq/compare", label: "Compare Runs" },
      { href: "/dashboard", label: "Command Center" },
    ],
  },
  {
    label: "Design Theory",
    items: [
      { href: "/design-theory", label: "Formulation" },
      { href: "/analytics/scaling", label: "Scaling & Encoding" },
    ],
  },
  {
    label: "Analysis & Data",
    items: [
      { href: "/analytics/multivariate", label: "Multivariate Analysis" },
      { href: "/analytics/pseudoknots", label: "Pseudoknots" },
      { href: "/references", label: "Reference Library" },
      { href: "/structures", label: "PDB Structures" },
    ],
  },
];
