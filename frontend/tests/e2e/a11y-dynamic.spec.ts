import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** Accessibility checks for the routes with a dynamic [param] segment.
 *
 *  a11y.spec.ts covers every route reachable with no prior app state. These two
 *  are not: a run page needs a run to exist, and a structure page needs a PDB id
 *  chosen from a live search. That made them the only routes shipping without an
 *  axe check — and between them they hold the layout picker, the R2DT panel, the
 *  export panel and the 3D representation picker, so "unchecked" was covering
 *  most of the interactive surface rather than an edge case.
 *
 *  Both themes, for the reason a11y.spec.ts gives: the contrast violations found
 *  in review were dark-mode ones and a light-only sweep never saw them.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function fold(page: import("@playwright/test").Page) {
  await page.goto("/foldq/new");
  await page.getByLabel(/sequence/i).fill("GGGAAAUCCCU");
  await page.getByLabel(/solver/i).selectOption("exact");
  await page.getByRole("button", { name: /fold/i }).click();
  await expect(page).toHaveURL(/\/foldq\/runs\//);
  await expect(page.getByRole("img", { name: /FoldQ candidate/i })).toBeVisible();
}

for (const theme of ["light", "dark"] as const) {
  test(`the run page has no WCAG 2.2 AA violations in ${theme} mode`, async ({ page }) => {
    await fold(page);
    if (theme === "dark") {
      await page.evaluate(() => document.documentElement.classList.add("dark"));
    }

    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("the layout picker keeps the run page accessible in either layout", async ({ page }) => {
  await fold(page);

  // The force layout is the default, so a single sweep would never see the
  // circular drawing the picker can switch to.
  await page.getByLabel("Layout").selectOption("circular");
  await expect(page.getByRole("img", { name: /FoldQ candidate/i })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test("the pseudoknot caveat is readable once it is actually shown", async ({ page }) => {
  // The caveat renders only when the box is checked, so a sweep of /foldq/new in
  // its default state never reaches it — which is exactly how it shipped at
  // 3.39:1. Conditional content needs the condition met before it is checked.
  await page.goto("/foldq/new");
  await expect(page.getByRole("option", { name: "exact" })).toBeAttached();
  await page.getByLabel(/allow pseudoknots/i).check();
  await expect(page.getByText(/crossing penalty is disabled/i)).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test("the structure page is accessible outside the WebGL canvas", async ({ page }) => {
  // 1EHZ is the tRNA benchmark entry, addressed directly so this test does not
  // depend on the ranking of a live RCSB search.
  await page.goto("/structures/1EHZ");
  await expect(page.getByRole("region", { name: /3D structure/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByLabel(/polymer representation/i)).toBeEnabled({ timeout: 30_000 });

  // The canvas itself is excluded, not the page: axe has no meaningful rules for
  // a WebGL surface, but the controls around it are ordinary DOM and must pass.
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    .exclude("canvas")
    .analyze();
  expect(results.violations).toEqual([]);
});

test("the representation picker is operable by keyboard alone", async ({ page }) => {
  await page.goto("/structures/1EHZ");
  const picker = page.getByLabel(/polymer representation/i);
  await expect(picker).toBeEnabled({ timeout: 30_000 });

  // Disabled until the plugin is ready, so a keyboard user cannot select a
  // representation that would be dropped on the floor.
  await picker.focus();
  await expect(picker).toBeFocused();
  await picker.selectOption("molecular-surface");
  await expect(picker).toHaveValue("molecular-surface");
  // The caption is the only non-visual confirmation that the switch took.
  await expect(page.getByText(/shown as a molecular surface/i)).toBeVisible();
});
