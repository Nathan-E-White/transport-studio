import {expect, test} from "@playwright/test";
import {
  assertNoPageFailures,
  assertStableStudioShell,
  gotoStudio,
  recordPageFailures,
} from "./studioTestHarness";

test("opens the studio shell and runs the main browser flows", async ({page}) => {
  const failures = recordPageFailures(page);

  await gotoStudio(page, failures);

  await expect(page.getByRole("treeitem", {name: "Shield Slab, geometry"})).toBeVisible();
  await expect(page.getByRole("treeitem", {name: "Toy Shield, material"})).toBeVisible();
  await expect(page.getByRole("treeitem", {name: "Photon Beam, source"})).toBeVisible();
  await expect(page.getByRole("treeitem", {name: "Detector Plane, tally"})).toBeVisible();

  await page.getByRole("button", {name: "probe"}).click();
  await expect(page.locator(".viewport-hud.top-left")).toContainText("PROBE MODE");

  await page.getByRole("button", {name: "analyze"}).click();
  await expect(page.locator(".viewport-hud.top-left")).toContainText("ANALYZE MODE");

  await page.getByRole("button", {name: "design"}).click();
  await expect(page.locator(".viewport-hud.top-left")).toContainText("DESIGN MODE");

  await page.getByRole("button", {name: /Run Toy Photons/}).click();
  await expect(page.locator(".viewport-hud.top-left")).toContainText(/64 sampled tracks/);
  await expect(page.locator(".run-dock")).toContainText("visual-ts");

  await page.getByRole("button", {name: "Clear"}).click();
  await expect(page.locator(".viewport-hud.top-left")).toContainText("0 sampled tracks");

  await page.getByRole("button", {name: "Run Native Rust"}).click();
  await expect(page.locator(".run-dock")).toContainText(
    "tally.target.missing: Tally \"Detector Plane\" must define its target entity before compilation.",
  );
  await expect(page.locator(".run-dock")).toContainText(
    "material.density.invalid: Material \"Toy Shield\" must have a finite non-negative density before compilation.",
  );

  await assertStableStudioShell(page, failures);
  await assertNoPageFailures(failures);
});
