import { expect, test } from "@playwright/test";

test("folds a sequence end to end and exports the decision card", async ({ page }) => {
  await page.goto("/foldq/new");
  await page.getByLabel(/sequence/i).fill("GGGAAAUCCCU");
  await page.getByLabel(/solver/i).selectOption("exact");
  await page.getByRole("button", { name: /fold/i }).click();

  await expect(page).toHaveURL(/\/foldq\/runs\//);
  await expect(page.getByRole("img", { name: /FoldQ candidate/i })).toBeVisible();
  await expect(page.getByRole("img", { name: /ViennaRNA reference/i })).toBeVisible();
  await expect(page.getByText(/no failure: all gates passed/)).toBeVisible();

  await page.getByRole("link", { name: /decision card/i }).click();
  await expect(page.getByTitle(/decision card/i)).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /download html/i }).click();
  expect((await download).suggestedFilename()).toMatch(/^foldq-.*\.html$/);
});

test("shows the pseudoknot caveat when crossings are allowed", async ({ page }) => {
  await page.goto("/foldq/new");

  // Wait for the page to be interactive before toggling anything. The solver
  // options are fetched client-side, so their presence means React has hydrated
  // and the checkbox's onChange is attached. Clicking earlier flips the DOM
  // checkbox without updating the store, so the caveat never renders -- which is
  // why this passed alone and failed in a full run, where the dev server is busy
  // compiling other routes and hydration lands later.
  await expect(page.getByRole("option", { name: "exact" })).toBeAttached();

  const toggle = page.getByLabel(/allow pseudoknots/i);
  await toggle.check();
  await expect(toggle).toBeChecked();
  await expect(page.getByText(/precision against a nested reference is capped/i)).toBeVisible();
});
