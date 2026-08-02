import { expect, test } from "@playwright/test";

const ROUTES = [
  "/dashboard",
  "/analytics/solver-performance",
  "/analytics/energy",
  "/analytics/scaling",
  "/analytics/resources",
  "/analytics/pseudoknots",
];

for (const route of ROUTES) {
  test(`${route} renders without the API`, async ({ page, context }) => {
    // The design's degradation guarantee: analytics is bundled data, not a fetch.
    await context.route("**/api/v1/**", (r) => r.abort());
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/results\/full\//).first()).toBeVisible();
  });
}

test("every chart has a table alternative", async ({ page }) => {
  await page.goto("/analytics/solver-performance");
  const disclosures = page.getByText(/view as table/i);
  await expect(disclosures.first()).toBeVisible();
  await disclosures.first().click();
  await expect(page.getByRole("table").first()).toBeVisible();
});
