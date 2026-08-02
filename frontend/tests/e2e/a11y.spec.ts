import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Every route without a dynamic [param] segment, i.e. reachable with no prior
// app state. /foldq/runs/[runId] and /reports/[reportId] need a real run to
// exist first (covered functionally by fold.spec.ts instead), and
// /structures/[pdbId] is excluded per the brief: its Mol* canvas is a WebGL
// surface axe has no meaningful rules for.
const ROUTES = [
  "/dashboard",
  "/foldq/new",
  "/foldq/compare",
  "/structures",
  "/analytics/solver-performance",
  "/analytics/energy",
  "/analytics/scaling",
  "/analytics/resources",
  "/analytics/pseudoknots",
  // Added with the pages themselves. A new route that ships without an
  // accessibility check is a route nobody has checked.
  "/analytics/multivariate",
  "/design-theory",
  "/references",
];

for (const route of ROUTES) {
  test(`${route} has no WCAG 2.2 AA violations`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

// The palette defines both themes and the toggle switches between them, so a
// sweep of the default theme alone leaves half the tokens untested. The two
// contrast violations found in review were dark-mode ones, invisible to a
// light-only run.
for (const route of ROUTES) {
  test(`${route} has no WCAG 2.2 AA violations in dark mode`, async ({ page }) => {
    await page.goto(route);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
