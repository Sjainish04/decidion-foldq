import { expect, test } from "@playwright/test";

test("picks a target, then a structure, views it in 3D, and folds its sequence", async ({
  page,
}) => {
  await page.goto("/structures");
  await expect(page.getByText(/only experimentally determined/i)).toBeVisible();

  await page.getByRole("button", { name: /^tRNA$/ }).click();
  await expect(page.getByRole("button", { name: /^tRNA$/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const first = page.getByRole("article").first();
  await expect(first).toBeVisible();
  await first.getByRole("link").first().click();

  // Both of these depend on a live RCSB round trip plus a client-side route
  // transition (and, in dev, first-visit compilation of the [pdbId] route) —
  // the default 5s expect timeout is tight for that under parallel workers.
  await expect(page).toHaveURL(/\/structures\/[A-Z0-9]{4}/i, { timeout: 15_000 });
  await expect(page.getByRole("link", { name: /view on rcsb/i })).toBeVisible({
    timeout: 15_000,
  });
  // The viewer shell must appear immediately, before WebGL initialises.
  await expect(page.getByRole("region", { name: /3D structure/i })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: /fold this sequence/i }).click();
  await expect(page).toHaveURL(/\/foldq\/new/);
  await expect(page.getByLabel(/sequence/i)).not.toHaveValue("");
});

test("the rest of the app is unaffected when RCSB is unreachable", async ({
  page,
  context,
}) => {
  await context.route("**/api/v1/structures/**", (route) => route.abort());
  await page.goto("/structures");
  await expect(page.getByRole("alert")).toBeVisible();

  await page.goto("/analytics/solver-performance");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("1EHZ carries the sequence the tRNA benchmark uses", async ({ page }) => {
  await page.goto("/structures/1EHZ");
  await expect(page.getByText(/GCGGAUUUAGCUCAG/)).toBeVisible();
  await expect(page.getByText(/X-RAY DIFFRACTION/i)).toBeVisible();
});
