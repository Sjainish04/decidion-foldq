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
  await page.getByLabel(/allow pseudoknots/i).check();
  await expect(page.getByText(/precision against a nested reference is capped/i)).toBeVisible();
});
